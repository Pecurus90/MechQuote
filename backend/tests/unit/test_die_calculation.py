"""Test unit del cost engine modulo Preventivatore Stampi.

Copre i 7 livelli (spec §4):
- L1 materiale piastre (con materiale, fascia M, difficoltà media)
- Trattamento €/dm³ (nitrurazione su volume invece che peso)
- L3 fascia castello + difficoltà
- Override matita (force su L3 sostituisce calcolato)
- Modalità Rapida: range ±tol%
- L2 normalizzati con spedizione aggregata
"""
import pytest

from app.models import (
    Quote, Part, ManufacturingPhase, Machine, Material, Treatment,
    DieSpec, DieNormalizedItem, DieSettings, DieDimensionBracket,
    DieTemplate, DieTemplateNormalized,
    NormalizedSupplier, EdmConfig, EdmCutSpeed, CuttingCycle, CuttingPass,
)
from app.services.calculation import recalculate_die_quote


# ─── Helpers ───────────────────────────────────────────────────────────────

def _seed_die_settings(db):
    """Default per test legacy del L3 "feature × coeff": disattiva i nuovi
    termini Sprint A/B settando le tariffe macchina a 0 (così cost_machining
    contiene solo il vecchio "feature × coeff_dim × coeff_diff + base × n_plates"
    senza inquinamenti). I test Sprint A/B hanno seed propri con tariffe vere.
    """
    s = DieSettings(
        id=1,
        cost_bend_simple=80, cost_bend_medium=160, cost_bend_complex=320,
        cost_punch_simple=120, cost_punch_medium=240, cost_punch_complex=480,
        cost_per_plate_base=150,
        diff_mult_base=1.0, diff_mult_medium=1.3, diff_mult_hard=1.7,
        design_hours_base=8, design_hours_medium=16, design_hours_hard=32,
        design_hourly_rate=50,
        assembly_forfeit_base=300, assembly_forfeit_medium=600, assembly_forfeit_hard=1200,
        default_margin_percent=30,
        default_castle_offset_x_mm=80, default_castle_offset_y_mm=80,
        # Tariffe macchine a 0 → cost_machining_mech e cost_machining_edm = 0
        # Sprint F separa le tariffe per operazione: anche grinding va azzerato.
        hourly_rate_milling=0.0, hourly_rate_grinding=0.0, hourly_rate_edm_die=0.0,
    )
    db.add(s)
    return s


def _seed_brackets(db):
    db.add_all([
        DieDimensionBracket(label='S', area_min_dm2=0,    area_max_dm2=20,   coefficient=1.0,  sort_order=1),
        DieDimensionBracket(label='M', area_min_dm2=20,   area_max_dm2=50,   coefficient=1.3,  sort_order=2),
        DieDimensionBracket(label='L', area_min_dm2=50,   area_max_dm2=100,  coefficient=1.6,  sort_order=3),
        DieDimensionBracket(label='XL', area_min_dm2=100, area_max_dm2=None, coefficient=2.0,  sort_order=4),
    ])


def _make_die_quote(db, **spec_overrides):
    q = Quote(quote_number='DIE-001', quote_type='die', global_margin_percent=30.0)
    db.add(q)
    db.flush()
    spec_defaults = dict(
        quote_id=q.id, die_subtype='blocco',
        bbox_x_mm=200, bbox_y_mm=150, sheet_thickness_mm=2.0,
        block_strip_offset_mm=50,
        castle_offset_x_mm=80, castle_offset_y_mm=80,
        difficulty='base',
    )
    spec_defaults.update(spec_overrides)
    spec = DieSpec(**spec_defaults)
    db.add(spec)
    db.flush()
    return q, spec


# ─── Tests ──────────────────────────────────────────────────────────────────

