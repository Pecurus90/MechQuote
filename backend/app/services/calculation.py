from collections import defaultdict
from typing import Dict, Optional, Tuple
from sqlalchemy.orm import Session, joinedload
from app.core.database import utc_now
from app.models import (
    Part, ManufacturingPhase, Quote, Material, Machine,
    EdmConfig, EdmCutSpeed, CuttingCycle, Treatment, MaterialSupplier, Supplier,
    CompanySettings, DrillingTime, Electrode,
)
from app.services.costing.primitives import (
    round4 as _round4, phase_cost, part_totals, treatment_cost_per_part,
    material_cost as _compute_material_cost,
    raw_volume_dm3 as _raw_volume_dm3,
    raw_weight_kg as _raw_weight_kg,
    quote_total as _quote_total,
)


def _apply_quote_final_total(quote: Quote, parts) -> None:
    """Calcola e persiste `quote.final_total` (B1) — la fonte unica del totale.

    Σ prezzi parte + trasporto + imballaggio − sconto globale (gemello di
    `quoteCalc.calcQuoteTotal`). Va chiamata DOPO che i totali parte sono
    aggiornati.
    """
    parts_sum = sum((p.total_price or 0.0) for p in parts)
    quote.final_total = _quote_total(
        parts_total_price_sum=parts_sum,
        transport_cost=quote.transport_cost,
        packaging_cost=quote.packaging_cost,
        global_discount_percent=quote.global_discount_percent,
    )


def recompute_final_total(quote_id: int, db: Session) -> None:
    """Ricalcola SOLO `final_total` (senza toccare i totali parte) e committa.

    Usato da `update_quote` quando cambiano campi di prezzo a livello preventivo
    (sconto/trasporto/imballaggio, e margine per gli stampi) che non richiedono
    un recalc completo delle parti. Per il margine su preventivi standard il
    chiamante usa invece `recalculate_quote` (i totali parte dipendono dal
    margine globale).
    """
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        return
    parts = db.query(Part).filter(Part.quote_id == quote_id).all()
    _apply_quote_final_total(quote, parts)
    db.commit()


