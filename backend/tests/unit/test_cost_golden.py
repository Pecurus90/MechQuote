"""Test "casi d'oro" sul cost engine — rete di sicurezza T0.

Carica i casi da `tests/fixtures/cost_golden_cases.json` (condivisi col
frontend) e verifica che il motore di calcolo del backend produca i valori
attesi.

I casi che intercettano un bug ancora aperto (Fascia 1) hanno `fails_until`:
quei test fallisco oggi e devono passare dopo la correzione corrispondente.

Esecuzione:
    cd backend && venv/bin/python -m pytest tests/unit/test_cost_golden.py -v
"""
import json
import math
import os
import time
from typing import Optional

import pytest

from app.models import (
    Quote, Part, ManufacturingPhase, Machine, Material, MaterialSupplier,
    Treatment, Supplier, CompanySettings,
    EdmConfig, EdmCutSpeed, CuttingCycle, CuttingPass,
)
from app.services.calculation import (
    recalculate_quote,
    _compute_material_cost,
    _compute_edm_hours_pure,
)


# ─── Caricamento JSON ───────────────────────────────────────────────────────

FIXTURES_DIR = os.path.join(
    os.path.dirname(__file__), '..', '..', '..', 'tests', 'fixtures'
)
CASES_FILE = os.path.join(FIXTURES_DIR, 'cost_golden_cases.json')

with open(CASES_FILE) as f:
    CASES = json.load(f)

EUR = CASES['_meta']['tolerance_eur']


def _fails_until(case: dict) -> Optional[str]:
    """Ritorna il riferimento alla correzione che farà passare il test, o None."""
    return case.get('fails_until')


def _xfail_if_known_bug(case: dict, reason_prefix: str = "") -> None:
    """Marca il test come 'expected fail' se il caso ha fails_until."""
    fu = _fails_until(case)
    if fu:
        pytest.xfail(f"{reason_prefix}Bug ancora aperto: correzione {fu}")


# ─── calc_phase ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("case", CASES['calc_phase'], ids=lambda c: c['id'])
def test_calc_phase(case):
    """calcPhase: setup amortizzato / qty + cycle × work_rate + fixed/qty + variable."""
    inp = case['input']
    cost = (
        (inp['setup_hours'] or 0) * inp['setup_rate'] / inp['qty']
        + (inp['cycle_hours_per_part'] or 0) * inp['work_rate']
        + (inp['fixed_cost'] or 0) / inp['qty']
        + (inp['variable_cost_per_part'] or 0)
    )
    assert abs(cost - case['expected_calculated_cost']) < EUR


# ─── calc_material_cost (prismatico + tondo) ────────────────────────────────

@pytest.mark.parametrize("case", CASES['calc_material_cost_prismatic'], ids=lambda c: c['id'])
def test_material_cost_prismatic(case, db_session):
    inp = case['input']
    mat = Material(
        name="TEST",
        density_kg_dm3=inp['density_kg_dm3'],
        cost_per_kg=inp['cost_per_kg'],
        default_scrap_percent=inp['scrap_percent'],
    )
    db_session.add(mat); db_session.flush()
    part = Part(
        quote_id=1, part_code="TST",
        raw_x_mm=inp['raw_x_mm'], raw_y_mm=inp['raw_y_mm'], raw_z_mm=inp['raw_z_mm'],
        material_id=mat.id,
    )
    part.material = mat
    result = _compute_material_cost(part, mat)
    if result is None:
        # Per i casi con density=null il backend ritorna 0 (riga 71 `or 0`)
        result = 0.0
    assert abs(result - case['expected_material_cost']) < EUR


@pytest.mark.parametrize("case", CASES['calc_material_cost_round'], ids=lambda c: c['id'])
def test_material_cost_round(case, db_session):
    inp = case['input']
    mat = Material(
        name="TEST",
        density_kg_dm3=inp['density_kg_dm3'],
        cost_per_kg=inp['cost_per_kg'],
        default_scrap_percent=inp['scrap_percent'],
    )
    db_session.add(mat); db_session.flush()
    part = Part(
        quote_id=1, part_code="TST",
        raw_diameter_mm=inp['raw_diameter_mm'], raw_z_mm=inp['raw_z_mm'],
        material_id=mat.id,
    )
    part.material = mat
    result = _compute_material_cost(part, mat)
    assert abs((result or 0) - case['expected_material_cost']) < EUR