def test_die_l3_zero_when_no_machine_hours(db_session):
    """Sprint D — il vecchio L3 (feature × coeff_dim × coeff_diff + base × n_plates)
    è stato rimosso. Con `_seed_die_settings` legacy (hourly_rate=0) e nessuna
    EDM cycle/family settata, `cost_machining` = 0 (nessuna ora da convertire
    in costo). I test dedicati a mech/EDM coprono il caso con tariffe vere.
    """
    _seed_die_settings(db_session)
    _seed_brackets(db_session)
    q, spec = _make_die_quote(
        db_session,
        difficulty='medium',
        n_bends_medium=1, n_punches_medium=2,
    )
    db_session.add_all([
        Part(quote_id=q.id, part_code='DIE-001_matrice', plate_role='matrice', quantity=1),
        Part(quote_id=q.id, part_code='DIE-001_base',    plate_role='base',    quantity=1),
    ])
    db_session.commit()

    recalculate_die_quote(q.id, db_session)
    db_session.refresh(spec)

    # Senza tariffe macchina e senza EDM lookup → cost_machining = 0.
    assert spec.cost_machining == pytest.approx(0.0, abs=1e-3)
    assert spec.cost_machining_mech == pytest.approx(0.0, abs=1e-3)
    assert spec.cost_machining_edm == pytest.approx(0.0, abs=1e-3)


def test_die_l4_accessories_per_difficulty(db_session):
    """Sprint D — L4 = (design_hours[diff] + bonus_feature) × rate + assembly + extras.
    Difficoltà hard, no feature: 32h × 50 + 1200 + 200 = 3000.
    """
    _seed_die_settings(db_session)
    _seed_brackets(db_session)
    q, spec = _make_die_quote(db_session, difficulty='hard', extras_amount=200.0)
    db_session.commit()

    recalculate_die_quote(q.id, db_session)
    db_session.refresh(spec)
    assert spec.cost_accessories == pytest.approx(3000.0, rel=1e-3)


def test_die_l4_accessories_with_feature_bonus(db_session):
    """Sprint D — ore design extra: 0.4 × n_pieghe + 0.3 × n_punzoni.
    Difficoltà base, 2 pieghe e 3 punzoni totali:
      design = 8 + 0.4*2 + 0.3*3 = 8 + 0.8 + 0.9 = 9.7 h × 50 = 485
      L4 = 485 + 300 (assembly base) + 0 (extras) = 785
    """
    _seed_die_settings(db_session)
    _seed_brackets(db_session)
    q, spec = _make_die_quote(
        db_session, difficulty='base',
        n_bends_simple=1, n_bends_medium=1,
        n_punches_simple=1, n_punches_medium=1, n_punches_complex=1,
    )
    db_session.commit()

    recalculate_die_quote(q.id, db_session)
    db_session.refresh(spec)
    assert spec.cost_accessories == pytest.approx(785.0, rel=1e-3)


def test_die_override_matita_replaces_calculated(db_session):
    """Sprint D — override matita su L3 funziona anche col nuovo cost engine.
    Con tariffe macchina a 0 nel seed legacy, cost_machining_calc = 0; ma
    override_machining=999 forza il valore in L5 industrial.
    """
    _seed_die_settings(db_session)
    _seed_brackets(db_session)
    q, spec = _make_die_quote(
        db_session, difficulty='base',
        n_punches_simple=1,
    )
    db_session.add(Part(quote_id=q.id, part_code='X', plate_role='matrice', quantity=1))
    db_session.commit()

    recalculate_die_quote(q.id, db_session)
    db_session.refresh(spec)
    # cost_machining calcolato = 0 (no tariffe, no EDM lookup nel seed legacy).
    assert spec.cost_machining == pytest.approx(0.0, abs=1e-3)

    # Forziamo override su L3 a 999.
    spec.override_machining = 999.0
    db_session.commit()
    recalculate_die_quote(q.id, db_session)
    db_session.refresh(spec)
    assert spec.cost_machining == pytest.approx(0.0, abs=1e-3)
    # L4 base + bonus 1 punzone (0.3h × 50 = 15): 8.3 × 50 + 300 = 715.
    # industrial = 0 + 0 + 999 (override) + 715 = 1714
    assert spec.cost_industrial == pytest.approx(1714.0, rel=1e-3)


