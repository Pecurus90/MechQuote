"""TD-7 — foratura a elettrodo: autocalc ore + consumo elettrodo.

Verifica `_compute_drill_edm` in DB in-memory: calcolo su fase di foratura,
no-op su fasi non-foratura, gestione input/cataloghi mancanti, fattori
(usura/margine) configurabili da EdmConfig.
"""
from app.models import (
    EdmConfig, Machine, Material, DrillingTime, Electrode, Part, Quote,
    ManufacturingPhase,
)
from app.services.calculation import _compute_drill_edm


def _base(db, *, wear=2.0, margin=5.0, with_electrode=True, with_speed=True):
    drill = Machine(name="Foratrice EDM", hourly_rate=50)
    other = Machine(name="Fresa", hourly_rate=50)
    db.add_all([drill, other]); db.flush()
    db.add(EdmConfig(id=1, default_drilling_machine_id=drill.id,
                     electrode_wear_factor=wear, electrode_margin_percent=margin))
    mat = Material(name="C45", family="acciaio_carbonio")
    db.add(mat); db.flush()
    if with_speed:
        db.add(DrillingTime(material_family="acciaio_carbonio",
                            electrode_diameter_mm=3.0, speed_mm_per_sec=0.5))
    if with_electrode:
        db.add(Electrode(diameter_mm=3.0, length_mm=300.0, price=30.0))  # €/mm = 0.1
    q = Quote(quote_number="X", quote_type="single", status="bozza")
    db.add(q); db.flush()
    part = Part(quote_id=q.id, part_code="P", quantity=1, material_id=mat.id)
    db.add(part); db.flush()
    db.commit()
    return drill, other, part


def _phase(db, machine_id, part_id, **kw):
    ph = ManufacturingPhase(part_id=part_id, machine_id=machine_id,
                            phase_type="drilling", sequence_number=1, **kw)
    db.add(ph); db.flush(); db.refresh(ph)
    return ph


def test_hours_and_cost(db_session):
    drill, _other, part = _base(db_session)
    ph = _phase(db_session, drill.id, part.id,
                electrode_diameter_mm=3.0, n_holes=10, drill_depth_mm=20.0)
    hours, cost = _compute_drill_edm(ph, part, db_session)
    # ore = 10×20 / 0.5 / 3600
    assert hours == round(10 * 20 / 0.5 / 3600, 4)
    # consumo = 10×20×2×1.05 = 420 mm; costo = 420 × 0.1 = 42.0
    assert cost == 42.0


def test_not_drilling_phase_returns_none(db_session):
    _drill, other, part = _base(db_session)
    ph = _phase(db_session, other.id, part.id,
                electrode_diameter_mm=3.0, n_holes=10, drill_depth_mm=20.0)
    assert _compute_drill_edm(ph, part, db_session) is None


def test_missing_inputs_no_override(db_session):
    drill, _other, part = _base(db_session)
    ph = _phase(db_session, drill.id, part.id, electrode_diameter_mm=3.0, n_holes=None)
    assert _compute_drill_edm(ph, part, db_session) == (None, None)


def test_no_electrode_catalog_cost_none(db_session):
    drill, _other, part = _base(db_session, with_electrode=False)
    ph = _phase(db_session, drill.id, part.id,
                electrode_diameter_mm=3.0, n_holes=10, drill_depth_mm=20.0)
    hours, cost = _compute_drill_edm(ph, part, db_session)
    assert hours is not None and cost is None


def test_no_speed_row_hours_none(db_session):
    drill, _other, part = _base(db_session, with_speed=False)
    ph = _phase(db_session, drill.id, part.id,
                electrode_diameter_mm=3.0, n_holes=10, drill_depth_mm=20.0)
    hours, cost = _compute_drill_edm(ph, part, db_session)
    assert hours is None and cost == 42.0


def test_configurable_factors(db_session):
    drill, _other, part = _base(db_session, wear=3.0, margin=10.0)
    ph = _phase(db_session, drill.id, part.id,
                electrode_diameter_mm=3.0, n_holes=10, drill_depth_mm=20.0)
    _hours, cost = _compute_drill_edm(ph, part, db_session)
    # consumo = 10×20×3×1.10 = 660 mm; costo = 660 × 0.1 = 66.0
    assert cost == 66.0