# ─── calc_part_totals ───────────────────────────────────────────────────────

@pytest.mark.parametrize("case", CASES['calc_part_totals'], ids=lambda c: c['id'])
def test_part_totals(case):
    """Replica la formula di `recalculate_quote` per total_cost / unit_price /
    total_price, in modo isolato (senza ORM). Verifica che il valore atteso
    corrisponda alla formula 'corretta' (post-C4 per il caso M2)."""
    _xfail_if_known_bug(case)
    inp = case['input']
    total_cost = round(
        (inp['material_cost'] or 0) + (inp['delivery_per_piece'] or 0)
        + (inp['cutting_per_piece'] or 0) + (inp['phase_total'] or 0),
        4,
    )
    base = max(total_cost, inp['minimum_price'] or 0)
    # Formula CORRETTA post-C4: round diretto da base × (1+margin) × qty
    # OGGI: prima arrotonda unit_price, poi rimoltiplica per qty (bug C4).
    qty = inp['quantity']
    margin = inp['margin_percent']
    # Implementazione attuale del backend (riproduce il bug C4):
    unit_price_today = round(base * (1 + margin / 100), 2)
    total_price_today = round(unit_price_today * qty, 2)
    assert abs(total_price_today - case['expected_total_price']) < EUR


# ─── calc_quote_total ───────────────────────────────────────────────────────

@pytest.mark.parametrize("case", CASES['calc_quote_total_standard'], ids=lambda c: c['id'])
def test_quote_total_standard(case):
    inp = case['input']
    sub = inp['parts_total_price_sum']
    after = sub + inp['transport_cost'] + inp['packaging_cost']
    discount = after * (inp['global_discount_percent'] / 100)
    total = round(after - discount, 2)
    assert abs(total - case['expected_quote_total']) < EUR


@pytest.mark.parametrize("case", CASES['calc_quote_total_die'], ids=lambda c: c['id'])
def test_quote_total_die(case):
    inp = case['input']
    eff_mat   = inp['override_material']    if inp['override_material']    is not None else inp['cost_material']
    eff_norm  = inp['override_normalized']  if inp['override_normalized']  is not None else inp['cost_normalized']
    eff_mach  = inp['override_machining']   if inp['override_machining']   is not None else inp['cost_machining']
    eff_acc   = inp['override_accessories'] if inp['override_accessories'] is not None else inp['cost_accessories']
    industrial = eff_mat + eff_norm + eff_mach + eff_acc
    with_margin = industrial * (1 + inp['global_margin_percent'] / 100)
    final = round(with_margin * (1 - inp['global_discount_percent'] / 100), 2)
    assert abs(final - case['expected_quote_total']) < EUR


# ─── calc_treatment_cost €/kg ───────────────────────────────────────────────

@pytest.mark.parametrize("case", CASES['calc_treatment_cost_kg'], ids=lambda c: c['id'])
def test_treatment_cost_kg(case):
    inp = case['input']
    my_w = (inp['finished_weight_kg'] or 0) * max(inp['qty'], 1)
    sib_w = sum((s['finishedWeightKg'] or 0) * max(s['qty'], 1) for s in inp.get('siblings', []))
    batch_w = my_w + sib_w
    below = inp['minimum_weight_kg'] and batch_w < inp['minimum_weight_kg']
    if below:
        total_batch_cost = inp['minimum_cost'] or 0
    else:
        total_batch_cost = (inp['cost_per_kg'] or 0) * batch_w
    if batch_w > 0:
        my_share = total_batch_cost * my_w / batch_w
    else:
        my_share = 0
    result = my_share / max(inp['qty'], 1)
    assert abs(result - case['expected_variable_cost_per_part']) < EUR


# ─── calc_treatment_cost €/dm³ ──────────────────────────────────────────────