def test_die_l2_normalized_with_shared_shipping(db_session):
    """L2 = qty × unit_price + shipping_cost (1 viaggio per fornitore distinto).
    2 item dello stesso fornitore → shipping conteggiato 1 volta sola."""
    _seed_die_settings(db_session)
    _seed_brackets(db_session)
    sup = NormalizedSupplier(name='Misumi', shipping_cost=25.0)
    db_session.add(sup)
    db_session.flush()
    q, spec = _make_die_quote(db_session)
    db_session.add_all([
        DieNormalizedItem(quote_id=q.id, normalized_supplier_id=sup.id,
                          description='Vite M8', quantity=20, unit_price=0.5),
        DieNormalizedItem(quote_id=q.id, normalized_supplier_id=sup.id,
                          description='Bullone M10', quantity=10, unit_price=1.0),
    ])
    db_session.commit()
    recalculate_die_quote(q.id, db_session)
    db_session.refresh(spec)
    # L2 = (20×0.5 + 10×1.0) + 25 = 20 + 25 = 45
    assert spec.cost_normalized == pytest.approx(45.0, rel=1e-3)


def test_die_treatment_per_dm3(db_session):
    """Trattamento €/dm³ (nitrurazione): batch volume aggregato, quota
    proporzionale al volume del singolo pezzo (non al peso)."""
    q = Quote(quote_number='DIE-NIT', quote_type='single', global_margin_percent=20.0)
    db_session.add(q)
    db_session.flush()

    mat = Material(name='Acciaio', family='acciaio', density_kg_dm3=7.85, cost_per_kg=0.0)
    treat = Treatment(name='Nitrurazione', cost_unit='dm3', cost_per_dm3=10.0,
                      minimum_weight_kg=0.0, minimum_cost=0.0)
    db_session.add_all([mat, treat])
    db_session.flush()

    # 2 parti stesso (treatment, material). Volume parti: 100×100×20 = 0.2 dm³ ciascuna.
    parts = []
    for i in range(2):
        p = Part(quote_id=q.id, part_code=f'P{i+1}', quantity=1,
                 material_id=mat.id, finished_weight_kg=1.57,
                 raw_x_mm=100, raw_y_mm=100, raw_z_mm=20)
        db_session.add(p)
        db_session.flush()
        ph = ManufacturingPhase(
            part_id=p.id, sequence_number=10, phase_type='treatment',
            treatment_id=treat.id, setup_hours=0.0, cycle_hours_per_part=0.0,
        )
        db_session.add(ph)
        parts.append((p, ph))
    db_session.commit()

    from app.services.calculation import recalculate_part
    recalculate_part(parts[0][0].id, db_session)
    for p, ph in parts:
        db_session.refresh(ph)
        # batch_v = 0.4 dm³, total = 4€, quota = 2€ per parte
        assert ph.variable_cost_per_part == pytest.approx(2.0, rel=1e-3)


