"""Nucleo costi — atomi economici puri (E2, spec 17 F2).

Un solo posto per le formule del preventivo standard: nessuna dipendenza da
DB, FastAPI o React. `services/calculation.recalculate_quote` risolve prima i
dati di dominio (rate macchina, aggregazioni batch) e poi compone questi atomi.

Gemelli DRY del frontend (rete di parità in `tests/fixtures/cost_golden_cases.json`):
- `phase_cost`   ↔ `quoteCalc.calcPhaseCost`
- `part_totals`  ↔ `quoteCalc.calcPartTotals`
Vanno tenuti IDENTICI: una modifica qui va replicata nel gemello, stesso commit.
"""
from typing import Optional, Tuple


def round4(x: float) -> float:
    """Arrotonda a 4 decimali half-away-from-zero (gemello di Math.round JS).

    Python `round()` usa banker's rounding (0.5→0); Math.round in V8 usa
    half-away-from-zero (0.5→1). Qui allineiamo il backend al frontend.
    """
    if x >= 0:
        return int(x * 10000 + 0.5) / 10000
    return -int(-x * 10000 + 0.5) / 10000


def phase_cost(
    *,
    setup_hours: Optional[float],
    cycle_hours_per_part: Optional[float],
    fixed_cost: Optional[float],
    variable_cost_per_part: Optional[float],
    work_rate: float,
    setup_rate: float,
    qty: int,
) -> float:
    """Costo per pezzo di una fase (rate GIÀ risolte). `divisor = qty`.

    setup amortizzato su qty (rate attrezzaggio) + ciclo × rate lavorazione +
    costo fisso amortizzato + variabile per pezzo. `is_shared` rimosso.
    """
    divisor = qty
    cost = (
        (setup_hours or 0.0) * setup_rate / divisor
        + (cycle_hours_per_part or 0.0) * work_rate
        + (fixed_cost or 0.0) / divisor
        + (variable_cost_per_part or 0.0)
    )
    return round4(cost)


def part_totals(
    *,
    material_cost: Optional[float],
    delivery_per_piece: float,
    cutting_per_piece: float,
    phase_total: float,
    minimum_price: Optional[float],
    margin_percent: Optional[float],
    qty: int,
) -> Tuple[float, float, float]:
    """Ritorna (total_cost, unit_price, total_price).

    C4: niente doppio arrotondamento — `base` a piena precisione, `unit_price`
    a 4 decimali (display), `total_price` arrotondato a 2 dal valore esatto.
    """
    total_cost = round(
        (material_cost or 0.0) + delivery_per_piece + cutting_per_piece + phase_total, 4
    )
    base = max(total_cost, minimum_price or 0.0) * (1 + (margin_percent or 0.0) / 100)
    unit_price = round(base, 4)
    total_price = round(base * qty, 2)
    return total_cost, unit_price, total_price


def quote_total(
    *,
    parts_total_price_sum: float,
    transport_cost: Optional[float],
    packaging_cost: Optional[float],
    global_discount_percent: Optional[float],
) -> float:
    """Totale preventivo STANDARD. Gemello di `quoteCalc.calcQuoteTotal`.

    Σ prezzi parte + trasporto + imballaggio, poi sconto globale sul totale.
    Lo sconto è sottratto NON arrotondato (round finale una sola volta), per
    coerenza con l'anteprima frontend e i golden.
    """
    after = parts_total_price_sum + (transport_cost or 0.0) + (packaging_cost or 0.0)
    discount = after * ((global_discount_percent or 0.0) / 100)
    return round(after - discount, 2)


def quote_total_die(
    *,
    cost_material: float,
    cost_normalized: float,
    cost_machining: float,
    cost_accessories: float,
    override_material: Optional[float] = None,
    override_normalized: Optional[float] = None,
    override_machining: Optional[float] = None,
    override_accessories: Optional[float] = None,
    global_margin_percent: Optional[float],
    global_discount_percent: Optional[float],
) -> float:
    """Totale preventivo STAMPO. Gemello del ramo `die` di `calcQuoteTotal`.

    Industriale (L5, con override matita null-coalesce) × margine globale (L6)
    × sconto globale (L7). Arrotondato a 2 (una sola volta).
    """
    eff_m = override_material if override_material is not None else cost_material
    eff_n = override_normalized if override_normalized is not None else cost_normalized
    eff_mac = override_machining if override_machining is not None else cost_machining
    eff_acc = override_accessories if override_accessories is not None else cost_accessories
    industrial = (eff_m or 0.0) + (eff_n or 0.0) + (eff_mac or 0.0) + (eff_acc or 0.0)
    with_margin = industrial * (1 + (global_margin_percent or 0.0) / 100)
    return round(with_margin * (1 - (global_discount_percent or 0.0) / 100), 2)