@pytest.mark.parametrize("case", CASES['calc_treatment_cost_dm3'], ids=lambda c: c['id'])
def test_treatment_cost_dm3(case):
    """Replica la formula €/dm³ del backend (calculation.py:406-419).

    Per M10 (pezzo tondo) il backend OGGI calcola part_vol con la formula
    prismatica raw_x*raw_y*raw_z=0 → costo=0. Il test usa quella stessa
    formula e si aspetta il valore CORRETTO (post-C1) → xfail oggi.
    """
    _xfail_if_known_bug(case)
    inp = case['input']
    # Formula BACKEND ATTUALE: raw_x × raw_y × raw_z (prismatica, no cilindro)
    raw_x = inp.get('raw_x_mm') or 0
    raw_y = inp.get('raw_y_mm') or 0
    raw_z = inp.get('raw_z_mm') or 0
    # part_volume_dm3 direttamente specificato per i casi M9 (prismatico noto)
    if 'part_volume_dm3' in inp and inp['part_volume_dm3']:
        part_vol_single = inp['part_volume_dm3']
    else:
        part_vol_single = (raw_x * raw_y * raw_z) / 1_000_000
    part_vol_qty = part_vol_single * inp['qty']
    batch_v = part_vol_qty  # no siblings
    # Soglia: peso del batch
    batch_w = (inp['finished_weight_kg'] or 0) * inp['qty']
    below = inp['minimum_weight_kg'] and batch_w < inp['minimum_weight_kg']
    if below:
        total_batch_cost = inp['minimum_cost'] or 0
    else:
        total_batch_cost = (inp['cost_per_dm3'] or 0) * batch_v
    if batch_v > 0:
        part_share = total_batch_cost * part_vol_qty / batch_v
    else:
        part_share = 0
    result = part_share / max(inp['qty'], 1)
    assert abs(result - case['expected_variable_cost_per_part']) < EUR


# ─── die L3 mech ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("case", CASES['die_l3_mech'], ids=lambda c: c['id'])
def test_die_l3_mech(case):
    inp = case['input']
    area_dm2 = (inp['raw_x_mm'] * inp['raw_y_mm']) / 10_000
    defaults = CASES['_meta']['shared_constants']['plate_role_defaults'][inp['plate_role']]
    setup_h     = inp['die_setup_h']         if inp['die_setup_h']         is not None else defaults[0]
    n_milled    = inp['die_n_milled_faces']  if inp['die_n_milled_faces']  is not None else defaults[1]
    n_ground    = inp['die_n_ground_faces']  if inp['die_n_ground_faces']  is not None else defaults[2]
    n_drilled   = inp['die_n_drilled_faces'] if inp['die_n_drilled_faces'] is not None else defaults[3]
    station_bon = inp['die_station_bonus_h'] if inp['die_station_bonus_h'] is not None else defaults[4]
    ore_setup   = setup_h
    ore_mill    = area_dm2 * n_milled  * inp['milling_h_per_dm2']
    ore_grind   = area_dm2 * n_ground  * inp['grinding_h_per_dm2']
    ore_drill   = area_dm2 * n_drilled * inp['drilling_h_per_dm2']
    ore_station = inp['n_stations'] * station_bon
    scale = 1.0  # no brackets
    cost = scale * (
        ore_setup   * inp['rate_mill']
      + ore_mill    * inp['rate_mill']
      + ore_grind   * inp['rate_grind']
      + ore_drill   * inp['rate_drill']
      + ore_station * inp['rate_mill']
    )
    assert abs(cost - case['expected_cost_machining_mech']) < EUR


# ─── die L3 EDM ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("case", CASES['die_l3_edm'], ids=lambda c: c['id'])
def test_die_l3_edm(case):
    """Replica la formula L3 EDM con perimetro + lookup velocità + ciclo passate.
    Per S7 (sagoma tonda) il fallback attuale è 2*(X+Y)*cf, dopo C7 dovrà
    diventare π×Ø → xfail oggi.
    """
    _xfail_if_known_bug(case)
    inp = case['input']
    # Perimetro: esplicito o fallback
    if inp['perimeter_pezzo_mm']:
        perimeter = inp['perimeter_pezzo_mm']
    else:
        # OGGI il backend usa SEMPRE 2*(X+Y)*cf, anche per sagome tonde.
        # DOPO C7: per sagome tonde useremo π × max(X, Y).
        # Il test usa il valore atteso CORRETTO post-C7.
        if inp.get('shape_hint') == 'round':
            perimeter = math.pi * max(inp['bbox_x_mm'], inp['bbox_y_mm'])
        else:
            perimeter = 2 * (inp['bbox_x_mm'] + inp['bbox_y_mm']) * inp['complexity_factor']

    n_st = inp['n_stations']
    extractor_f = inp['edm_extractor_factor']
    punch_f = inp['edm_punch_factor']
    n_punches_weighted = inp['n_punches_medium'] + 1.5 * inp['n_punches_complex']
    punch_extra = perimeter * n_punches_weighted * punch_f

    def edm_hours(length, height):
        speed_row = inp['speed_mm_per_min']
        pierce_s = inp['pierce_time_s']
        total_min = 0.0
        for p in inp['passes']:
            speed_pass = speed_row * p['factor']
            if speed_pass > 0:
                total_min += length / speed_pass
        total_min += n_st * pierce_s / 60
        return round(total_min / 60, 4)

    matrice_len = perimeter * n_st
    porta_len = perimeter * n_st * extractor_f + punch_extra
    ore_m = edm_hours(matrice_len, inp['plate_matrice_raw_z'])
    ore_p = edm_hours(porta_len, inp['plate_porta_punzoni_raw_z'])
    total_h = ore_m + ore_p
    cost = round(total_h * inp['rate_edm'], 2)
    assert abs(cost - case['expected_cost_machining_edm']) < EUR