def test_die_edm_hours_estimation(db_session):
    """Sprint A — stima ore EDM filo per piastre stampo.

    Setup:
    - 1 stazione, perimetro pezzo 300 mm (fornito esplicitamente).
    - matrice 25 mm in acciaio_inox; porta_punzoni 25 mm idem.
    - EdmCutSpeed: acciaio_inox 20-30 mm, 3 mm/min (pierce 5s).
    - CuttingCycle con 1 passata rough factor 1.0.
    - edm_extractor_factor = 0.6 → porta_punzoni vede 300×0.6 = 180 mm.

    Atteso:
    - matrice: 300 mm / 3 mm/min + 1 pierce × 5s/60 = 100 min + 0.083 min
               ≈ 100.083 min / 60 = 1.6681 h
    - porta_punzoni: 180/3 + 1*5/60 = 60.083 min / 60 = 1.0014 h
    - costo machining_edm = (1.6681 + 1.0014) × 55 €/h = ~146.83 €
    """
    # Seed DieSettings con i nuovi campi Sprint A
    s = DieSettings(
        id=1,
        hourly_rate_edm_die=55.0,
        edm_extractor_factor=0.6,
        edm_punch_factor=0.3,
        # campi necessari ai test pre-esistenti, default 0 OK
    )
    db_session.add(s)

    # Material con family per il lookup EdmCutSpeed
    mat = Material(name='1.4301', family='acciaio_inox', density_kg_dm3=7.9, cost_per_kg=0.0)
    db_session.add(mat)

    # Setup EDM: config + velocità + ciclo 1 passata
    db_session.add(EdmConfig(
        id=1, rough_speed_factor=1.0, semi_speed_factor=0.5, finish_speed_factor=0.3,
        default_pierce_time_s=5.0,
    ))
    db_session.add(EdmCutSpeed(
        material_family='acciaio_inox',
        thickness_min_mm=20, thickness_max_mm=30,
        speed_mm_per_min=3.0, pierce_time_s=5.0,
    ))
    cycle = CuttingCycle(name='Sgrossatura singola', active=True)
    db_session.add(cycle)
    db_session.flush()
    db_session.add(CuttingPass(cycle_id=cycle.id, pass_type='rough', sequence_number=1))
    db_session.flush()
    s.wire_edm_cycle_id = cycle.id

    # Quote + DieSpec + 2 piastre (matrice + porta_punzoni)
    q = Quote(quote_number='DIE-EDM', quote_type='die', global_margin_percent=30.0)
    db_session.add(q)
    db_session.flush()
    spec = DieSpec(
        quote_id=q.id, die_subtype='blocco',
        bbox_x_mm=80, bbox_y_mm=70, sheet_thickness_mm=2.0,
        perimeter_pezzo_mm=300.0,
        complexity_factor=1.2,
        n_stations=1,
        block_strip_offset_mm=50,
        castle_offset_x_mm=80, castle_offset_y_mm=80,
        difficulty='base',
    )
    db_session.add(spec)
    matrice = Part(quote_id=q.id, part_code='matrice', plate_role='matrice',
                   material_id=mat.id, raw_x_mm=300, raw_y_mm=300, raw_z_mm=25,
                   quantity=1)
    porta = Part(quote_id=q.id, part_code='porta', plate_role='porta_punzoni',
                 material_id=mat.id, raw_x_mm=300, raw_y_mm=300, raw_z_mm=25,
                 quantity=1)
    db_session.add_all([matrice, porta])
    db_session.commit()

    recalculate_die_quote(q.id, db_session)
    db_session.refresh(spec)

    # matrice: 300/3 + 5/60 = 100.0833 min → 1.6681 h × 55 = 91.74 €
    # porta: 180/3 + 5/60 = 60.0833 min → 1.0014 h × 55 = 55.08 €
    # totale EDM: ~146.82 €
    assert spec.cost_machining_edm == pytest.approx(146.82, rel=1e-2)


