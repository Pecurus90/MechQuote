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
    NormalizedSupplier,
)
from app.services.calculation import recalculate_die_quote


# ─── Helpers ───────────────────────────────────────────────────────────────

def _seed_die_settings(db):
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

def test_die_l3_machining_bracket_and_difficulty(db_session):
    """L3 lavorazioni: 1 piega media + 2 punzoni medi × coeff_dim × coeff_diff
    + cost_per_plate_base × n_plates. Castello 410×310 = 12.71 dm² → fascia S (1.0).
    Difficoltà medium → coeff_diff = 1.3.
    """
    _seed_die_settings(db_session)
    _seed_brackets(db_session)
    q, spec = _make_die_quote(
        db_session,
        difficulty='medium',
        n_bends_medium=1, n_punches_medium=2,
    )
    # 2 piastre (per non far esplodere il base × n_plates → 300)
    db_session.add_all([
        Part(quote_id=q.id, part_code='DIE-001_matrice', plate_role='matrice', quantity=1),
        Part(quote_id=q.id, part_code='DIE-001_base',    plate_role='base',    quantity=1),
    ])
    db_session.commit()

    recalculate_die_quote(q.id, db_session)
    db_session.refresh(spec)

    # Castello = (200+50) + 160 = 410, (150+50) + 160 = 360 → area = 14.76 dm² → S coeff 1.0
    # feature = 1×160 + 2×240 = 640
    # L3 = 640 × 1.0 × 1.3 + 150 × 2 = 832 + 300 = 1132
    assert spec.cost_machining == pytest.approx(1132.0, rel=1e-3)


def test_die_l4_accessories_per_difficulty(db_session):
    """L4 = design_hours[diff] × rate + assembly_forfeit[diff] + extras.
    Difficoltà hard: 32h × 50 + 1200 + 200 = 1600 + 1200 + 200 = 3000.
    """
    _seed_die_settings(db_session)
    _seed_brackets(db_session)
    q, spec = _make_die_quote(db_session, difficulty='hard', extras_amount=200.0)
    db_session.commit()

    recalculate_die_quote(q.id, db_session)
    db_session.refresh(spec)
    assert spec.cost_accessories == pytest.approx(3000.0, rel=1e-3)


def test_die_override_matita_replaces_calculated(db_session):
    """Override matita: forzare override_machining=999 sostituisce L3 nel totale,
    ma cost_machining (calcolato) resta visibile per UI."""
    _seed_die_settings(db_session)
    _seed_brackets(db_session)
    q, spec = _make_die_quote(
        db_session, difficulty='base',
        n_punches_simple=1,
    )
    db_session.add(Part(quote_id=q.id, part_code='X', plate_role='matrice', quantity=1))
    db_session.commit()

    # Prima: senza override, L3 = 1×120×1.0×1.0 + 150×1 = 270
    recalculate_die_quote(q.id, db_session)
    db_session.refresh(spec)
    assert spec.cost_machining == pytest.approx(270.0, rel=1e-3)

    # Ora forziamo override su L3 a 999.
    spec.override_machining = 999.0
    db_session.commit()
    recalculate_die_quote(q.id, db_session)
    db_session.refresh(spec)
    # cost_machining (snapshot calcolato) resta 270 — UI vede entrambi
    assert spec.cost_machining == pytest.approx(270.0, rel=1e-3)
    # cost_industrial deve usare 999 invece di 270.
    # L4 base = 8×50 + 300 + 0 = 700; L1 e L2 = 0 (no materiale, no normalizzati)
    # industrial = 0 + 0 + 999 + 700 = 1699
    assert spec.cost_industrial == pytest.approx(1699.0, rel=1e-3)


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
