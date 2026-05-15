"""Test unit del cost engine — `services/calculation.py`.

Copre i flussi critici (CLAUDE.md §4):
- Parte manuale: setup + cycle, margin, total_price
- Batch trattamento: aggregazione per (treatment_id, material_id), forfait soglia
- Wire EDM autocalc: lookup velocità per famiglia, applica factors passate
- Material cost: volume × density × €/kg × scrap

I numeri attesi sono calcolati a mano e verificati contro la formula nel
gemello frontend (`frontend/src/lib/quoteCalc.ts`): se uno dei due cambia
e l'altro no, il test fallisce — è la rete di sicurezza DRY.
"""
import pytest

from app.models import (
    Quote, Part, ManufacturingPhase, Machine, Material, Treatment,
    EdmConfig, EdmCutSpeed, CuttingCycle, CuttingPass,
)
from app.services.calculation import recalculate_part


def _make_quote(db, **kwargs) -> Quote:
    defaults = dict(quote_number="TST-26X_001", quote_type="single", global_margin_percent=20.0)
    defaults.update(kwargs)
    q = Quote(**defaults)
    db.add(q)
    db.flush()
    return q


def _make_part(db, quote: Quote, **kwargs) -> Part:
    defaults = dict(quote_id=quote.id, part_code="TST-26X_001", quantity=1)
    defaults.update(kwargs)
    p = Part(**defaults)
    db.add(p)
    db.flush()
    return p


def test_manual_quote_total(db_session):
    """Parte manuale, 1 fase setup 0.5h + cycle 0.25h × qty 10 a 50€/h, margin 20%."""
    q = _make_quote(db_session)
    machine = Machine(name="Fresa", hourly_rate=50.0)  # setup_hourly_rate=NULL → fallback
    db_session.add(machine)
    db_session.flush()
    p = _make_part(db_session, q, quantity=10, margin_percent=20.0)
    ph = ManufacturingPhase(
        part_id=p.id, sequence_number=10, phase_type="manual",
        machine_id=machine.id, setup_hours=0.5, cycle_hours_per_part=0.25,
        fixed_cost=0.0, variable_cost_per_part=0.0,
    )
    db_session.add(ph)
    db_session.commit()

    recalculate_part(p.id, db_session)
    db_session.refresh(p)
    db_session.refresh(ph)

    # setup amortizzato: (0.5 × 50) / 10 = 2.5; cycle: 0.25 × 50 = 12.5
    # phase.calculated_cost = 2.5 + 12.5 = 15.0
    assert ph.calculated_cost == pytest.approx(15.0, rel=1e-3)
    # No material → total_cost = phase_cost = 15.0
    assert p.total_cost == pytest.approx(15.0, rel=1e-3)
    # Margin 20% → unit_price = 15 × 1.2 = 18.0
    assert p.unit_price == pytest.approx(18.0, rel=1e-3)
    # total_price = unit × qty = 18 × 10 = 180.0
    assert p.total_price == pytest.approx(180.0, rel=1e-3)


def test_batch_treatment_aggregate(db_session):
    """3 parti stesso (treatment, material), batch 100kg > soglia 50 → costo per kg, no forfait."""
    q = _make_quote(db_session)
    mat = Material(name="Acciaio", family="acciaio", density_kg_dm3=7.85, cost_per_kg=0.0)
    treat = Treatment(name="Bonifica", cost_per_kg=2.0, minimum_weight_kg=50.0, minimum_cost=200.0)
    db_session.add_all([mat, treat])
    db_session.flush()

    parts = []
    for i, w in enumerate([30.0, 35.0, 35.0]):
        p = _make_part(db_session, q, part_code=f"TST-26X_001_{i+1}",
                       material_id=mat.id, finished_weight_kg=w)
        ph = ManufacturingPhase(
            part_id=p.id, sequence_number=10, phase_type="treatment",
            treatment_id=treat.id, setup_hours=0.0, cycle_hours_per_part=0.0,
            fixed_cost=0.0, variable_cost_per_part=0.0,
        )
        db_session.add(ph)
        parts.append((p, ph))
    db_session.commit()

    recalculate_part(parts[0][0].id, db_session)

    # batch = 30+35+35 = 100 kg, total_cost = 2.0 × 100 = 200, NO forfait
    # quota per parte = total_cost × finished_weight / batch_w / qty
    # Part1: 200 × 30 / 100 / 1 = 60.0
    # Part2: 200 × 35 / 100 / 1 = 70.0
    expected = [60.0, 70.0, 70.0]
    for (p, ph), exp in zip(parts, expected):
        db_session.refresh(ph)
        assert ph.variable_cost_per_part == pytest.approx(exp, rel=1e-3), (
            f"Part {p.part_code}: atteso {exp}, ottenuto {ph.variable_cost_per_part}"
        )