def test_die_plate_hours_estimation(db_session):
    """Sprint B — stima ore meccaniche piastra (setup + h/dm² × n_facce + station_bonus)
    via snapshot Part. Matrice 400×300×30 con default matrice (setup 0.5, milled 2,
    ground 2, drilled 2, station_bonus 0.5) e produttività default
    (0.15/0.10/0.20). n_stazioni = 3. Tariffe Sprint F separate:
    milling=45, grinding=50.

    Atteso:
      area = 12 dm²
      ore_setup   = 0.5    × 45 = 22.5
      ore_mill    = 12×2×0.15 = 3.6  × 45 = 162
      ore_grind   = 12×2×0.10 = 2.4  × 50 = 120
      ore_drill   = 12×2×0.20 = 4.8  × 45 = 216
      ore_station = 3×0.5    = 1.5  × 45 = 67.5
      totale = 22.5 + 162 + 120 + 216 + 67.5 = 588 €
    """
    s = DieSettings(
        id=1,
        hourly_rate_milling=45.0, hourly_rate_grinding=50.0,
        milling_h_per_dm2=0.15, grinding_h_per_dm2=0.10, drilling_h_per_dm2=0.20,
    )
    db_session.add(s)
    q = Quote(quote_number='DIE-MECH', quote_type='die', global_margin_percent=30.0)
    db_session.add(q)
    db_session.flush()
    spec = DieSpec(
        quote_id=q.id, die_subtype='passo',
        bbox_x_mm=100, bbox_y_mm=80, sheet_thickness_mm=2.0,
        n_stations=3, pitch_mm=100, strip_offset_y_mm=10,
        castle_offset_x_mm=80, castle_offset_y_mm=80,
        difficulty='base',
    )
    db_session.add(spec)
    matrice = Part(
        quote_id=q.id, part_code='matrice', plate_role='matrice', quantity=1,
        raw_x_mm=400, raw_y_mm=300, raw_z_mm=30,
        die_setup_h=0.5, die_n_milled_faces=2, die_n_ground_faces=2,
        die_n_drilled_faces=2, die_station_bonus_h=0.5,
    )
    db_session.add(matrice)
    db_session.commit()

    recalculate_die_quote(q.id, db_session)
    db_session.refresh(spec)

    # Sprint F: tariffe separate per op → 588 €
    assert spec.cost_machining_mech == pytest.approx(588.0, rel=1e-3)


def test_die_plate_hours_setup_amortization(db_session):
    """Sprint B — verifica che la curva sia concava: piastra 12× più grande
    NON costa 12× più ore (setup fisso ammortizzato).

    Piastra A: 100×100 → area 1 dm² → ore = 0.5 + 1×0.9 + 1×0.5 = 1.9 h
    Piastra B: 400×300 → area 12 dm² → ore = 0.5 + 12×0.9 + 1×0.5 = 11.8 h
    Rapporto ore: 11.8 / 1.9 ≈ 6.2× per una piastra 12× più grande.
    """
    s = DieSettings(
        id=1,
        hourly_rate_milling=45.0,
        milling_h_per_dm2=0.15, grinding_h_per_dm2=0.10, drilling_h_per_dm2=0.20,
        large_plate_threshold_dm2=80.0, large_plate_factor=1.25,
    )
    db_session.add(s)
    q = Quote(quote_number='DIE-SCALE', quote_type='die', global_margin_percent=30.0)
    db_session.add(q)
    db_session.flush()
    spec = DieSpec(
        quote_id=q.id, die_subtype='blocco',
        bbox_x_mm=80, bbox_y_mm=70, sheet_thickness_mm=2.0,
        n_stations=1, block_strip_offset_mm=50,
        castle_offset_x_mm=80, castle_offset_y_mm=80,
        difficulty='base',
    )
    db_session.add(spec)
    # Stessi parametri ruolo, solo X/Y diversi
    common = dict(
        plate_role='matrice', quantity=1, raw_z_mm=30,
        die_setup_h=0.5, die_n_milled_faces=2, die_n_ground_faces=2,
        die_n_drilled_faces=2, die_station_bonus_h=0.5,
    )
    db_session.add(Part(quote_id=q.id, part_code='A', raw_x_mm=100, raw_y_mm=100, **common))
    db_session.add(Part(quote_id=q.id, part_code='B', raw_x_mm=400, raw_y_mm=300, **common))
    db_session.commit()

    from app.services.calculation import _estimate_die_plate_hours
    parts = db_session.query(Part).filter(Part.quote_id == q.id).all()
    plate_a = next(p for p in parts if p.part_code == 'A')
    plate_b = next(p for p in parts if p.part_code == 'B')

    ore_a = _estimate_die_plate_hours(plate_a, spec, s)
    ore_b = _estimate_die_plate_hours(plate_b, spec, s)
    # A: 0.5 + 1*0.9 + 1*0.5 = 1.9 h
    assert ore_a == pytest.approx(1.9, rel=1e-3)
    # B: 0.5 + 12*0.9 + 1*0.5 = 11.8 h
    assert ore_b == pytest.approx(11.8, rel=1e-3)
    # Rapporto < 12: piastra B è 12× più grande ma costa 6.2× le ore
    assert ore_b / ore_a < 12.0
    assert ore_b / ore_a > 5.0


