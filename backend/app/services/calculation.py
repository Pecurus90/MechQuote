import math
from typing import Optional
from sqlalchemy.orm import Session, joinedload
from app.models import (
    Part, ManufacturingPhase, Quote, Material,
    EdmConfig, EdmCutSpeed, CuttingCycle,
)


def _compute_material_cost(part: Part, material: Optional[Material]) -> Optional[float]:
    """Costo materiale grezzo per pezzo (€) calcolato da volume × densità × €/kg × scrap.

    Gemello DRY di frontend/src/lib/quoteCalc.ts calcMaterialCost — devono restare
    identici. Modalità:
      - tondo: raw_diameter_mm + raw_z_mm (lunghezza barra)
      - prismatico: raw_x_mm × raw_y_mm × raw_z_mm

    Ritorna None quando i dati sono insufficienti (no material, dimensioni mancanti):
    in quel caso il chiamante mantiene il valore già salvato.
    """
    if not material:
        return None
    scrap = 1 + (material.default_scrap_percent or 10) / 100
    density = material.density_kg_dm3 or 0
    cost_per_kg = material.cost_per_kg or 0

    if part.raw_diameter_mm:
        r = part.raw_diameter_mm / 2
        l = part.raw_z_mm or 0
        if not r or not l:
            return None
        vol_dm3 = (math.pi * r * r * l) / 1_000_000
        kg = vol_dm3 * density
        return round(kg * cost_per_kg * scrap, 2)

    x = part.raw_x_mm or 0
    y = part.raw_y_mm or 0
    z = part.raw_z_mm or 0
    if not x or not y or not z:
        return None
    vol_dm3 = (x * y * z) / 1_000_000
    kg = vol_dm3 * density
    return round(kg * cost_per_kg * scrap, 2)


def _compute_edm_cycle_hours(phase: ManufacturingPhase, part: Part, db: Session) -> Optional[float]:
    """Calcola cycle_hours_per_part per una fase Wire EDM, dato lunghezza/altezza/ciclo.

    Ritorna None se i campi non sono popolati (lascia il valore manuale) o se manca
    la riga di velocità per (famiglia materiale, altezza) di questa fase.
    """
    if phase.phase_type != 'wire_edm':
        return None
    if not (phase.cut_length_mm and phase.cut_height_mm and phase.cutting_cycle_id):
        return None
    if not part.material_id:
        return None

    cfg = db.query(EdmConfig).filter(EdmConfig.id == 1).first()
    if not cfg:
        return None

    # Lookup velocità per famiglia: una riga famiglia copre tutti i materiali
    # della stessa famiglia (acciaio_inox, alluminio, …). Se il materiale non ha
    # famiglia categorizzata, niente auto-calc.
    material = db.query(Material).filter(Material.id == part.material_id).first()
    if not material or not material.family:
        return None

    speed_row = db.query(EdmCutSpeed).filter(
        EdmCutSpeed.material_family == material.family,
        EdmCutSpeed.thickness_min_mm <= phase.cut_height_mm,
        EdmCutSpeed.thickness_max_mm >= phase.cut_height_mm,
    ).first()
    if not speed_row or not speed_row.speed_mm2_min:
        return None

    cycle = db.query(CuttingCycle).options(joinedload(CuttingCycle.passes)).filter(
        CuttingCycle.id == phase.cutting_cycle_id
    ).first()
    if not cycle or not cycle.passes:
        return None

    factor_for = {
        'rough': cfg.rough_speed_factor,
        'semi': cfg.semi_speed_factor,
        'finish': cfg.finish_speed_factor,
    }
    base_speed = speed_row.speed_mm2_min
    pierce_time = speed_row.pierce_time_s if speed_row.pierce_time_s is not None else cfg.default_pierce_time_s
    area_mm2 = phase.cut_length_mm * phase.cut_height_mm

    total_min = 0.0
    for p in cycle.passes:
        factor = factor_for.get(p.pass_type, 1.0)
        speed_pass = base_speed * factor
        if speed_pass > 0:
            total_min += area_mm2 / speed_pass

    total_min += (phase.n_pierce or 0) * pierce_time / 60.0
    return round(total_min / 60.0, 4)  # ore


def recalculate_part(part_id: int, db: Session) -> None:
    """Recalculate all phase costs and part totals for a given part.

    phase.calculated_cost = cost per piece (setup/fixed amortized over qty × n_parts if is_shared).
    part.total_price      = unit_price × qty (no double-counting).
    """
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        return

    qty = part.quantity or 1
    quote = db.query(Quote).filter(Quote.id == part.quote_id).first()
    n_parts = db.query(Part).filter(Part.quote_id == part.quote_id).count() if quote else 1

    # Costo materiale: ricalcolo se ho dimensioni grezzo + materiale.
    # Single source of truth backend (DRY hard rule CLAUDE.md §1) — il frontend
    # ricalcola in live preview, ma il valore canonico passa da qui.
    if part.material_id and part.material:
        recomputed_material = _compute_material_cost(part, part.material)
        if recomputed_material is not None:
            part.material_cost = recomputed_material

    phases = db.query(ManufacturingPhase).filter(
        ManufacturingPhase.part_id == part_id
    ).options(
        joinedload(ManufacturingPhase.machine),
        joinedload(ManufacturingPhase.treatment),
    ).all()

    phase_total_per_piece = 0.0
    for phase in phases:
        # Wire EDM: se i campi extra sono popolati, ricalcola cycle_hours_per_part
        # automaticamente in base a lunghezza × altezza × ciclo passate / velocità.
        edm_hours = _compute_edm_cycle_hours(phase, part, db)
        if edm_hours is not None:
            phase.cycle_hours_per_part = edm_hours

        # Treatment phases: recalculate variable_cost_per_part dynamically
        # so that qty changes are reflected correctly (forfait splits across pieces)
        if phase.treatment_id and phase.treatment:
            t = phase.treatment
            total_weight = (part.finished_weight_kg or 0.0) * qty
            below_threshold = (
                t.minimum_weight_kg and t.minimum_weight_kg > 0
                and total_weight < t.minimum_weight_kg
            )
            if below_threshold:
                total_batch_cost = t.minimum_cost or 0.0
            else:
                total_batch_cost = (t.cost_per_kg or 0.0) * total_weight
            phase.variable_cost_per_part = round(total_batch_cost / max(qty, 1), 4)

        rate = phase.hourly_rate_override
        if rate is None:
            rate = phase.machine.hourly_rate if phase.machine else 0.0

        divisor = qty * (n_parts if phase.is_shared else 1)

        cost_per_piece = (
            (phase.setup_hours or 0.0) * rate / divisor
            + (phase.cycle_hours_per_part or 0.0) * rate
            + (phase.fixed_cost or 0.0) / divisor
            + (phase.variable_cost_per_part or 0.0)
        )
        phase.calculated_cost = round(cost_per_piece, 4)
        phase_total_per_piece += phase.calculated_cost

    margin = part.margin_percent
    if margin is None:
        margin = quote.global_margin_percent if quote else 20.0

    delivery_per_piece = (part.material_delivery_cost or 0.0) / qty
    cutting_per_piece = (
        part.material.material_supplier.cutting_cost_per_part or 0.0
        if part.material and part.material.material_supplier else 0.0
    )
    part.total_cost = round(
        (part.material_cost or 0.0) + delivery_per_piece + cutting_per_piece + phase_total_per_piece, 4
    )

    minimum = part.minimum_price or 0.0
    part.unit_price = round(max(part.total_cost, minimum) * (1 + margin / 100), 2)
    part.total_price = round(part.unit_price * qty, 2)

    db.commit()