def test_batch_treatment_under_threshold(db_session):
    """1 parte 10kg sotto soglia 50kg → forfait minimum_cost."""
    q = _make_quote(db_session)
    mat = Material(name="Acciaio", family="acciaio")
    treat = Treatment(name="Bonifica", cost_per_kg=2.0, minimum_weight_kg=50.0, minimum_cost=200.0)
    db_session.add_all([mat, treat])
    db_session.flush()

    p = _make_part(db_session, q, material_id=mat.id, finished_weight_kg=10.0)
    ph = ManufacturingPhase(
        part_id=p.id, sequence_number=10, phase_type="treatment",
        treatment_id=treat.id,
    )
    db_session.add(ph)
    db_session.commit()

    recalculate_part(p.id, db_session)
    db_session.refresh(ph)

    # 10 kg < 50 kg → forfait 200€. 1 parte qty=1 → variable = 200/1 = 200.
    assert ph.variable_cost_per_part == pytest.approx(200.0, rel=1e-3)


def test_edm_autocalc(db_session):
    """Fase wire_edm: cut_length 100mm × ciclo (1 rough + 1 finish) @ 8mm/min."""
    q = _make_quote(db_session)
    mat = Material(name="Acciaio inox", family="acciaio_inox")
    machine = Machine(name="Wire EDM", machine_type="wire_edm", hourly_rate=100.0)
    cfg = EdmConfig(id=1, rough_speed_factor=1.0, semi_speed_factor=0.9,
                    finish_speed_factor=0.7, default_pierce_time_s=2.0)
    speed = EdmCutSpeed(
        material_family="acciaio_inox", thickness_min_mm=0.0, thickness_max_mm=15.0,
        speed_mm_per_min=8.0, pierce_time_s=2.0,
    )
    cycle = CuttingCycle(name="1R+1F")
    db_session.add_all([mat, machine, cfg, speed, cycle])
    db_session.flush()
    db_session.add_all([
        CuttingPass(cycle_id=cycle.id, sequence_number=1, pass_type="rough"),
        CuttingPass(cycle_id=cycle.id, sequence_number=2, pass_type="finish"),
    ])

    p = _make_part(db_session, q, material_id=mat.id, quantity=1)
    ph = ManufacturingPhase(
        part_id=p.id, sequence_number=10, phase_type="wire_edm",
        machine_id=machine.id, cut_length_mm=100.0, cut_height_mm=10.0,
        cutting_cycle_id=cycle.id, n_pierce=0,
    )
    db_session.add(ph)
    db_session.commit()

    recalculate_part(p.id, db_session)
    db_session.refresh(ph)

    # tempo = 100/(8×1.0) + 100/(8×0.7) = 12.5 + 17.857142 = 30.357142 min
    # → 30.357142 / 60 = 0.5060 h (round 4 decimali)
    expected_hours = round((100.0 / 8.0 + 100.0 / 5.6) / 60.0, 4)
    assert ph.cycle_hours_per_part == pytest.approx(expected_hours, rel=1e-3)
    # Costo fase: cycle × hourly = 0.5060 × 100 ≈ 50.60
    assert ph.calculated_cost == pytest.approx(expected_hours * 100, rel=1e-3)


def test_material_cost_prismatic(db_session):
    """Parte 100×50×10mm in acciaio (density 7.85, cost 2.5€/kg, scrap 10%) → ~1.08€."""
    q = _make_quote(db_session)
    mat = Material(
        name="Acciaio C40", family="acciaio",
        density_kg_dm3=7.85, cost_per_kg=2.5, default_scrap_percent=10.0,
    )
    db_session.add(mat)
    db_session.flush()
    p = _make_part(db_session, q,
                   material_id=mat.id, raw_x_mm=100.0, raw_y_mm=50.0, raw_z_mm=10.0)
    db_session.commit()

    recalculate_part(p.id, db_session)
    db_session.refresh(p)

    # vol = 100×50×10 / 1_000_000 = 0.05 dm3 → 0.05 × 7.85 = 0.3925 kg
    # cost = 0.3925 × 2.5 × 1.1 = 1.07937... → round 2 decimali = 1.08
    assert p.material_cost == pytest.approx(1.08, abs=0.01)