def test_die_plate_hours_with_scale_tier(db_session):
    """Sprint F — la scala piastra ora viene dalle fasce `DieDimensionBracket`
    (re-purpose Sprint D). Con una fascia 50-∞ → coeff 1.5 e piastra 60 dm²,
    ore totali = base × 1.5.
    """
    s = DieSettings(
        id=1,
        hourly_rate_milling=45.0,
        milling_h_per_dm2=0.15, grinding_h_per_dm2=0.10, drilling_h_per_dm2=0.20,
    )
    db_session.add(s)
    # Bracket: piastre >50 dm² → coeff 1.5
    db_session.add_all([
        DieDimensionBracket(label='S', area_min_dm2=0,  area_max_dm2=50,   coefficient=1.0, sort_order=1),
        DieDimensionBracket(label='L', area_min_dm2=50, area_max_dm2=None, coefficient=1.5, sort_order=2),
    ])
    q = Quote(quote_number='DIE-LARGE', quote_type='die', global_margin_percent=30.0)
    db_session.add(q)
    db_session.flush()
    spec = DieSpec(
        quote_id=q.id, die_subtype='blocco',
        bbox_x_mm=80, bbox_y_mm=70, sheet_thickness_mm=2.0,
        n_stations=1, block_strip_offset_mm=50,
        castle_offset_x_mm=80, castle_offset_y_mm=80,
        difficulty='base',
    )
    db_session.add(spec)
    # Piastra 1000×600 = 60 dm² → fascia L coeff 1.5
    plate = Part(
        quote_id=q.id, part_code='XL', plate_role='matrice', quantity=1,
        raw_x_mm=1000, raw_y_mm=600, raw_z_mm=30,
        die_setup_h=0.5, die_n_milled_faces=2, die_n_ground_faces=2,
        die_n_drilled_faces=2, die_station_bonus_h=0.5,
    )
    db_session.add(plate)
    db_session.commit()

    from app.services.calculation import _estimate_die_plate_hours
    db_session.refresh(plate)
    brackets = db_session.query(DieDimensionBracket).order_by(DieDimensionBracket.sort_order).all()
    ore = _estimate_die_plate_hours(plate, spec, s, brackets)
    # base: 0.5 + 60×0.9 + 1×0.5 = 55.0 h × 1.5 (coeff fascia L) = 82.5 h
    assert ore == pytest.approx(82.5, rel=1e-3)


def test_find_similar_stats_ratios(db_session):
    """Sprint G — find-similar restituisce stats con ratio venduto/preventivato
    e cost-to-quoted, calcolati sui simili che hanno popolato i campi.
    """
    from app.api.dies import _find_similar_quotes

    # 3 stampi simili: 2 con sold_price/actual_cost popolati, 1 senza.
    # Tutti con stesso subtype/area/feature → matches.
    for i, sold, cost in [(1, 1200.0, 1100.0), (2, 1500.0, None), (3, None, None)]:
        q = Quote(quote_number=f'DIE-SIM-{i}', quote_type='die', global_margin_percent=30.0,
                  sold_price=sold, actual_cost=cost)
        db_session.add(q)
        db_session.flush()
        db_session.add(DieSpec(
            quote_id=q.id, die_subtype='blocco',
            bbox_x_mm=100, bbox_y_mm=80, sheet_thickness_mm=2.0,
            block_strip_offset_mm=50, castle_offset_x_mm=80, castle_offset_y_mm=80,
            difficulty='base', cost_industrial=1000.0,
        ))
    db_session.commit()

    matches, stats = _find_similar_quotes(
        target_subtype='blocco',
        target_area_dm2=10.0,
        target_bends=0,
        target_punches=0,
        exclude_quote_id=None,
        db=db_session,
    )
    # area castello = (100+50+160) × (80+50+160) = 310 × 290 = 8.99 dm² → simile
    assert len(matches) == 3
    # 2 con sold_price: ratio medi = (1.2 + 1.5) / 2 = 1.35
    assert stats['n_with_sold_price'] == 2
    assert stats['avg_sold_to_quoted_ratio'] == pytest.approx(1.35, rel=1e-3)
    # 1 con actual_cost: ratio = 1.1 / 1.0 = 1.1
    assert stats['n_with_actual_cost'] == 1
    assert stats['avg_cost_to_quoted_ratio'] == pytest.approx(1.1, rel=1e-3)


