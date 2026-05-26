import math
from collections import defaultdict
from typing import Dict, Optional, Tuple
from sqlalchemy.orm import Session, joinedload
from app.models import (
    Part, ManufacturingPhase, Quote, Material, Machine,
    EdmConfig, EdmCutSpeed, CuttingCycle, Treatment, MaterialSupplier, Supplier,
    CompanySettings,
    DieSpec, DieNormalizedItem, DieSettings, DieDimensionBracket,
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


def _raw_volume_dm3(part: Part) -> float:
    """Volume del grezzo (dm³) di una singola unità della parte.

    Cilindro se `raw_diameter_mm` è valorizzato (formula π × r² × L),
    prismatico altrimenti (raw_x × raw_y × raw_z). 0 se dati insufficienti.
    Usato dai trattamenti con `cost_unit='dm3'` per il volume del batch.
    """
    if part.raw_diameter_mm:
        r = part.raw_diameter_mm / 2
        l = part.raw_z_mm or 0
        if not r or not l:
            return 0.0
        return (math.pi * r * r * l) / 1_000_000
    x = part.raw_x_mm or 0
    y = part.raw_y_mm or 0
    z = part.raw_z_mm or 0
    if not x or not y or not z:
        return 0.0
    return (x * y * z) / 1_000_000


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
        # Caso edge: preventivo senza parti. Per quote_type='die' calcoliamo
        # comunque L2/L3/L4/L5 (lavorazioni + accessori + override matita)
        # così l'utente vede una stima anche prima di aggiungere le piastre.
        if quote.quote_type == 'die':
            _recalculate_die_levels(quote, [], db)
            db.commit()
        return

    n_parts = len(parts)

    # ─── Modulo Stampi: auto-fill X/Y piastre da castello ────────────────
    # Per quote_type='die', le piastre del castello hanno X/Y derivate dalla
    # geometria del pezzo + striscia + offset castello. Se l'utente non ha
    # forzato manualmente raw_x/raw_y sulla piastra, calcoliamo i valori
    # dall'ingombro castello e li scriviamo PRIMA della pipeline costi
    # (così la formula materiale grezzo li vede subito).
    #
    # Override manuale preservato: solo se raw_x_mm/raw_y_mm sono NULL
    # auto-popoliamo dal castello. Qualsiasi valore esplicito (incluso 0)
    # rappresenta una scelta utente da rispettare.
    if quote.quote_type == 'die':
        spec = db.query(DieSpec).filter(DieSpec.quote_id == quote_id).first()
        if spec:
            castle_x, castle_y = _compute_castle_dimensions(spec)
            for p in parts:
                if not p.plate_role:
                    continue
                if p.raw_x_mm is None:
                    p.raw_x_mm = castle_x
                if p.raw_y_mm is None:
                    p.raw_y_mm = castle_y

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

                # Soglia: sempre confrontata sul peso (kg) del batch, anche
                # per trattamenti €/dm³ — la soglia è capacità del forno.
                below_threshold = (
                    t.minimum_weight_kg and t.minimum_weight_kg > 0
                    and batch_w < t.minimum_weight_kg
                )

                # Modulo Stampi: trattamenti €/dm³ (nitrurazione, ecc) calcolano
                # sul VOLUME del batch invece che sul peso. La quota part_share
                # è proporzionale al volume del singolo pezzo.
                if (t.cost_unit or 'kg') == 'dm3':
                    batch_v = treatment_batch_volume.get(batch_key, 0.0)
                    total_batch_cost = (
                        (t.minimum_cost or 0.0) if below_threshold
                        else (t.cost_per_dm3 or 0.0) * batch_v
                    )
                    part_vol = _raw_volume_dm3(part) * qty
                    if batch_v > 0:
                        part_share = total_batch_cost * part_vol / batch_v
                    else:
                        part_share = 0.0
                else:
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

    # Modulo Stampi: dopo aver ricalcolato L1 (materiali piastre per Part),
    # aggrega L2-L5 nello snapshot DieSpec. La commit finale è sotto.
    if quote.quote_type == 'die':
        _recalculate_die_levels(quote, parts, db)

    db.commit()


def _compute_castle_dimensions(spec: DieSpec) -> Tuple[float, float]:
    """Calcola le dimensioni del castello (X, Y) a partire dalla DieSpec.

    Passo:  strip_x = pitch_mm × n_stations   (pitch = distanza tra stazioni;
                                                fallback a bbox_x se NULL)
            strip_y = bbox_y + strip_offset_y
    Blocco: strip_x = bbox_x + block_strip_offset
            strip_y = bbox_y + block_strip_offset
    Castle: castle_xy = strip_xy + 2 × castle_offset_xy
    """
    bbox_x = spec.bbox_x_mm or 0.0
    bbox_y = spec.bbox_y_mm or 0.0
    off_x = spec.castle_offset_x_mm or 0.0
    off_y = spec.castle_offset_y_mm or 0.0

    if spec.die_subtype == 'passo':
        n_st = spec.n_stations or 1
        # Pitch obbligatorio nella UI nuova; fallback a bbox_x per i preventivi
        # pre-feature (creati quando il campo era opzionale).
        pitch = spec.pitch_mm or bbox_x
        strip_x = pitch * n_st
        strip_y = bbox_y + (spec.strip_offset_y_mm or 0.0)
    else:  # blocco
        off = spec.block_strip_offset_mm or 0.0
        strip_x = bbox_x + off
        strip_y = bbox_y + off

    castle_x = strip_x + 2 * off_x
    castle_y = strip_y + 2 * off_y
    return (round(castle_x, 2), round(castle_y, 2))


def _bracket_coefficient(area_dm2: float, brackets) -> float:
    """Lookup coefficiente fascia dimensionale per area castello in dm².
    Regola: area_min ≤ area < area_max (ultima fascia ha area_max=NULL).
    Fallback 1.0 se nessuna fascia matcha (config incompleta)."""
    for b in brackets:
        if b.area_min_dm2 <= area_dm2 and (b.area_max_dm2 is None or area_dm2 < b.area_max_dm2):
            return b.coefficient or 1.0
    return 1.0


# Default Sprint B per ruolo piastra: usati come fallback quando il Part non
# ha lo snapshot popolato (es. piastre create prima di Sprint B, o senza
# template). Coerenti coi default del seed `_seed_die_templates`.
_PLATE_ROLE_DEFAULTS = {
    'cappello':      (0.3, 1, 0, 1, 0.0),
    'porta_punzoni': (0.5, 2, 1, 2, 0.4),
    'premilamiera':  (0.4, 2, 1, 1, 0.0),
    'matrice':       (0.5, 2, 2, 2, 0.5),
    'base':          (0.3, 1, 0, 1, 0.0),
}


def _estimate_die_plate_breakdown(plate, spec, settings, brackets) -> Dict[str, float]:
    """Sprint F — stima ore meccaniche piastra in breakdown per operazione.

    Ritorna dict con ore separate per fase ({setup, mill, grind, drill, station})
    + scale_factor da fascia piastra + total_h. Il chiamante applica le tariffe
    distinte per operazione (Sprint F1).

    Usa lo snapshot su Part se presente; altrimenti default-per-ruolo da
    `_PLATE_ROLE_DEFAULTS` (cover legacy + piastre senza template).
    Scala piastra: lookup `DieDimensionBracket` per `area_dm²` (Sprint F3,
    re-purpose della tabella ex-fasce castello).
    """
    empty = {'setup': 0.0, 'mill': 0.0, 'grind': 0.0, 'drill': 0.0,
             'station': 0.0, 'scale_factor': 1.0, 'total_h': 0.0}
    if not plate.plate_role:
        return empty
    area_dm2 = ((plate.raw_x_mm or 0.0) * (plate.raw_y_mm or 0.0)) / 10_000.0
    if area_dm2 <= 0:
        return empty

    # Snapshot Part → priorità; fallback default per ruolo.
    defaults = _PLATE_ROLE_DEFAULTS.get(plate.plate_role, (0.4, 2, 0, 1, 0.0))
    setup_h     = plate.die_setup_h         if plate.die_setup_h         is not None else defaults[0]
    n_milled    = plate.die_n_milled_faces  if plate.die_n_milled_faces  is not None else defaults[1]
    n_ground    = plate.die_n_ground_faces  if plate.die_n_ground_faces  is not None else defaults[2]
    n_drilled   = plate.die_n_drilled_faces if plate.die_n_drilled_faces is not None else defaults[3]
    station_bon = plate.die_station_bonus_h if plate.die_station_bonus_h is not None else defaults[4]

    milling_h  = settings.milling_h_per_dm2  if settings.milling_h_per_dm2  is not None else 0.15
    grinding_h = settings.grinding_h_per_dm2 if settings.grinding_h_per_dm2 is not None else 0.10
    drilling_h = settings.drilling_h_per_dm2 if settings.drilling_h_per_dm2 is not None else 0.20

    ore_setup   = setup_h
    ore_mill    = area_dm2 * n_milled  * milling_h
    ore_grind   = area_dm2 * n_ground  * grinding_h
    ore_drill   = area_dm2 * n_drilled * drilling_h
    ore_station = (spec.n_stations or 1) * station_bon

    # Sprint F3 — scala piastra da fascia configurabile (lookup DieDimensionBracket).
    scale = _bracket_coefficient(area_dm2, brackets) if brackets else 1.0

    total = (ore_setup + ore_mill + ore_grind + ore_drill + ore_station) * scale
    return {
        'setup': round(ore_setup, 4),
        'mill': round(ore_mill, 4),
        'grind': round(ore_grind, 4),
        'drill': round(ore_drill, 4),
        'station': round(ore_station, 4),
        'scale_factor': scale,
        'total_h': round(total, 4),
    }


def _estimate_die_plate_hours(plate, spec, settings, brackets=None) -> float:
    """Retro-compat wrapper: ritorna le ore totali (per UI display).
    Sprint F: ora applica anche scale_factor da fascia piastra; brackets è
    opzionale per non rompere call site test che non passano la lista.
    """
    return _estimate_die_plate_breakdown(plate, spec, settings, brackets or []).get('total_h', 0.0)


def _rate_for_machine(machine_id, fallback_rate, db: Session) -> float:
    """Sprint F — risolve tariffa €/h: se machine_id è popolato e la macchina
    ha hourly_rate, usa quello; altrimenti fallback al valore esplicito.
    """
    if machine_id:
        m = db.query(Machine).filter(Machine.id == machine_id).first()
        if m and m.hourly_rate:
            return float(m.hourly_rate)
    return float(fallback_rate or 0.0)


def _estimate_die_perimeter(spec) -> float:
    """Perimetro pezzo per la stima EDM. Se l'utente l'ha valorizzato (da DXF
    o manuale) si usa quello. Fallback: 2*(X+Y) × complexity_factor."""
    if spec.perimeter_pezzo_mm and spec.perimeter_pezzo_mm > 0:
        return float(spec.perimeter_pezzo_mm)
    bx = spec.bbox_x_mm or 0.0
    by = spec.bbox_y_mm or 0.0
    cf = spec.complexity_factor or 1.2
    return 2.0 * (bx + by) * cf


def _estimate_die_edm_hours(spec, parts, settings, db: Session) -> Dict[int, float]:
    """Stima ore EDM filo per ciascuna piastra stampo che vi contribuisce.

    Driver = perimetro pezzo × n_stazioni × moltiplicatore_per_ruolo.
      - matrice:       lunghezza = perimetro × n_stazioni
      - porta_punzoni: lunghezza = perimetro × n_stazioni × edm_extractor_factor
                       + ore extra per punzoni sagomati (medium + complex×1.5)
                         × edm_punch_factor (proporzionali a perimetro pezzo)

    Riusa `_compute_edm_hours_pure` per la conversione metri→ore, che a sua volta
    fa lookup su `EdmCutSpeed` per (material_family, spessore piastra).

    Returns:
        Dict[plate_id, hours]. Piastre senza material.family o senza cycle non
        contribuiscono (skip silenzioso — l'utente vedrà ore=0 e capirà che
        manca la calibrazione famiglia/ciclo).
    """
    plates = [p for p in parts if p.plate_role]
    if not plates:
        return {}

    perimeter = _estimate_die_perimeter(spec)
    if perimeter <= 0:
        return {}

    n_stations = spec.n_stations or 1
    cycle_id = settings.wire_edm_cycle_id
    if not cycle_id:
        # Fallback: primo CuttingCycle attivo.
        cyc = db.query(CuttingCycle).filter(CuttingCycle.active == True).order_by(CuttingCycle.id).first()
        cycle_id = cyc.id if cyc else None
    if not cycle_id:
        return {}

    extractor_f = settings.edm_extractor_factor if settings.edm_extractor_factor is not None else 0.6
    punch_f = settings.edm_punch_factor if settings.edm_punch_factor is not None else 0.3

    # Ore extra punzoni: contribuiscono solo se ci sono punzoni medi/complessi.
    n_punches_weighted = (spec.n_punches_medium or 0) + 1.5 * (spec.n_punches_complex or 0)
    punch_extra_length = perimeter * n_punches_weighted * punch_f

    hours_by_plate: Dict[int, float] = {}
    for plate in plates:
        role = plate.plate_role
        if role == 'matrice':
            length = perimeter * n_stations
        elif role == 'porta_punzoni':
            length = perimeter * n_stations * extractor_f + punch_extra_length
        else:
            continue  # cappello/premilamiera/base non hanno EDM in questo modello
        if not plate.material_id:
            continue
        mat = db.query(Material).filter(Material.id == plate.material_id).first()
        if not mat or not mat.family:
            continue
        n_pierce = n_stations  # un pre-foro per ogni sagoma
        ore = _compute_edm_hours_pure(
            cut_length_mm=length,
            cut_height_mm=plate.raw_z_mm or 0.0,
            material_family=mat.family,
            cycle_id=cycle_id,
            n_pierce=n_pierce,
            db=db,
        )
        if ore is not None and plate.id is not None:
            hours_by_plate[plate.id] = ore

    return hours_by_plate


def _recalculate_die_levels(quote: Quote, parts, db: Session) -> None:
    """Aggrega i 7 livelli costo nel DieSpec del quote.

    L1 = Σ Part.total_cost × qty (piastre, calcolate dal motore standard).
    L2 = Σ DieNormalizedItem.qty × unit_price + spedizione aggregata
         per NormalizedSupplier.shipping_cost (1 viaggio per fornitore).
    L3 = lavorazione_meccanica_piastre + EDM_filo_piastre — derivata da
         driver geometrici (perimetro pezzo, area piastre, n_stazioni) via
         Sprint A/B. Sprint D ha rimosso il vecchio "feature × coeff × coeff
         + base × n_plates": la dipendenza dalla geometria è già contenuta
         nelle ore meccaniche e EDM.
    L4 = (design_hours[diff] + bonus_feature) × design_rate
         + assembly_forfeit[diff] + extras_amount.
         Sprint D ha aggiunto un bonus a `design_hours` proporzionale al
         numero di pieghe (0.4 h/cad) e punzoni (0.3 h/cad): più feature
         = più CAD/programmazione.
    L5 = L1 + L2 + L3 + L4 — con override_*  matita che sostituisce la voce calcolata.
    L6/L7 (margin + discount) applicati lato UI/PDF, non persistiti qui.
    """
    spec = quote.die_spec
    if not spec:
        return

    settings = db.query(DieSettings).filter(DieSettings.id == 1).first()
    if not settings:
        return

    # ── L1 Materiali piastre — somma dei costi totali delle Part-piastra.
    cost_material = sum(
        (p.total_cost or 0.0) * (p.quantity or 1)
        for p in parts if p.plate_role
    )

    # ── L2 Normalizzati + spedizione aggregata per fornitore.
    norm_items = db.query(DieNormalizedItem).filter(
        DieNormalizedItem.quote_id == quote.id
    ).options(joinedload(DieNormalizedItem.supplier)).all()
    cost_normalized = sum(
        (it.quantity or 0) * (it.unit_price or 0.0) for it in norm_items
    )
    # Spedizione: somma una sola volta per supplier_id distinto.
    suppliers_used = {it.normalized_supplier_id for it in norm_items if it.normalized_supplier_id}
    for sup_id in suppliers_used:
        for it in norm_items:
            if it.normalized_supplier_id == sup_id and it.supplier:
                cost_normalized += (it.supplier.shipping_cost or 0.0)
                break

    # ── L3 Lavorazioni: feature × coeff_dim × coeff_diff + base × n_plates.
    diff = spec.difficulty or 'base'

    # Sprint F — risolvi le 4 tariffe (FK Machine → machine.hourly_rate;
    # fallback al campo hourly_rate_* del singleton).
    rate_mill  = _rate_for_machine(settings.milling_machine_id,  settings.hourly_rate_milling,  db)
    rate_grind = _rate_for_machine(settings.grinding_machine_id, settings.hourly_rate_grinding, db)
    rate_drill = _rate_for_machine(settings.drilling_machine_id, settings.hourly_rate_milling,  db)
    rate_edm   = _rate_for_machine(settings.edm_wire_machine_id, settings.hourly_rate_edm_die,  db)

    # ── L3 — lavorazione stampo: EDM filo + ore meccaniche piastre (Sprint A/B).
    # La dipendenza da feature/dimensioni è già contenuta nei driver:
    #  - matrice/porta_punzoni: ore EDM ∝ perimetro pezzo × n_stazioni
    #  - ogni piastra: ore mecc. = setup + Σ(area × h/dm² × n_facce) + station_bonus
    #  - punzoni medium/complex aggiungono metri EDM (edm_punch_factor)
    edm_hours_map = _estimate_die_edm_hours(spec, parts, settings, db)
    total_edm_hours = sum(edm_hours_map.values())
    cost_machining_edm = total_edm_hours * rate_edm

    # Sprint F — fasce scala piastra (re-purpose DieDimensionBracket: era
    # legacy castello, ora moltiplicatore ore meccaniche per area piastra).
    brackets = db.query(DieDimensionBracket).order_by(DieDimensionBracket.sort_order).all()

    # Sprint F — tariffe distinte per operazione: ogni voce ore × tariffa propria.
    cost_machining_mech = 0.0
    for p in parts:
        if not p.plate_role:
            continue
        bd = _estimate_die_plate_breakdown(p, spec, settings, brackets)
        scale = bd['scale_factor']
        cost_machining_mech += scale * (
            bd['setup']   * rate_mill
            + bd['mill']  * rate_mill
            + bd['grind'] * rate_grind
            + bd['drill'] * rate_drill
            + bd['station'] * rate_mill
        )

    cost_machining_total = cost_machining_edm + cost_machining_mech

    # ── L4 Accessori: progettazione + montaggio + extras.
    # Sprint D — bonus ore design proporzionale alle feature (pieghe + punzoni):
    # più feature ⇒ più ore di CAD/programmazione, indipendentemente dalla
    # difficoltà globale.
    base_design_hours = {
        'base':   settings.design_hours_base,
        'medium': settings.design_hours_medium,
        'hard':   settings.design_hours_hard,
    }.get(diff, 0.0) or 0.0
    n_bends_total = (
        (spec.n_bends_simple or 0)
        + (spec.n_bends_medium or 0)
        + (spec.n_bends_complex or 0)
    )
    n_punches_total = (
        (spec.n_punches_simple or 0)
        + (spec.n_punches_medium or 0)
        + (spec.n_punches_complex or 0)
    )
    # Sprint F — bonus design ore CAD per feature, configurabile da DieSettings.
    bonus_bend = settings.design_h_per_bend if settings.design_h_per_bend is not None else 0.4
    bonus_punch = settings.design_h_per_punch if settings.design_h_per_punch is not None else 0.3
    design_hours = base_design_hours + n_bends_total * bonus_bend + n_punches_total * bonus_punch
    assembly = {
        'base':   settings.assembly_forfeit_base,
        'medium': settings.assembly_forfeit_medium,
        'hard':   settings.assembly_forfeit_hard,
    }.get(diff, 0.0) or 0.0
    cost_accessories = (
        design_hours * (settings.design_hourly_rate or 0.0)
        + assembly
        + (spec.extras_amount or 0.0)
    )

    # Override "matita": NULL = usa calcolato, altrimenti forza valore manuale.
    # `override_machining` agisce sul TOTALE L3 (mech + EDM).
    eff_material      = spec.override_material      if spec.override_material      is not None else cost_material
    eff_normalized    = spec.override_normalized    if spec.override_normalized    is not None else cost_normalized
    eff_machining     = spec.override_machining     if spec.override_machining     is not None else cost_machining_total
    eff_accessories   = spec.override_accessories   if spec.override_accessories   is not None else cost_accessories

    spec.cost_material        = round(cost_material, 2)
    spec.cost_normalized      = round(cost_normalized, 2)
    spec.cost_machining       = round(cost_machining_total, 2)
    spec.cost_machining_edm   = round(cost_machining_edm, 2)
    spec.cost_machining_mech  = round(cost_machining_mech, 2)
    spec.cost_accessories     = round(cost_accessories, 2)
    spec.cost_industrial      = round(eff_material + eff_normalized + eff_machining + eff_accessories, 2)


def recalculate_die_quote(quote_id: int, db: Session) -> None:
    """Wrapper pubblico: ricalcola un preventivo stampo (delega a `recalculate_quote`).

    Esiste come API esplicita per call-site che vogliono dichiarare l'intent
    ('sto ricalcolando uno stampo, non un preventivo generico'). Internamente
    il dispatch è già nel branch finale di `recalculate_quote`."""
    recalculate_quote(quote_id, db)


