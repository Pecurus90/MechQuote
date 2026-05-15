import math
from collections import defaultdict
from typing import Dict, Optional, Tuple
from sqlalchemy.orm import Session, joinedload
from app.models import (
    Part, ManufacturingPhase, Quote, Material,
    EdmConfig, EdmCutSpeed, CuttingCycle, Treatment, MaterialSupplier, Supplier,
    CompanySettings, DieSettings, DieDimensionBracket,
)


def _round4(x: float) -> float:
    """Arrotonda a 4 decimali half-away-from-zero (gemello Math.round JS).

    Python `round()` usa banker's rounding (half-to-even): 0.5 → 0, 1.5 → 2.
    Math.round() in V8/Chromium usa half-away-from-zero: 0.5 → 1, 1.5 → 2.
    Per allineare il backend al frontend (DRY hard rule cost engine), usiamo
    questa utility ovunque si arrotondi a 4 decimali per il preview UI.
    Per i totali a 2 decimali (unit_price, total_price) la differenza è sotto
    la sensibilità monetaria, restano `round(x, 2)`.
    """
    if x >= 0:
        return int(x * 10000 + 0.5) / 10000
    return -int(-x * 10000 + 0.5) / 10000


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
    treatment_shipping: Dict[int, float] = defaultdict(float)
    material_shipping: Dict[int, float] = defaultdict(float)

    # Conta parti per gruppo (fallback per edge case con peso 0).
    treatment_batch_n: Dict[Tuple[int, Optional[int]], int] = defaultdict(int)
    treatment_shipping_n: Dict[int, int] = defaultdict(int)
    material_shipping_n: Dict[int, int] = defaultdict(int)

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
            material_shipping_n[p.material.supplier_id] += 1
        if p.material_from_stock and not p.customer_supplied_material:
            n_from_stock += 1
        for ph in p.phases:
            if ph.treatment_id and ph.treatment:
                # Chiave batch (treatment_id, material_id): stesso trattamento
                # ma materiali diversi = batch separati per il fornitore.
                batch_key = (ph.treatment_id, p.material_id)
                treatment_batch[batch_key] += finished_w
                treatment_batch_n[batch_key] += 1
                if ph.treatment.supplier_id:
                    # Spedizione trattamento: per supplier_id (1 viaggio).
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

            # Trattamento: aggregazione per (treatment_id, material_id).
            # Peso finito + costo proporzionale al peso del batch del proprio
            # gruppo (stesso trattamento E stesso materiale).
            if phase.treatment_id and phase.treatment:
                t = phase.treatment
                batch_key = (phase.treatment_id, part.material_id)
                batch_w = treatment_batch.get(batch_key, 0.0)
                n_grp = treatment_batch_n.get(batch_key, 1)

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
                phase.variable_cost_per_part = _round4(part_share / qty)

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

            # Rate split (Sprint 12).
            work_rate = phase.hourly_rate_override
            if work_rate is None:
                work_rate = phase.machine.hourly_rate if phase.machine else 0.0
            if phase.machine and phase.machine.setup_hourly_rate is not None:
                setup_rate = phase.machine.setup_hourly_rate
            else:
                setup_rate = work_rate

            # divisor = qty della singola parte. is_shared rimosso (era
            # ambiguo: il setup di una parte non viene amortizzato sulle altre
            # parti che non condividono la macchina). Per fasi treatment il
            # fixed_cost è già "quota di parte" (distribuito sopra).
            divisor = qty

            cost_per_piece = (
                (phase.setup_hours or 0.0) * setup_rate / divisor
                + (phase.cycle_hours_per_part or 0.0) * work_rate
                + (phase.fixed_cost or 0.0) / divisor
                + (phase.variable_cost_per_part or 0.0)
            )
            phase.calculated_cost = _round4(cost_per_piece)
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

    # Preventivatore Stampi: addons L2-L4 (normalizzati, lavorazioni feature,
    # accessori) + snapshot su DieQuoteSpec. L1 (materiale piastre + trattamenti)
    # è già stato calcolato sopra come Part.total_cost.
    if quote.quote_type == 'die':
        _recalculate_die_addons(quote, parts, db)

    db.commit()


