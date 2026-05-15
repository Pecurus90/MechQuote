"""Test unit del cost engine modulo Stampi — `_recalculate_die_addons`.

Copre i livelli L1-L4 + L5 industriale snapshot su DieQuoteSpec:
- L1 materiale piastre: somma Part.total_cost × qty
- L2 normalizzati: somma qty × unit_price
- L3 lavorazioni: feature × coeff_dim × coeff_diff + base × n_plates
- L4 accessori: design hours × rate + assembly forfeit + extras
- Lookup DieDimensionBracket per area (S/M/L/XL)
- Coefficiente difficoltà
"""
import pytest

from app.models import (
    Quote, Part, Material, DieQuoteSpec, DieSettings, DieDimensionBracket,
    NormalizedItem, NormalizedSupplier,
)
from app.services.calculation import recalculate_quote


def _seed_settings_and_brackets(db):
    """Singleton DieSettings + 4 fasce dimensionali. Riproduce il seed delle migrations."""
    s = DieSettings(
        id=1,
        hourly_rate_milling=45, hourly_rate_grinding=50,
        hourly_rate_edm_wire=60, hourly_rate_edm_die=55,
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
    db.add_all([
        DieDimensionBracket(label='S', area_min_dm2=0, area_max_dm2=20, coefficient=1.0, sort_order=1),
        DieDimensionBracket(label='M', area_min_dm2=20, area_max_dm2=50, coefficient=1.3, sort_order=2),
        DieDimensionBracket(label='L', area_min_dm2=50, area_max_dm2=100, coefficient=1.6, sort_order=3),
        DieDimensionBracket(label='XL', area_min_dm2=100, area_max_dm2=None, coefficient=2.0, sort_order=4),
    ])
    db.flush()


def _make_die_quote(db, difficulty='base', **spec_kwargs) -> tuple[Quote, DieQuoteSpec]:
    q = Quote(quote_number=f"TST-26X_{difficulty}", quote_type='die', global_margin_percent=30.0)
    db.add(q)
    db.flush()
    spec = DieQuoteSpec(quote_id=q.id, die_subtype='passo', difficulty=difficulty, **spec_kwargs)
    db.add(spec)
    db.flush()
    return q, spec


def test_die_l3_base_difficulty_small_castle(db_session):
    """L3 con 2 pieghe semplici + 1 punzone semplice, castello 20×10cm (=20 dm²) → fascia S coeff 1.0, diff base 1.0."""
    _seed_settings_and_brackets(db_session)
    q, spec = _make_die_quote(
        db_session, difficulty='base',
        n_bends_simple=2, n_punches_simple=1,
    )
    # 2 piastre 200×100mm = 20×10cm = 20 dm² → fascia S (incluso al limite con area_min)
    for role in ['cappello', 'matrice']:
        db_session.add(Part(
            quote_id=q.id, part_code=f"TST-{role}", description=role,
            plate_role=role, raw_x_mm=200, raw_y_mm=100, raw_z_mm=20, quantity=1,
        ))
    db_session.commit()

    recalculate_quote(q.id, db_session)
    db_session.refresh(spec)

    # L3:
    #  - bends = 2 × 80 × 1.0 (S) × 1.0 (base) = 160
    #  - punches = 1 × 120 × 1.0 × 1.0 = 120
    #  - plates_base = 2 × 150 = 300
    #  - total = 580
    assert spec.cost_machining == pytest.approx(580.0, rel=1e-3)


def test_die_l3_hard_difficulty_large_castle(db_session):
    """L3 con feature varie, castello 400×300mm = 12 dm² (S)... no, area=120 dm² → XL coeff 2.0, diff hard 1.7."""
    _seed_settings_and_brackets(db_session)
    q, spec = _make_die_quote(
        db_session, difficulty='hard',
        n_bends_simple=1, n_bends_medium=1, n_punches_complex=1,
    )
    # Piastra 1000×1200mm = 100×120cm = 100×120/100 = 120 dm² → XL coeff 2.0
    db_session.add(Part(
        quote_id=q.id, part_code="TST-mat", description='matrice',
        plate_role='matrice', raw_x_mm=1000, raw_y_mm=1200, raw_z_mm=50, quantity=1,
    ))
    db_session.commit()

    recalculate_quote(q.id, db_session)
    db_session.refresh(spec)

    # area = 1000 × 1200 / 10000 = 120 dm² → XL coeff 2.0; diff hard 1.7
    # bends = (1×80 + 1×160) × 2.0 × 1.7 = 240 × 3.4 = 816
    # punches = 1 × 480 × 2.0 × 1.7 = 1632
    # plates_base = 1 × 150 = 150
    # total = 816 + 1632 + 150 = 2598
    assert spec.cost_machining == pytest.approx(2598.0, rel=1e-3)


def test_die_l4_accessories(db_session):
    """L4: progettazione (medium 16h × 50€/h) + montaggio medium (600€) + extras 200€ = 1600."""
    _seed_settings_and_brackets(db_session)
    q, spec = _make_die_quote(
        db_session, difficulty='medium',
        extras_amount=200,
    )
    db_session.add(Part(quote_id=q.id, part_code="TST-A", plate_role='base', quantity=1))
    db_session.commit()

    recalculate_quote(q.id, db_session)
    db_session.refresh(spec)

    # design = 16 × 50 = 800
    # assembly = 600
    # extras = 200
    # total = 1600
    assert spec.cost_accessories == pytest.approx(1600.0, rel=1e-3)


def test_die_l2_normalized_items(db_session):
    """L2: 2 normalizzati (10 viti × 0.5€ + 4 perni × 25€) = 5 + 100 = 105."""
    _seed_settings_and_brackets(db_session)
    supplier = NormalizedSupplier(name='Bossard')
    db_session.add(supplier)
    db_session.flush()
    q, spec = _make_die_quote(db_session, difficulty='base')
    plate = Part(quote_id=q.id, part_code="TST-base", plate_role='base', quantity=1)
    db_session.add(plate)
    db_session.flush()
    db_session.add_all([
        NormalizedItem(part_id=plate.id, normalized_supplier_id=supplier.id,
                       description='Vite M5×20', quantity=10, unit_price=0.5),
        NormalizedItem(part_id=plate.id, normalized_supplier_id=supplier.id,
                       description='Perno cilindrico Ø8', quantity=4, unit_price=25.0),
    ])
    db_session.commit()

    recalculate_quote(q.id, db_session)
    db_session.refresh(spec)

    assert spec.cost_normalized == pytest.approx(105.0, rel=1e-3)


def test_die_industrial_total(db_session):
    """L5 industriale = somma L1+L2+L3+L4. Verifica integrazione completa."""
    _seed_settings_and_brackets(db_session)
    mat = Material(name="Acciaio", family="acciaio", density_kg_dm3=7.85,
                   cost_per_kg=3.0, default_scrap_percent=10)
    db_session.add(mat)
    db_session.flush()

    q, spec = _make_die_quote(
        db_session, difficulty='base',
        n_bends_simple=1, n_punches_simple=1, extras_amount=100,
    )
    # 1 piastra 100×100×20mm in acciaio (volume 0.2 dm³, peso 1.57 kg, cost 1.57×3×1.1≈5.18€)
    db_session.add(Part(
        quote_id=q.id, part_code="TST-mat", plate_role='matrice',
        material_id=mat.id, raw_x_mm=100, raw_y_mm=100, raw_z_mm=20, quantity=1,
    ))
    db_session.commit()

    recalculate_quote(q.id, db_session)
    db_session.refresh(spec)

    # L1 ~= 5.18 (materiale + ~0 delivery senza supplier)
    # L2 = 0 (nessun normalizzato)
    # L3 = 80 (bend) + 120 (punch) + 150 (plate base) = 350. area 1dm² → S coeff 1.0
    # L4 = 8×50 + 300 + 100 = 800
    # industriale ≈ 5.18 + 0 + 350 + 800 = 1155.18
    assert spec.cost_industrial == pytest.approx(spec.cost_material + spec.cost_normalized + spec.cost_machining + spec.cost_accessories, rel=1e-3)
    assert spec.cost_machining == pytest.approx(350.0, rel=1e-3)
    assert spec.cost_accessories == pytest.approx(800.0, rel=1e-3)
    assert spec.cost_industrial == pytest.approx(spec.cost_material + 0 + 350 + 800, rel=1e-3)
