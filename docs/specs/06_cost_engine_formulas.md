# Cost Engine and Formulas

## Global principle

All automatic formulas must produce editable values.

The user can override:
- setup time;
- cycle time;
- material cost;
- EDM speed;
- CNC estimated time;
- phase cost;
- margin.

## Material cost

For rectangular raw stock:

raw_volume_mm3 = raw_x_mm * raw_y_mm * raw_z_mm

raw_volume_dm3 = raw_volume_mm3 / 1,000,000

raw_weight_kg = raw_volume_dm3 * density_kg_dm3

material_cost = raw_weight_kg * cost_per_kg * (1 + scrap_percent / 100)

## Cylindrical raw stock

raw_volume_mm3 = π * (diameter_mm / 2)^2 * length_mm

raw_volume_dm3 = raw_volume_mm3 / 1,000,000

raw_weight_kg = raw_volume_dm3 * density_kg_dm3

## CNC phase basic formula

cnc_phase_cost =
(setup_hours * hourly_rate) +
(cycle_hours_per_part * quantity * hourly_rate * complexity_coefficient)

## CNC multi-setup formula

cnc_phase_cost =
(number_of_setups * setup_hours_per_setup * hourly_rate) +
(cycle_hours_per_part * quantity * hourly_rate * complexity_coefficient)

## EDM wire formula - area based

cut_area_mm2 = cutting_length_mm * height_mm

edm_cost =
setup_cost +
cut_area_mm2 * material_coefficient * precision_coefficient * pass_coefficient

## EDM wire formula - time based

cut_time_hours =
cutting_length_mm / speed_mm_per_hour

edm_cost =
setup_hours * hourly_rate +
cut_time_hours * hourly_rate * material_coefficient * precision_coefficient * pass_coefficient

## EDM pass coefficient example

1 pass = 1.00
2 passes = 1.45
3 passes = 1.85
4 passes = 2.20

These values must be configurable.

## Heat treatment formula

heat_treatment_cost =
max(
  minimum_cost,
  fixed_cost + raw_weight_kg * cost_per_kg + quantity * cost_per_part
)

## Surface treatment formula

surface_treatment_cost =
max(
  minimum_cost,
  fixed_cost +
  surface_area_mm2 * cost_per_mm2 +
  quantity * cost_per_part
)

If surface area is not known, allow manual cost.

## Quality control formula

inspection_cost =
setup_hours * hourly_rate +
inspection_hours_per_part * quantity * hourly_rate +
certificate_cost

## Part total

part_cost =
material_cost +
sum(manufacturing_phase_costs) +
extras

part_price_before_margin =
max(part_cost, minimum_part_price)

part_price =
part_price_before_margin * (1 + margin_percent / 100)

## Quote total

quote_total =
sum(part_total_prices) +
transport_cost +
packaging_cost -
global_discount

## Rounding rules

Configurable:
- no rounding;
- nearest 1 euro;
- nearest 5 euro;
- nearest 10 euro;
- nearest 50 euro.

## Reverse calculation

Optional future feature:
Given a target price, calculate implied margin.

margin_percent =
((target_price - cost) / cost) * 100