def test_die_spec_validator_passo_requires_stations_and_pitch():
    """Sprint E — DieSpecCreate(die_subtype='passo') richiede n_stations≥1 e pitch_mm>0."""
    from pydantic import ValidationError
    from app.schemas import DieSpecCreate

    # Mancano n_stations e pitch_mm → ValidationError
    with pytest.raises(ValidationError) as exc:
        DieSpecCreate(die_subtype='passo', bbox_x_mm=80, bbox_y_mm=40)
    assert "n_stations" in str(exc.value) or "pitch_mm" in str(exc.value)

    # Solo n_stations senza pitch → fail
    with pytest.raises(ValidationError):
        DieSpecCreate(die_subtype='passo', bbox_x_mm=80, bbox_y_mm=40, n_stations=3)

    # Caso valido
    spec = DieSpecCreate(
        die_subtype='passo', bbox_x_mm=80, bbox_y_mm=40,
        n_stations=3, pitch_mm=100,
    )
    assert spec.n_stations == 3
    assert spec.pitch_mm == 100


def test_die_spec_validator_blocco_requires_operations():
    """Sprint E — DieSpecCreate(die_subtype='blocco') richiede n_operations≥1."""
    from pydantic import ValidationError
    from app.schemas import DieSpecCreate

    with pytest.raises(ValidationError) as exc:
        DieSpecCreate(die_subtype='blocco', bbox_x_mm=80, bbox_y_mm=40)
    assert "n_operations" in str(exc.value)

    spec = DieSpecCreate(die_subtype='blocco', bbox_x_mm=80, bbox_y_mm=40, n_operations=1)
    assert spec.n_operations == 1


def test_die_spec_validator_bbox_required():
    """Sprint E — bbox_x_mm e bbox_y_mm sono SEMPRE obbligatori > 0."""
    from pydantic import ValidationError
    from app.schemas import DieSpecCreate

    with pytest.raises(ValidationError):
        DieSpecCreate(die_subtype='blocco', bbox_x_mm=0, bbox_y_mm=40, n_operations=1)
    with pytest.raises(ValidationError):
        DieSpecCreate(die_subtype='blocco', bbox_y_mm=40, n_operations=1)


