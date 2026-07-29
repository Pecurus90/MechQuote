"""Nucleo costi — atomi economici puri (E2, spec 17 F2).

Un solo posto per le formule del preventivo standard: nessuna dipendenza da
DB, FastAPI o React. `services/calculation.recalculate_quote` risolve prima i
dati di dominio (rate macchina, aggregazioni batch) e poi compone questi atomi.

Gemelli DRY del frontend (rete di parità in `tests/fixtures/cost_golden_cases.json`):
- `phase_cost`   ↔ `quoteCalc.calcPhaseCost`
- `part_totals`  ↔ `quoteCalc.calcPartTotals`
Vanno tenuti IDENTICI: una modifica qui va replicata nel gemello, stesso commit.
"""
import math
from typing import Optional, Tuple


def round4(x: float) -> float:
    """Arrotonda a 4 decimali con la STESSA semantica di `Math.round` JS
    (gemello DRY del frontend, quoteCalc.ts).

    Python `round()` usa banker's rounding (0.5→0). `Math.round` in JS è half-up
    verso +∞: 0.5→1 ma -0.5→0 (NON half-away-from-zero, che darebbe -0.5→-1).
    `math.floor(y + 0.5)` riproduce esattamente `Math.round(y)` su tutto l'asse
    reale — F11: prima il ramo negativo divergeva (era half-away) sui mezzi esatti.
    """
    return math.floor(x * 10000 + 0.5) / 10000


def round2(x: float) -> float:
    """Arrotonda a 2 decimali con la STESSA semantica di `Math.round` JS
    (half-up verso +∞), gemello DRY del frontend (quoteCalc.ts usa
    `Math.round(x*100)/100`). Vedi `round4` per il razionale: il `round()`
    nativo di Python è banker's (0.625→0.62), divergente da JS (0.625→0.63) sui
    mezzi esatti; questo lo evita tenendo anteprima e valore salvato identici.
    """
    return math.floor(x * 100 + 0.5) / 100


# ─── Geometria grezzo / costo materiale (duck-typed su Part/Material) ────────
# Operano su oggetti con attributi raw_*/material/density_kg_dm3/... — nessun
# import ORM per tenere il nucleo puro. Gemelli DRY del frontend quoteCalc.

def raw_weight_kg(part) -> float:
    """Peso del grezzo (kg) di una singola unità della parte.

    Usato per distribuire la spedizione del fornitore materiale (la materia
    prima viaggia come grezzo, non come pezzo finito). 0 se mancano dimensioni
    o densità materiale.
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


def raw_volume_dm3(part) -> float:
    """Volume del grezzo (dm³) di una singola unità della parte.

    Cilindro se `raw_diameter_mm` è valorizzato (π × r² × L), prismatico
    altrimenti (raw_x × raw_y × raw_z). 0 se dati insufficienti. Usato dai
    trattamenti con `cost_unit='dm3'` per il volume del batch.
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


def material_rate_per_kg(material, is_round: bool) -> float:
    """€/kg da applicare secondo la forma del grezzo.

    Tondo E tubo (`is_round=True`) usano `cost_per_kg_round` SOLO quando il
    materiale non ha costo uniforme; prismatico (o materiale uniforme) usa
    `cost_per_kg`. Gemello DRY di `quoteCalc.materialRatePerKg`.
    """
    uniform = True if material.uniform_cost_per_kg is None else bool(material.uniform_cost_per_kg)
    if is_round and not uniform:
        return material.cost_per_kg_round or 0.0
    return material.cost_per_kg or 0.0


def material_cost(part, material) -> Optional[float]:
    """Costo materiale grezzo per pezzo (€) = volume × densità × €/kg × scrap.

    Gemello DRY di `quoteCalc.calcMaterialCost` — devono restare identici.
    Tondo: raw_diameter_mm + raw_z_mm; prismatico: raw_x × raw_y × raw_z.
    Il €/kg dipende dalla forma (vedi `material_rate_per_kg`). Ritorna None
    quando i dati sono insufficienti (il chiamante mantiene il valore salvato).
    """
    if not material:
        return None
    scrap = 1 + (material.default_scrap_percent or 10) / 100
    density = material.density_kg_dm3 or 0
    cost_per_kg = material_rate_per_kg(material, bool(part.raw_diameter_mm))

    if part.raw_diameter_mm:
        r = part.raw_diameter_mm / 2
        l = part.raw_z_mm or 0
        if not r or not l:
            return None
        vol_dm3 = (math.pi * r * r * l) / 1_000_000
        kg = vol_dm3 * density
        return round2(kg * cost_per_kg * scrap)

    x = part.raw_x_mm or 0
    y = part.raw_y_mm or 0
    z = part.raw_z_mm or 0
    if not x or not y or not z:
        return None
    vol_dm3 = (x * y * z) / 1_000_000
    kg = vol_dm3 * density
    return round2(kg * cost_per_kg * scrap)


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
    total_cost = round4(
        (material_cost or 0.0) + delivery_per_piece + cutting_per_piece + phase_total
    )
    base = max(total_cost, minimum_price or 0.0) * (1 + (margin_percent or 0.0) / 100)
    # F1 (audit §5): floor difensivo a 0 — un margine < -100% (che può arrivare
    # da un import backup o da una scrittura diretta che bypassa la validazione
    # input) darebbe un prezzo negativo fino al PDF. I casi normali (anche in
    # perdita, margine tra -100% e 0) restano invariati.
    base = max(0.0, base)
    unit_price = round4(base)
    total_price = round2(base * qty)
    return total_cost, unit_price, total_price


def treatment_cost_per_part(
    *,
    cost_unit: Optional[str],
    cost_per_kg: Optional[float],
    cost_per_dm3: Optional[float],
    minimum_weight_kg: Optional[float],
    minimum_cost: Optional[float],
    batch_weight_kg: float,
    batch_volume_dm3: float,
    my_weight_kg: float,
    my_volume_dm3: float,
    qty: int,
) -> float:
    """Costo trattamento per pezzo. Gemello di `quoteCalc.calcTreatmentCost`.

    La soglia è SEMPRE sul peso del batch (capacità del forno), anche per i
    trattamenti €/dm³. Il costo del batch è distribuito proporzionalmente al
    peso (€/kg) o al volume (€/dm³) della parte. `my_weight_kg`/`my_volume_dm3`
    includono già qty; il risultato è per pezzo. Le aggregazioni del batch
    (somma su tutte le parti dello stesso gruppo) le fa il chiamante.
    """
    below = bool(minimum_weight_kg and minimum_weight_kg > 0 and batch_weight_kg < minimum_weight_kg)
    if (cost_unit or 'kg') == 'dm3':
        total = (minimum_cost or 0.0) if below else (cost_per_dm3 or 0.0) * batch_volume_dm3
        share = total * my_volume_dm3 / batch_volume_dm3 if batch_volume_dm3 > 0 else 0.0
    else:
        total = (minimum_cost or 0.0) if below else (cost_per_kg or 0.0) * batch_weight_kg
        share = total * my_weight_kg / batch_weight_kg if batch_weight_kg > 0 else 0.0
    return round4(share / max(qty, 1))


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
    # F1 (audit §5): floor difensivo a 0 — uno sconto > 100% (via import backup /
    # scrittura diretta che bypassa la validazione) darebbe un totale negativo.
    return round2(max(0.0, after - discount))