def _recalculate_die_addons(quote: Quote, parts, db: Session) -> None:
    """Calcola L2-L4 del preventivatore Stampi e popola DieQuoteSpec snapshot.

    Chiamata dal ramo finale di `recalculate_quote` quando `quote.quote_type='die'`.
    NON ridenomina `Part.total_cost/unit_price/total_price` — quelli restano
    per coerenza con il resto del sistema (archivio, PDF generico). Il prezzo
    finale stampo si calcola al volo da `cost_industrial × (1+margin) × (1-discount)`.

    MVP2.5: se `spec.quick_mode=True` bypassa L1-L3 dettagliati e usa la
    formula veloce (peso castello × €/kg medio storico), output range ±tol%.
    """
    spec = quote.die_spec
    if spec is None:
        return
    settings = db.query(DieSettings).filter(DieSettings.id == 1).first()
    if settings is None:
        return

    if spec.quick_mode:
        _recalculate_die_quick(spec, quote, parts, settings)
        return

    brackets = db.query(DieDimensionBracket).order_by(DieDimensionBracket.sort_order).all()

    # L1 materiale piastre = somma Part.total_cost × quantity per ogni piastra.
    # Include material_cost + delivery + cutting + tutte le phase costs (incluso
    # trattamento termico aggregato in `recalculate_quote` qua sopra).
    cost_material = sum((p.total_cost or 0.0) * (p.quantity or 1) for p in parts)

    # L2 normalizzati = somma qty × unit_price su tutti i NormalizedItem.
    cost_normalized = 0.0
    for p in parts:
        for ni in (p.normalized_items or []):
            cost_normalized += (ni.quantity or 1) * (ni.unit_price or 0.0)

    # L3 lavorazioni meccaniche
    # Area castello dm² = max raw_x × max raw_y / 10000 (mm² → dm²: 1 dm² = 10000 mm²)
    max_x = max((p.raw_x_mm or 0.0 for p in parts), default=0.0)
    max_y = max((p.raw_y_mm or 0.0 for p in parts), default=0.0)
    area_dm2 = max_x * max_y / 10000.0
    coeff_dim = 1.0
    for b in brackets:
        if area_dm2 >= b.area_min_dm2 and (b.area_max_dm2 is None or area_dm2 < b.area_max_dm2):
            coeff_dim = b.coefficient or 1.0
            break

    diff_mult_attr = f'diff_mult_{spec.difficulty}'
    diff_mult = getattr(settings, diff_mult_attr, settings.diff_mult_base) or 1.0

    cost_bends = (
        (spec.n_bends_simple or 0) * (settings.cost_bend_simple or 0)
        + (spec.n_bends_medium or 0) * (settings.cost_bend_medium or 0)
        + (spec.n_bends_complex or 0) * (settings.cost_bend_complex or 0)
    ) * coeff_dim * diff_mult
    cost_punches = (
        (spec.n_punches_simple or 0) * (settings.cost_punch_simple or 0)
        + (spec.n_punches_medium or 0) * (settings.cost_punch_medium or 0)
        + (spec.n_punches_complex or 0) * (settings.cost_punch_complex or 0)
    ) * coeff_dim * diff_mult
    cost_plates_base = len(parts) * (settings.cost_per_plate_base or 0.0)
    cost_machining = cost_bends + cost_punches + cost_plates_base

    # L4 accessori: progettazione + montaggio forfait + extras manuali
    design_hours = getattr(settings, f'design_hours_{spec.difficulty}', settings.design_hours_base) or 0.0
    cost_design = design_hours * (settings.design_hourly_rate or 0.0)
    cost_assembly = getattr(settings, f'assembly_forfeit_{spec.difficulty}', settings.assembly_forfeit_base) or 0.0
    cost_accessories = cost_design + cost_assembly + (spec.extras_amount or 0.0)

    # L5 industriale = L1 + L2 + L3 + L4
    cost_industrial = cost_material + cost_normalized + cost_machining + cost_accessories

    # Snapshot su DieQuoteSpec (per archivio + PDF + UI senza dover ricalcolare)
    spec.cost_material = round(cost_material, 2)
    spec.cost_normalized = round(cost_normalized, 2)
    spec.cost_machining = round(cost_machining, 2)
    spec.cost_accessories = round(cost_accessories, 2)
    spec.cost_industrial = round(cost_industrial, 2)
    spec.quick_min = 0.0
    spec.quick_max = 0.0