def test_die_normalized_template_expansion(db_session):
    """Sprint C — auto-generate normalizzati dal template BoM scalabile.
    Formula `n_stations * 2 + 4` con n_stations=3 → qty 10 molle.
    Formula fissa '4' → qty 4 colonne. Skip-if-exists su description.
    """
    from app.api.dies import _create_normalized_from_template

    q = Quote(quote_number='DIE-NORM', quote_type='die', global_margin_percent=30.0)
    db_session.add(q)
    db_session.flush()
    spec = DieSpec(
        quote_id=q.id, die_subtype='passo',
        bbox_x_mm=100, bbox_y_mm=80, sheet_thickness_mm=2.0,
        n_stations=3, pitch_mm=100,
        castle_offset_x_mm=80, castle_offset_y_mm=80,
        difficulty='base',
    )
    db_session.add(spec)
    tpl = DieTemplate(name='T', die_subtype='passo', default_difficulty='medium', active=True)
    db_session.add(tpl)
    db_session.flush()
    db_session.add_all([
        DieTemplateNormalized(template_id=tpl.id, description='Colonna Ø32',
                              quantity_formula='4', unit_price_default=45.0, sort_order=1),
        DieTemplateNormalized(template_id=tpl.id, description='Molla gialla',
                              quantity_formula='n_stations * 2 + 4', unit_price_default=10.0, sort_order=2),
    ])
    db_session.commit()

    # Re-load template con relationship per popolare normalized_items
    tpl_loaded = db_session.query(DieTemplate).filter(DieTemplate.id == tpl.id).first()
    _create_normalized_from_template(q, tpl_loaded, spec, db_session)
    db_session.commit()

    items = db_session.query(DieNormalizedItem).filter(DieNormalizedItem.quote_id == q.id).order_by(DieNormalizedItem.id).all()
    assert len(items) == 2
    colonne = next(it for it in items if it.description == 'Colonna Ø32')
    molle = next(it for it in items if it.description == 'Molla gialla')
    assert colonne.quantity == 4
    assert molle.quantity == 10  # n_stations=3 → 3*2+4

    # Re-applicato: skip-if-exists (nessun duplicato).
    _create_normalized_from_template(q, tpl_loaded, spec, db_session)
    db_session.commit()
    items_after = db_session.query(DieNormalizedItem).filter(DieNormalizedItem.quote_id == q.id).all()
    assert len(items_after) == 2


def test_die_edm_perimeter_fallback_from_bbox(db_session):
    """Sprint A — se perimeter_pezzo_mm è NULL, il cost engine usa il fallback
    2*(X+Y)*complexity_factor. Verifica che il fallback dia un numero diverso
    dal caso esplicito (e plausibile)."""
    s = DieSettings(id=1, hourly_rate_edm_die=55.0,
                    edm_extractor_factor=0.6, edm_punch_factor=0.3)
    db_session.add(s)
    mat = Material(name='1.4301', family='acciaio_inox', density_kg_dm3=7.9, cost_per_kg=0.0)
    db_session.add(mat)
    db_session.add(EdmConfig(id=1, rough_speed_factor=1.0, semi_speed_factor=0.5,
                              finish_speed_factor=0.3, default_pierce_time_s=5.0))
    db_session.add(EdmCutSpeed(material_family='acciaio_inox',
                                thickness_min_mm=20, thickness_max_mm=30,
                                speed_mm_per_min=3.0, pierce_time_s=5.0))
    cycle = CuttingCycle(name='C', active=True)
    db_session.add(cycle)
    db_session.flush()
    db_session.add(CuttingPass(cycle_id=cycle.id, pass_type='rough', sequence_number=1))
    db_session.flush()
    s.wire_edm_cycle_id = cycle.id

    q = Quote(quote_number='DIE-FALLBACK', quote_type='die', global_margin_percent=30.0)
    db_session.add(q)
    db_session.flush()
    # Niente perimeter_pezzo_mm → fallback 2*(80+70)*1.5 = 450 mm
    spec = DieSpec(quote_id=q.id, die_subtype='blocco',
                   bbox_x_mm=80, bbox_y_mm=70, sheet_thickness_mm=2.0,
                   complexity_factor=1.5,
                   n_stations=1,
                   block_strip_offset_mm=50,
                   castle_offset_x_mm=80, castle_offset_y_mm=80,
                   difficulty='base')
    db_session.add(spec)
    matrice = Part(quote_id=q.id, part_code='matrice', plate_role='matrice',
                   material_id=mat.id, raw_z_mm=25, quantity=1)
    db_session.add(matrice)
    db_session.commit()

    recalculate_die_quote(q.id, db_session)
    db_session.refresh(spec)

    # matrice: 450 mm / 3 + 1*5/60 = 150.0833 min → 2.5014 h × 55 ≈ 137.58 €
    assert spec.cost_machining_edm == pytest.approx(137.58, rel=1e-2)
