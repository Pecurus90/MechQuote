# EDM / DXF Logic

## Goal

The DXF module is mainly used for wire EDM quoting.

## DXF import

Use ezdxf.

Supported entities:
- LINE
- ARC
- CIRCLE
- LWPOLYLINE
- POLYLINE
- SPLINE approximated if possible

## Profile detection

The app must:
- detect profiles;
- classify open/closed contours;
- calculate length for each contour;
- show a 2D preview;
- let the user select one or more profiles.

## User selection

The user can select:
- external contour;
- internal holes;
- multiple profiles;
- ignored geometry.

## Calculated values

For selected profiles:
- total cutting length mm;
- number of contours;
- number of pierce/start holes;
- open/closed status;
- estimated cut area = length * height.

## Required user input

- material;
- part height;
- EDM machine;
- number of passes;
- quality level;
- setup time;
- start hole cost if needed.

## EDM quality levels

Example:
- rough cut: 1 pass
- standard: 2 passes
- precision: 3 passes
- high precision: 4+ passes

Quality changes:
- pass coefficient;
- precision coefficient;
- time/cost.

## Start holes

If internal contours are selected, the app should ask:
- are start holes already present?
- are start holes to be drilled?
- start hole cost per hole.

## EDM formula

cut_area_mm2 = total_cutting_length_mm * height_mm

edm_cost =
setup_cost +
cut_area_mm2 * material_coefficient * precision_coefficient * pass_coefficient +
start_hole_count * start_hole_cost

## Alternative time formula

cut_time_hours =
total_cutting_length_mm / speed_mm_per_hour

total_edm_cost =
setup_hours * hourly_rate +
cut_time_hours * hourly_rate * material_coefficient * quality_coefficient

## Warnings

Show warnings:
- open profiles detected;
- unsupported splines;
- duplicate entities;
- very small segments;
- no closed contour;
- multiple overlapping profiles.

## Review

Before confirming:
- show selected profiles;
- show total length;
- show height;
- show material;
- show EDM calculated phase;
- allow editing all values.