def _recalculate_die_quick(spec, quote: Quote, parts, settings: DieSettings) -> None:
    """Modalità Rapida (MVP2.5): stima ±tol% in 2 minuti.

    Algoritmo semplificato:
      peso_castello_kg = (bbox_x × bbox_y / 10000) × thickness_avg × densità ×
                         n_plates_avg × scrap (10% default)
      cost_grezzo = peso × €/kg medio (DieSettings.quick_eur_per_kg)
      cost_feature = Σ feature × cost_base × diff_mult (no fasce dim)
      cost_accessories = forfait difficoltà
      industriale = cost_grezzo + cost_feature + cost_accessories + extras
      min/max = industriale × (1 ∓ tol/100)

    Snapshot dettagliato (cost_material/_normalized/_machining) = 0; lo storage
    espone solo cost_industrial come stima e quick_min/quick_max come range.
    """
    bbox_x = spec.bbox_x_mm or 0.0
    bbox_y = spec.bbox_y_mm or 0.0
    n_plates = settings.quick_n_plates_avg or 5
    thickness_avg = settings.quick_thickness_avg_mm or 28.0
    eur_per_kg = settings.quick_eur_per_kg or 25.0
    tol = (settings.quick_tolerance_percent or 20.0) / 100.0

    # Densità: se c'è un materiale dominante (es. piastra matrice o prima Part
    # con material_id), usa la sua density. Altrimenti default 7.85 (acciaio).
    density = 7.85
    for p in parts:
        if p.material and p.material.density_kg_dm3:
            density = p.material.density_kg_dm3
            break

    # Volume castello (dm³) = (bbox_x × bbox_y × thickness × n_plates) / 1e6
    # × scrap 1.1 (10% recupero, allineato a _compute_material_cost)
    vol_dm3 = (bbox_x * bbox_y * thickness_avg * n_plates) / 1_000_000
    weight_kg = vol_dm3 * density * 1.1
    cost_grezzo = weight_kg * eur_per_kg

    diff_mult = getattr(settings, f'diff_mult_{spec.difficulty}', settings.diff_mult_base) or 1.0
    cost_feature_unit = (
        (settings.cost_bend_simple or 0) + (settings.cost_punch_simple or 0)
    ) / 2  # media base
    n_features = (
        (spec.n_bends_simple or 0) + (spec.n_bends_medium or 0) + (spec.n_bends_complex or 0)
        + (spec.n_punches_simple or 0) + (spec.n_punches_medium or 0) + (spec.n_punches_complex or 0)
    )
    cost_features = n_features * cost_feature_unit * diff_mult

    cost_assembly = getattr(settings, f'assembly_forfeit_{spec.difficulty}', settings.assembly_forfeit_base) or 0.0
    design_hours = getattr(settings, f'design_hours_{spec.difficulty}', settings.design_hours_base) or 0.0
    cost_design = design_hours * (settings.design_hourly_rate or 0.0)
    cost_accessories = cost_assembly + cost_design + (spec.extras_amount or 0.0)

    industrial = cost_grezzo + cost_features + cost_accessories

    spec.cost_material = round(cost_grezzo, 2)
    spec.cost_normalized = 0.0
    spec.cost_machining = round(cost_features, 2)
    spec.cost_accessories = round(cost_accessories, 2)
    spec.cost_industrial = round(industrial, 2)
    spec.quick_min = round(industrial * (1.0 - tol), 2)
    spec.quick_max = round(industrial * (1.0 + tol), 2)
