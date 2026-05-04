from math import pi


def calc_raw_weight_kg(x_mm: float, y_mm: float, z_mm: float,
                        density_kg_dm3: float, scrap_percent: float = 10.0) -> tuple[float, float, float]:
    volume_mm3 = x_mm * y_mm * z_mm
    volume_dm3 = volume_mm3 / 1_000_000
    weight_kg = volume_dm3 * density_kg_dm3
    cost = weight_kg * (1 + scrap_percent / 100)
    return volume_mm3, volume_dm3, weight_kg


def calc_cylindrical_weight_kg(diameter_mm: float, length_mm: float,
                               density_kg_dm3: float, scrap_percent: float = 10.0) -> tuple[float, float, float]:
    radius = diameter_mm / 2
    volume_mm3 = pi * radius * radius * length_mm
    volume_dm3 = volume_mm3 / 1_000_000
    weight_kg = volume_dm3 * density_kg_dm3
    return volume_mm3, volume_dm3, weight_kg


def calc_material_cost(raw_weight_kg: float, cost_per_kg: float, scrap_percent: float = 10.0) -> float:
    return raw_weight_kg * cost_per_kg * (1 + scrap_percent / 100)


def calc_cnc_phase_cost(setup_hours: float, cycle_hours_per_part: float, quantity: int,
                        hourly_rate: float, complexity_coefficient: float = 1.0) -> float:
    return (setup_hours * hourly_rate) + \
           (cycle_hours_per_part * quantity * hourly_rate * complexity_coefficient)


def calc_edm_wire_area_cost(cut_area_mm2: float, material_coeff: float,
                            precision_coeff: float, pass_coeff: float,
                            setup_cost: float = 0.0) -> float:
    return setup_cost + cut_area_mm2 * material_coeff * precision_coeff * pass_coeff


def calc_edm_wire_time_cost(cutting_length_mm: float, height_mm: float,
                            speed_mm_per_hour: float, setup_hours: float,
                            hourly_rate: float, material_coeff: float,
                            quality_coeff: float) -> float:
    cut_time_hours = cutting_length_mm / speed_mm_per_hour
    return setup_hours * hourly_rate + \
           cut_time_hours * hourly_rate * material_coeff * quality_coeff


def calc_heat_treatment_cost(minimum_cost: float, fixed_cost: float,
                              weight_kg: float, cost_per_kg: float,
                              quantity: int, cost_per_part: float) -> float:
    return max(minimum_cost, fixed_cost + weight_kg * cost_per_kg + quantity * cost_per_part)


def calc_surface_treatment_cost(minimum_cost: float, fixed_cost: float,
                                 surface_area_mm2: float, cost_per_mm2: float,
                                 quantity: int, cost_per_part: float) -> float:
    return max(minimum_cost, fixed_cost + surface_area_mm2 * cost_per_mm2 + quantity * cost_per_part)


def calc_inspection_cost(setup_hours: float, inspection_hours_per_part: float,
                          quantity: int, hourly_rate: float, certificate_cost: float = 0.0) -> float:
    return setup_hours * hourly_rate + inspection_hours_per_part * quantity * hourly_rate + certificate_cost


def calc_part_price(part_cost: float, margin_percent: float, minimum_price: float = 0.0) -> float:
    before_margin = max(part_cost, minimum_price)
    return before_margin * (1 + margin_percent / 100)


def calc_quote_total(part_totals: list[float], transport_cost: float = 0.0,
                     packaging_cost: float = 0.0, global_discount: float = 0.0) -> float:
    return sum(part_totals) + transport_cost + packaging_cost - global_discount


def apply_rounding(value: float, rule: str) -> float:
    if rule == "1":
        return round(value)
    elif rule == "5":
        return round(value / 5) * 5
    elif rule == "10":
        return round(value / 10) * 10
    elif rule == "50":
        return round(value / 50) * 50
    return value
