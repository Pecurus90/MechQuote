import math
from collections import defaultdict
from typing import Dict, Optional
from sqlalchemy.orm import Session, joinedload
from app.models import (
    Part, ManufacturingPhase, Quote, Material,
    EdmConfig, EdmCutSpeed, CuttingCycle, Treatment, MaterialSupplier, Supplier,
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

    Si attiva quando la macchina della fase è di tipo `wire_edm` (caratteristica
    fisica della macchina, non etichetta utente — vedi feedback memory). Ritorna
    None se i campi non sono popolati (lascia il valore manuale) o se manca la
    riga di velocità per (famiglia materiale, altezza).
    """
    if not phase.machine or phase.machine.machine_type != 'wire_edm':
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
    if not speed_row or not speed_row.speed_mm_per_min:
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
    base_speed = speed_row.speed_mm_per_min  # mm/min lineari (avanzamento filo)
    pierce_time = speed_row.pierce_time_s if speed_row.pierce_time_s is not None else cfg.default_pierce_time_s

    # Formula corretta (no area-based): lo spessore serve solo al lookup della
    # riga in EdmCutSpeed (range step 10mm: 0-10, 10-20, …). Il tempo di taglio
    # dipende dalla LUNGHEZZA del profilo e dalla velocità lineare per quel
    # range × fattore di passata.
    total_min = 0.0
    for p in cycle.passes:
        factor = factor_for.get(p.pass_type, 1.0)
        speed_pass = base_speed * factor
        if speed_pass > 0:
            total_min += phase.cut_length_mm / speed_pass

    total_min += (phase.n_pierce or 0) * pierce_time / 60.0
    return round(total_min / 60.0, 4)  # ore


def recalculate_part(part_id: int, db: Session) -> None:
    """Wrapper retro-compatibile: ricalcola tutto il preventivo della parte.

    L'aggregazione tra parti (trattamenti batch, spedizioni condivise) richiede
    di vedere i sibling, quindi la logica vive in `recalculate_quote`. Tutti i
    chiamanti esistenti (POST/PUT/DELETE phase, parts, ecc.) continuano a
    invocare `recalculate_part(id)` e ottengono il ricalcolo dell'intero quote.
    """
    part = db.query(Part).filter(Part.id == part_id).first()
    if part:
        recalculate_quote(part.quote_id, db)


def recalculate_quote(quote_id: int, db: Session) -> None:
    """Ricalcola TUTTE le parti del preventivo applicando le aggregazioni
    "commessa" (parti che fisicamente condividono batch o viaggi).

    Aggregazioni:
      - **Costo trattamento + soglia**: per `treatment_id` (stesso prodotto =
        stesso batch). Peso totale = Σ (peso_finito × qty) di tutte le parti
        con quella fase trattamento. Soglia confrontata col totale; costo
        del batch distribuito proporzionale al peso. `variable_cost_per_part`
        sovrascritto.
      - **Spedizione trattamento** (`treatment.supplier.shipping_cost`): per
        `treatment.supplier_id` — anche con trattamenti diversi dallo stesso
        fornitore, il viaggio è uno solo. Distribuita proporzionale al peso.
        `phase.fixed_cost` sovrascritto con la quota.
      - **Spedizione materiale** (`material_supplier.shipping_cost`): per
        `material.supplier_id`. Distribuita proporzionale al peso.
        `part.material_delivery_cost` sovrascritto.

    Per single quote (1 parte) le aggregazioni sono no-op (1 sola parte per
    gruppo): comportamento equivalente al pre-refactor.
    """
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        return

    parts = db.query(Part).filter(Part.quote_id == quote_id).options(
        joinedload(Part.material).joinedload(Material.material_supplier),
        joinedload(Part.phases).joinedload(ManufacturingPhase.machine),
        joinedload(Part.phases).joinedload(ManufacturingPhase.treatment).joinedload(Treatment.supplier),
    ).all()
    if not parts:
        return

    n_parts = len(parts)

    # ─── Pre-aggregazioni ────────────────────────────────────────────────
    # Tutti i pesi sono peso_finito × qty (massa fisica del batch).
    treatment_batch: Dict[int, float] = defaultdict(float)
    treatment_shipping: Dict[int, float] = defaultdict(float)
    material_shipping: Dict[int, float] = defaultdict(float)

    # Conta parti per gruppo (fallback per edge case con peso 0).
    treatment_batch_n: Dict[int, int] = defaultdict(int)
    treatment_shipping_n: Dict[int, int] = defaultdict(int)
    material_shipping_n: Dict[int, int] = defaultdict(int)

    for p in parts:
        weight = (p.finished_weight_kg or 0.0) * (p.quantity or 1)
        if p.material and p.material.supplier_id:
            material_shipping[p.material.supplier_id] += weight
            material_shipping_n[p.material.supplier_id] += 1
        for ph in p.phases:
            if ph.treatment_id and ph.treatment:
                treatment_batch[ph.treatment_id] += weight
                treatment_batch_n[ph.treatment_id] += 1
                if ph.treatment.supplier_id:
                    treatment_shipping[ph.treatment.supplier_id] += weight
                    treatment_shipping_n[ph.treatment.supplier_id] += 1

    # ─── Calcolo per ogni parte ──────────────────────────────────────────
    for part in parts:
        qty = part.quantity or 1
        weight = (part.finished_weight_kg or 0.0) * qty

        # Costo materiale (invariato).
        if part.material_id and part.material:
            recomputed = _compute_material_cost(part, part.material)
            if recomputed is not None:
                part.material_cost = recomputed

        # Spedizione materiale: quota di parte = supplier.shipping × peso/totale.
        # Sovrascrive part.material_delivery_cost (single source of truth backend).
        if part.material and part.material.material_supplier:
            sup = part.material.material_supplier
            sup_id = part.material.supplier_id
            total_w = material_shipping.get(sup_id, 0.0)
            n_grp = material_shipping_n.get(sup_id, 1)
            if total_w > 0:
                share = (sup.shipping_cost or 0.0) * weight / total_w
            else:
                # Edge case: nessun peso → distribuisci in parti uguali nel gruppo.
                share = (sup.shipping_cost or 0.0) / max(n_grp, 1)
            part.material_delivery_cost = round(share, 4)

        delivery_per_piece = (part.material_delivery_cost or 0.0) / qty
        cutting_per_piece = (
            part.material.material_supplier.cutting_cost_per_part or 0.0
            if part.material and part.material.material_supplier else 0.0
        )

        phase_total_per_piece = 0.0
        for phase in part.phases:
            # Wire EDM autocalc (invariato).
            edm_hours = _compute_edm_cycle_hours(phase, part, db)
            if edm_hours is not None:
                phase.cycle_hours_per_part = edm_hours

            # Trattamento: aggregazione per treatment_id.
            if phase.treatment_id and phase.treatment:
                t = phase.treatment
                batch_w = treatment_batch.get(phase.treatment_id, 0.0)
                n_grp = treatment_batch_n.get(phase.treatment_id, 1)

                below_threshold = (
                    t.minimum_weight_kg and t.minimum_weight_kg > 0
                    and batch_w < t.minimum_weight_kg
                )
                total_batch_cost = (
                    (t.minimum_cost or 0.0) if below_threshold
                    else (t.cost_per_kg or 0.0) * batch_w
                )

                if batch_w > 0:
                    part_share = total_batch_cost * weight / batch_w
                else:
                    part_share = total_batch_cost / max(n_grp, 1)
                phase.variable_cost_per_part = round(part_share / qty, 4)

                # Spedizione trattamento (per supplier_id).
                if t.supplier_id and t.supplier:
                    ship_w = treatment_shipping.get(t.supplier_id, 0.0)
                    ship_n = treatment_shipping_n.get(t.supplier_id, 1)
                    if ship_w > 0:
                        ship_share = (t.supplier.shipping_cost or 0.0) * weight / ship_w
                    else:
                        ship_share = (t.supplier.shipping_cost or 0.0) / max(ship_n, 1)
                    phase.fixed_cost = round(ship_share, 4)

            # Rate split (Sprint 12).
            work_rate = phase.hourly_rate_override
            if work_rate is None:
                work_rate = phase.machine.hourly_rate if phase.machine else 0.0
            if phase.machine and phase.machine.setup_hourly_rate is not None:
                setup_rate = phase.machine.setup_hourly_rate
            else:
                setup_rate = work_rate

            # is_shared resta valido per setup_hours (es. setup macchina che
            # serve a tutta la commessa). Per fasi treatment il fixed_cost è
            # già "quota di parte" (distribuito sopra), quindi divisor=qty.
            divisor = qty * (n_parts if phase.is_shared else 1)

            cost_per_piece = (
                (phase.setup_hours or 0.0) * setup_rate / divisor
                + (phase.cycle_hours_per_part or 0.0) * work_rate
                + (phase.fixed_cost or 0.0) / divisor
                + (phase.variable_cost_per_part or 0.0)
            )
            phase.calculated_cost = round(cost_per_piece, 4)
            phase_total_per_piece += phase.calculated_cost

        margin = part.margin_percent
        if margin is None:
            margin = quote.global_margin_percent if quote else 20.0

        part.total_cost = round(
            (part.material_cost or 0.0) + delivery_per_piece + cutting_per_piece + phase_total_per_piece, 4
        )

        minimum = part.minimum_price or 0.0
        part.unit_price = round(max(part.total_cost, minimum) * (1 + margin / 100), 2)
        part.total_price = round(part.unit_price * qty, 2)

    db.commit()