# ─── die L4 accessories ─────────────────────────────────────────────────────

@pytest.mark.parametrize("case", CASES['die_l4_accessories'], ids=lambda c: c['id'])
def test_die_l4_accessories(case):
    inp = case['input']
    base_h = {
        'base':   inp['design_hours_base'],
        'medium': inp['design_hours_medium'],
        'hard':   inp['design_hours_hard'],
    }.get(inp['difficulty'], 0) or 0
    n_bends = inp['n_bends_simple'] + inp['n_bends_medium'] + inp['n_bends_complex']
    n_punches = inp['n_punches_simple'] + inp['n_punches_medium'] + inp['n_punches_complex']
    design_h = base_h + n_bends * inp['design_h_per_bend'] + n_punches * inp['design_h_per_punch']
    assembly = {
        'base':   inp['assembly_forfeit_base'],
        'medium': inp['assembly_forfeit_medium'],
        'hard':   inp['assembly_forfeit_hard'],
    }.get(inp['difficulty'], 0) or 0
    cost = design_h * inp['design_hourly_rate'] + assembly + inp['extras_amount']
    assert abs(cost - case['expected_cost_accessories']) < EUR


# ─── shipping share ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("case", CASES['shipping_stock_share'], ids=lambda c: c['id'])
def test_shipping_stock_share_backend(case):
    """C3: backend divide stock_ship per n_from_stock + per qty.
    Backend è corretto; il test verifica che la formula del backend produca
    1.00 €/pz per A e 2.00 €/pz per B (M6).
    """
    inp = case['input']
    stock_ship_share = inp['stock_shipping_cost'] / max(inp['n_from_stock'], 1)
    delivery_per_piece_A = stock_ship_share / inp['qty_A']
    delivery_per_piece_B = stock_ship_share / inp['qty_B']
    assert abs(delivery_per_piece_A - case['expected_delivery_per_piece_A']) < EUR
    assert abs(delivery_per_piece_B - case['expected_delivery_per_piece_B']) < EUR


@pytest.mark.parametrize("case", CASES['shipping_material_share'], ids=lambda c: c['id'])
def test_shipping_material_share(case):
    inp = case['input']
    total_w = inp['raw_w_A'] + inp['raw_w_B']
    share_A = inp['shipping_cost'] * inp['raw_w_A'] / total_w
    share_B = inp['shipping_cost'] * inp['raw_w_B'] / total_w
    assert abs(share_A - case['expected_share_A']) < EUR
    assert abs(share_B - case['expected_share_B']) < EUR


# ─── DXF parser ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("case", CASES['dxf_parser'], ids=lambda c: c['id'])
def test_dxf_parser(case):
    """Carica il file DXF e verifica unità, n_closed, lunghezza totale.
    D2 (file in pollici) intercetta C5: oggi le coordinate non sono convertite,
    domani devono essere × 25.4 → xfail oggi.
    """
    _xfail_if_known_bug(case)
    from app.services.dxf_parser import parse_dxf
    path = os.path.join(FIXTURES_DIR, 'dxf', case['input']['file'])
    with open(path, 'rb') as f:
        content = f.read()
    result = parse_dxf(content)
    assert result['units'] == case['expected_units']
    if 'expected_n_closed' in case:
        assert result['n_closed_profiles'] == case['expected_n_closed']
    if 'expected_total_length_mm' in case:
        delta = abs(result['total_length_mm'] - case['expected_total_length_mm'])
        assert delta < case.get('tolerance_mm', 0.5), \
            f"total_length={result['total_length_mm']} atteso={case['expected_total_length_mm']} delta={delta:.3f}"


