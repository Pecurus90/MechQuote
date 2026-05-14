import math
from collections import defaultdict
from typing import Dict, Optional
from sqlalchemy.orm import Session, joinedload
from app.models import (
    Part, ManufacturingPhase, Quote, Material,
    EdmConfig, EdmCutSpeed, CuttingCycle, Treatment, MaterialSupplier, Supplier,
    CompanySettings,
)


def _raw_weight_kg(part: Part) -> float:
    """Peso del grezzo (kg) di una singola unità della parte.

    Usato per distribuire la spedizione del fornitore materiale (la materia
    prima viaggia come grezzo, non come pezzo finito). 0 se mancano dimensioni
    o densità materiale: in quel caso il chiamante fa fallback a distribuzione
    equa per numero di parti.
    """
    if not part.material:
        return 0.0
    density = part.material.density_kg_dm3 or 0
    if not density:
        return 0.0
    if part.raw_diameter_mm:
        r = part.raw_diameter_mm / 2
        l = part.raw_z_mm or 0
        if not r or not l:
            return 0.0
        vol_dm3 = (math.pi * r * r * l) / 1_000_000
        return vol_dm3 * density
    x = part.raw_x_mm or 0
    y = part.raw_y_mm or 0
    z = part.raw_z_mm or 0
    if not x or not y or not z:
        return 0.0
    vol_dm3 = (x * y * z) / 1_000_000
    return vol_dm3 * density


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

    # CompanySettings singleton — letto 1 volta per riusare gli override
    # `stock_shipping_cost` / `stock_cutting_cost_per_part` quando una parte
    # ha `material_from_stock=True`.
    cs = db.query(CompanySettings).filter(CompanySettings.id == 1).first()
    stock_ship = (cs.stock_shipping_cost if cs else 0.0) or 0.0
    stock_cut = (cs.stock_cutting_cost_per_part if cs else 0.0) or 0.0

    for p in parts:
        qty_p = p.quantity or 1
        # Pesi distinti per dominio:
        #  - Spedizione materiale → peso GREZZO (la materia prima viaggia come
        #    grezzo dal fornitore). Calcolato dal grezzo (raw_x×raw_y×raw_z o
        #    cilindro) × densità. Se l'utente non ha compilato dimensioni
        #    grezzo o densità, raw_w resta 0 (gestito dal fallback equo).
        #  - Trattamento (batch + spedizione) → peso PEZZO FINITO (il pezzo
        #    arriva al trattamentista già lavorato).
        finished_w = (p.finished_weight_kg or 0.0) * qty_p
        raw_w = _raw_weight_kg(p) * qty_p
        # Conto lavoro o materiale a magazzino: la parte NON entra nel batch
        # spedizione del fornitore abituale (in entrambi i casi non usa
        # spedizione del fornitore materiale).
        if (p.material and p.material.supplier_id
                and not p.customer_supplied_material
                and not p.material_from_stock):
            material_shipping[p.material.supplier_id] += raw_w
            material_shipping_n[p.material.supplier_id] += 1
        for ph in p.phases:
            if ph.treatment_id and ph.treatment:
                treatment_batch[ph.treatment_id] += finished_w
                treatment_batch_n[ph.treatment_id] += 1
                if ph.treatment.supplier_id:
                    treatment_shipping[ph.treatment.supplier_id] += finished_w
                    treatment_shipping_n[ph.treatment.supplier_id] += 1

    # ─── Calcolo per ogni parte ──────────────────────────────────────────
    for part in parts:
        qty = part.quantity or 1
        # Pesi separati per dominio (vedi commento in pre-aggregazione).
        finished_weight = (part.finished_weight_kg or 0.0) * qty
        raw_weight = _raw_weight_kg(part) * qty

        # Conto lavoro: materiale fornito dal cliente → tutti i costi
        # materia (grezzo + spedizione + taglio) vanno a zero per la parte.
        # Info dimensionali e material_id restano popolati (utili per
        # autocalc EDM, PDF).
        if part.customer_supplied_material:
            part.material_cost = 0.0
            part.material_delivery_cost = 0.0
            delivery_per_piece = 0.0
            cutting_per_piece = 0.0
        elif part.material_from_stock:
            # Materiale a magazzino: grezzo applicato normalmente, shipping e
            # cutting del fornitore sostituiti dagli override CompanySettings.
            if part.material_id and part.material:
                recomputed = _compute_material_cost(part, part.material)
                if recomputed is not None:
                    part.material_cost = recomputed
            part.material_delivery_cost = round(stock_ship, 4)
            delivery_per_piece = stock_ship / qty
            cutting_per_piece = stock_cut
        else:
            # Costo materiale (calcolato da volume × densità × €/kg × scrap).
            if part.material_id and part.material:
                recomputed = _compute_material_cost(part, part.material)
                if recomputed is not None:
                    part.material_cost = recomputed

            # Spedizione materiale: quota proporzionale al peso GREZZO della
            # parte. La materia prima viaggia come grezzo dal fornitore (non
            # come pezzo finito). Formula: quota = shipping × raw_w / Σraw_w.
            # Se raw_w=0 (utente sta ancora compilando dimensioni grezzo) la
            # parte riceve quota 0; le altre parti del gruppo coprono comunque
            # il viaggio nelle loro quote proporzionali. Niente fallback equo:
            # quando una parte non ha peso, non deve "comparire" la spedizione.
            if part.material and part.material.material_supplier:
                sup = part.material.material_supplier
                sup_id = part.material.supplier_id
                total_w = material_shipping.get(sup_id, 0.0)
                if total_w > 0:
                    share = (sup.shipping_cost or 0.0) * raw_weight / total_w
                else:
                    share = 0.0
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

            # Trattamento: aggregazione per treatment_id (peso PEZZO FINITO).
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
                    part_share = total_batch_cost * finished_weight / batch_w
                else:
                    # batch_w=0 → tutte le parti del gruppo hanno peso 0:
                    # stato invalido temporaneo (treatment selezionato ma peso
                    # finito non compilato). Frontend mostra warning rosso sul
                    # campo peso. Costo a 0 in attesa che l'utente compili.
                    part_share = 0.0
                phase.variable_cost_per_part = round(part_share / qty, 4)

                # Spedizione trattamento: quota proporzionale al peso PEZZO
                # FINITO della parte. Formula: quota = shipping × fw / Σfw.
                # Regola di business: se c'è un trattamento selezionato, il
                # peso finito DEVE essere compilato dall'utente (il frontend
                # mostra warning rosso quando treatment_id senza peso). Se
                # peso=0, la quota è 0 (stato invalido temporaneo); senza
                # fallback equo, è chiaro all'utente che manca un dato.
                if t.supplier_id and t.supplier:
                    ship_w = treatment_shipping.get(t.supplier_id, 0.0)
                    if ship_w > 0:
                        ship_share = (t.supplier.shipping_cost or 0.0) * finished_weight / ship_w
                    else:
                        ship_share = 0.0
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