def _compute_edm_hours_pure(
    cut_length_mm: float,
    cut_height_mm: float,
    material_family: Optional[str],
    cycle_id: Optional[int],
    n_pierce: int,
    db: Session,
) -> Optional[float]:
    """Calcola ore EDM filo da geometria pura, decoupled da Phase/Part.

    Riusato sia dal cost engine standard (wrapper `_compute_edm_cycle_hours`)
    sia dalla stima ore EDM per piastre stampo (`_estimate_die_edm_hours`).

    Ritorna None se mancano dati per il lookup (no family, no cycle, no riga
    velocità per range altezza). In quel caso il chiamante usa fallback.
    """
    if not cut_length_mm or not cut_height_mm or not cycle_id or not material_family:
        return None

    cfg = db.query(EdmConfig).filter(EdmConfig.id == 1).first()
    if not cfg:
        return None

    # Lookup velocità per famiglia × range altezza.
    speed_row = db.query(EdmCutSpeed).filter(
        EdmCutSpeed.material_family == material_family,
        EdmCutSpeed.thickness_min_mm <= cut_height_mm,
        EdmCutSpeed.thickness_max_mm >= cut_height_mm,
    ).first()
    if not speed_row or not speed_row.speed_mm_per_min:
        return None

    cycle = db.query(CuttingCycle).options(joinedload(CuttingCycle.passes)).filter(
        CuttingCycle.id == cycle_id
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

    # Formula: lo spessore serve solo al lookup della riga EdmCutSpeed (range step
    # 10mm). Tempo di taglio = lunghezza profilo / (velocità × factor passata).
    total_min = 0.0
    for p in cycle.passes:
        factor = factor_for.get(p.pass_type, 1.0)
        speed_pass = base_speed * factor
        if speed_pass > 0:
            total_min += cut_length_mm / speed_pass

    total_min += (n_pierce or 0) * pierce_time / 60.0
    return round(total_min / 60.0, 4)  # ore


def _compute_edm_cycle_hours(phase: ManufacturingPhase, part: Part, db: Session) -> Optional[float]:
    """Wrapper retro-compatibile: estrae i parametri da Phase+Part e delega
    a `_compute_edm_hours_pure`. Si attiva solo se la macchina della fase è
    di tipo `wire_edm` (caratteristica fisica, non etichetta utente)."""
    if not phase.machine or phase.machine.machine_type != 'wire_edm':
        return None
    if not part.material_id:
        return None
    material = db.query(Material).filter(Material.id == part.material_id).first()
    if not material or not material.family:
        return None
    return _compute_edm_hours_pure(
        cut_length_mm=phase.cut_length_mm or 0.0,
        cut_height_mm=phase.cut_height_mm or 0.0,
        material_family=material.family,
        cycle_id=phase.cutting_cycle_id,
        n_pierce=phase.n_pierce or 0,
        db=db,
    )


def _compute_drill_edm(
    phase: ManufacturingPhase, part: Part, db: Session
) -> Optional[Tuple[Optional[float], Optional[float]]]:
    """TD-7 — foratura a elettrodo: ritorna (ore_ciclo, costo_elettrodo_per_pezzo).

    Gemello di `_compute_edm_cycle_hours` per il wire. Si attiva SOLO se la
    macchina della fase è la foratrice designata in `EdmConfig`
    (`default_drilling_machine_id`). Ritorna:
      - `None` se la fase NON è di foratura (nessun override: valori manuali intatti);
      - `(ore, costo)` se lo è. Ogni componente può essere `None` singolarmente
        se manca il dato per calcolarlo (es. nessuna riga DrillingTime o Electrode).

    Formule (n=n° fori, d=profondità, per pezzo):
      ore   = n × d / speed(famiglia, Ø) / 3600      (speed da DrillingTime, mm/s)
      cons. = n × d × wear × (1 + margin/100)  [mm]  (wear/margin da EdmConfig)
      costo = cons × (price / length)  [€]           (€/mm da Electrode per quel Ø)
    """
    cfg = db.query(EdmConfig).filter(EdmConfig.id == 1).first()
    if not cfg or not cfg.default_drilling_machine_id:
        return None
    if not phase.machine or phase.machine.id != cfg.default_drilling_machine_id:
        return None

    n = phase.n_holes or 0
    depth = phase.drill_depth_mm or 0.0
    dia = phase.electrode_diameter_mm
    if n <= 0 or depth <= 0 or not dia:
        return (None, None)   # è foratura ma mancano input → non sovrascrivere

    # Tempo: velocità discreta per (famiglia, Ø elettrodo).
    hours: Optional[float] = None
    material = db.query(Material).filter(Material.id == part.material_id).first() if part.material_id else None
    family = material.family if material else None
    if family:
        speed = db.query(DrillingTime).filter(
            DrillingTime.material_family == family,
            DrillingTime.electrode_diameter_mm == dia,
        ).first()
        if speed and speed.speed_mm_per_sec:
            hours = round(n * depth / speed.speed_mm_per_sec / 3600.0, 4)

    # Costo elettrodo: €/mm dal catalogo Electrode per quel Ø.
    elec_cost: Optional[float] = None
    electrode = db.query(Electrode).filter(Electrode.diameter_mm == dia).first()
    if electrode and electrode.length_mm and electrode.price is not None:
        cost_per_mm = electrode.price / electrode.length_mm
        wear = cfg.electrode_wear_factor if cfg.electrode_wear_factor is not None else 2.0
        margin = cfg.electrode_margin_percent if cfg.electrode_margin_percent is not None else 5.0
        consumo_mm = n * depth * wear * (1.0 + margin / 100.0)
        elec_cost = _round4(consumo_mm * cost_per_mm)

    return (hours, elec_cost)


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
      - **Costo trattamento + soglia**: per `(treatment_id, material_id)`.
        Stesso fornitore + stesso trattamento + materiali diversi = batch
        SEPARATI: ogni materiale ha caratteristiche fisiche diverse
        (temprabilità, durezza, conducibilità) e va processato in commessa
        separata nel forno. Peso = Σ (peso_finito × qty) per gruppo.
        Soglia confrontata sul totale del SUO batch; costo distribuito
        proporzionale al peso. `variable_cost_per_part` sovrascritto.
      - **Spedizione trattamento** (`treatment.supplier.shipping_cost`): per
        `treatment.supplier_id` — anche con trattamenti diversi o materiali
        diversi dello stesso fornitore, il viaggio è uno solo. Distribuita
        proporzionale al peso finito. `phase.fixed_cost` sovrascritto.
      - **Spedizione materiale** (`material_supplier.shipping_cost`): per
        `material.supplier_id`. Distribuita proporzionale al peso grezzo.
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
    # Costo trattamento: chiave (treatment_id, material_id) — materiali diversi
    # = batch separati nel forno. Spedizioni: chiave supplier_id — fornitore
    # = 1 viaggio per tutta la commessa (anche con materiali/trattamenti misti).
    treatment_batch: Dict[Tuple[int, Optional[int]], float] = defaultdict(float)
    # Modulo Stampi: per trattamenti con cost_unit='dm3' aggregiamo anche il
    # volume del batch (dm³). Riusato per distribuire la quota part_share
    # proporzionale al volume invece che al peso.
    treatment_batch_volume: Dict[Tuple[int, Optional[int]], float] = defaultdict(float)
    treatment_shipping: Dict[int, float] = defaultdict(float)
    material_shipping: Dict[int, float] = defaultdict(float)

    # Conta parti material_from_stock: la spedizione magazzino (stock_ship)
    # va distribuita tra le parti che ne usufruiscono (1 prelievo dal
    # magazzino diviso, coerente con gli altri supplier).
    n_from_stock = 0

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
        if p.material_from_stock and not p.customer_supplied_material:
            n_from_stock += 1
        # Volume parte (dm³) × qty — usato da trattamenti con cost_unit='dm3'.
        # C1: per i pezzi tondi (raw_diameter_mm) si usa la formula del cilindro,
        # altrimenti raw_x × raw_y × raw_z. Vedi _raw_volume_dm3.
        part_vol_dm3 = _raw_volume_dm3(p) * qty_p
        for ph in p.phases:
            if ph.treatment_id and ph.treatment:
                # Chiave batch (treatment_id, material_id): stesso trattamento
                # ma materiali diversi = batch separati per il fornitore.
                batch_key = (ph.treatment_id, p.material_id)
                treatment_batch[batch_key] += finished_w
                treatment_batch_volume[batch_key] += part_vol_dm3
                if ph.treatment.supplier_id:
                    # Spedizione trattamento: per supplier_id (1 viaggio).
                    treatment_shipping[ph.treatment.supplier_id] += finished_w

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
            # Lo `stock_ship` è "1 prelievo dal magazzino" diviso equamente
            # tra le parti from_stock del preventivo (coerente con la
            # distribuzione per supplier degli altri materiali).
            if part.material_id and part.material:
                recomputed = _compute_material_cost(part, part.material)
                if recomputed is not None:
                    part.material_cost = recomputed
            stock_ship_share = stock_ship / max(n_from_stock, 1)
            part.material_delivery_cost = _round4(stock_ship_share)
            delivery_per_piece = stock_ship_share / qty
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
                part.material_delivery_cost = _round4(share)

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

            # TD-7 — Foratura a elettrodo (fase sulla foratrice designata):
            # autocalc ore + consumo elettrodo. Additivo; sovrascrive solo i
            # campi calcolabili, lasciando intatti i manuali se manca un dato.
            drill = _compute_drill_edm(phase, part, db)
            if drill is not None:
                d_hours, d_elec = drill
                if d_hours is not None:
                    phase.cycle_hours_per_part = d_hours
                if d_elec is not None:
                    phase.variable_cost_per_part = d_elec

            # Trattamento: aggregazione per (treatment_id, material_id).
            # Peso finito + costo proporzionale al peso del batch del proprio
            # gruppo (stesso trattamento E stesso materiale).
            if phase.treatment_id and phase.treatment:
                t = phase.treatment
                batch_key = (phase.treatment_id, part.material_id)
                # Formula pura in costing.primitives.treatment_cost_per_part
                # (soglia sul peso del batch; distribuzione per peso €/kg o
                # volume €/dm³). Le aggregazioni del batch sono pre-calcolate
                # sopra. batch_w=0 → quota 0 (stato invalido temporaneo: peso
                # non compilato; il frontend mostra warning rosso).
                phase.variable_cost_per_part = treatment_cost_per_part(
                    cost_unit=t.cost_unit,
                    cost_per_kg=t.cost_per_kg,
                    cost_per_dm3=t.cost_per_dm3,
                    minimum_weight_kg=t.minimum_weight_kg,
                    minimum_cost=t.minimum_cost,
                    batch_weight_kg=treatment_batch.get(batch_key, 0.0),
                    batch_volume_dm3=treatment_batch_volume.get(batch_key, 0.0),
                    my_weight_kg=finished_weight,
                    my_volume_dm3=_raw_volume_dm3(part) * qty,
                    qty=qty,
                )

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
                    phase.fixed_cost = _round4(ship_share)

            # Rate split (Sprint 12): work_rate = override ?? machine.hourly_rate,
            # con guardia `or 0.0` (macchina senza tariffa → 0, gemello del
            # frontend `?? 0`: evita crash se hourly_rate è NULL). setup_rate =
            # machine.setup_hourly_rate ?? work_rate. La formula pura sta in
            # costing.primitives.phase_cost (divisor = qty, is_shared rimosso).
            work_rate = phase.hourly_rate_override
            if work_rate is None:
                work_rate = phase.machine.hourly_rate if phase.machine else 0.0
            work_rate = work_rate or 0.0
            if phase.machine and phase.machine.setup_hourly_rate is not None:
                setup_rate = phase.machine.setup_hourly_rate
            else:
                setup_rate = work_rate

            phase.calculated_cost = phase_cost(
                setup_hours=phase.setup_hours,
                cycle_hours_per_part=phase.cycle_hours_per_part,
                fixed_cost=phase.fixed_cost,
                variable_cost_per_part=phase.variable_cost_per_part,
                work_rate=work_rate,
                setup_rate=setup_rate,
                qty=qty,
            )
            phase_total_per_piece += phase.calculated_cost

        margin = part.margin_percent
        if margin is None:
            # `quote` è garantito non-None (recalculate_quote fa early-return
            # se il preventivo non esiste): niente fallback hardcoded.
            margin = quote.global_margin_percent

        # Totali parte: formula pura in costing.primitives.part_totals
        # (C4: niente doppio arrotondamento; gemello di quoteCalc.calcPartTotals).
        part.total_cost, part.unit_price, part.total_price = part_totals(
            material_cost=part.material_cost,
            delivery_per_piece=delivery_per_piece,
            cutting_per_piece=cutting_per_piece,
            phase_total=phase_total_per_piece,
            minimum_price=part.minimum_price,
            margin_percent=margin,
            qty=qty,
        )

    # B1 — totale finale persistito (fonte unica archivio/dashboard).
    _apply_quote_final_total(quote, parts)

    # Optimistic locking: `updated_at` è la versione dell'INTERO aggregato
    # preventivo (parti + fasi comprese). Bump esplicito qui — che scriviamo una
    # parte o una fase, il ricalcolo passa sempre di qui — così l'editor può
    # rilevare che un'altra persona ha modificato e avvisare prima di
    # sovrascrivere (last-write-wins silente, spec Blocco B).
    quote.updated_at = utc_now()

    db.commit()