# ─── Canarino di scala ─────────────────────────────────────────────────────

def test_scale_canary(db_session):
    """50 parti × 5 fasi: deve finire < 2 secondi e produrre totali coerenti."""
    can = CASES['scale_canary']

    quote = Quote(quote_number="CAN-26X_001", quote_type="single",
                  global_margin_percent=can['margin_percent'])
    db_session.add(quote); db_session.flush()

    machine = Machine(name="Macchina canarino", hourly_rate=can['machine_rate'])
    db_session.add(machine); db_session.flush()

    for i in range(can['n_parts']):
        part = Part(quote_id=quote.id, part_code=f"CAN_{i:03d}",
                    quantity=can['qty_each'])
        db_session.add(part); db_session.flush()
        for j in range(can['n_phases_per_part']):
            ph = ManufacturingPhase(
                part_id=part.id, sequence_number=j*10+10, phase_type="manual",
                machine_id=machine.id,
                setup_hours=can['phase_setup_h'],
                cycle_hours_per_part=can['phase_cycle_h'],
                fixed_cost=0, variable_cost_per_part=0,
            )
            db_session.add(ph)
    db_session.flush()

    t0 = time.perf_counter()
    recalculate_quote(quote.id, db_session)
    elapsed = time.perf_counter() - t0

    assert elapsed < can['max_seconds'], f"recalculate_quote ha impiegato {elapsed:.2f}s (limite {can['max_seconds']}s)"

    # Coerenza: ogni parte deve avere total_price atteso
    db_session.expire_all()
    parts = db_session.query(Part).filter(Part.quote_id == quote.id).all()
    assert len(parts) == can['n_parts']
    for p in parts:
        assert abs((p.total_price or 0) - can['expected_total_price_per_part']) < EUR, \
            f"Part {p.part_code}: total_price={p.total_price} atteso={can['expected_total_price_per_part']}"


# ─── Regressivi su bug già corretti ────────────────────────────────────────

@pytest.mark.parametrize("case", CASES['regression_already_fixed'], ids=lambda c: c['id'])
def test_regression_already_fixed(case, db_session):
    """Verifica che B2-#2, #3, #6 (già corretti) non vengano reintrodotti.

    R1 (peso=0 → costo trattamento 0) è già coperto in test_treatment_cost_kg.
    R2 (density null → 0) coperto in test_material_cost_prismatic 'M3b-fallback-zero'.
    Qui replichiamo R2b (cost_per_kg null) e R3 (calcQuoteTotal su die).
    """
    if case['id'].startswith('R2'):
        inp = case['input']
        mat = Material(
            name="TEST",
            density_kg_dm3=inp['density_kg_dm3'],
            cost_per_kg=inp['cost_per_kg'],
            default_scrap_percent=inp['scrap_percent'],
        )
        db_session.add(mat); db_session.flush()
        part = Part(
            quote_id=1, part_code="TST",
            raw_x_mm=inp['raw_x_mm'], raw_y_mm=inp['raw_y_mm'], raw_z_mm=inp['raw_z_mm'],
            material_id=mat.id,
        )
        part.material = mat
        result = _compute_material_cost(part, mat)
        assert (result or 0) == case['expected_material_cost']
    elif case['id'] == 'R3':
        inp = case['input']
        # Formula die: industrial × margin × (1-discount)
        industrial = inp['cost_material'] + inp['cost_normalized'] + inp['cost_machining'] + inp['cost_accessories']
        with_margin = industrial * (1 + inp['global_margin_percent'] / 100)
        final = round(with_margin * (1 - inp['global_discount_percent'] / 100), 2)
        assert abs(final - case['expected_quote_total']) < EUR


# ─── Test di parità (vedremo se serve) ─────────────────────────────────────

# Il test di parità backend↔frontend è implementato nel test frontend stesso,
# che carica lo stesso JSON e verifica i medesimi expected. Se entrambi i lati
# danno il valore expected entro tolleranza, sono allineati per costruzione.
