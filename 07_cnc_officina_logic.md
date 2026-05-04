# CNC Officina Logic

## Goal

The CNC module should help estimate machining time, not replace human judgment.

## STEP-derived data

When STEP geometry is available, extract:
- bounding box;
- volume;
- surface area;
- finished weight;
- raw stock suggestion;
- removed material volume estimate;
- basic feature count.

## Removed material estimation

raw_volume_mm3 = raw_x * raw_y * raw_z

removed_volume_mm3 = raw_volume_mm3 - finished_volume_mm3

removed_ratio = removed_volume_mm3 / raw_volume_mm3

Use removed_ratio as one complexity signal.

## Material removal rate estimation

The app can support configurable MRR values.

MRR example table:
- aluminum roughing: high
- steel roughing: medium
- stainless roughing: low
- titanium roughing: very low

Estimated roughing time:

roughing_minutes =
removed_volume_cm3 / mrr_cm3_per_min

This must be editable.

## CNC complexity score

Calculate a suggested complexity score from:

- removed material ratio;
- number of setups;
- number of detected holes;
- number of pockets;
- tolerance level;
- surface finish requirement;
- 3-axis vs 5-axis;
- thin walls;
- deep cavities;
- hard material.

Example score:
- 1.0 simple
- 1.3 medium
- 1.6 complex
- 2.0 very complex

## Suggested CNC phases

For a simple prismatic STEP:
- raw cutting;
- CNC setup 1 roughing;
- CNC setup 1 finishing;
- drilling/tapping if holes detected;
- deburring;
- quality control.

For a part requiring multiple sides:
- CNC setup 1;
- CNC setup 2;
- CNC setup 3;
- finishing;
- inspection.

## Setups

The user must be able to add:
- setup 1;
- setup 2;
- setup 3;
- 5-axis single setup;
- manual repositioning.

Each setup has:
- setup time;
- cycle time;
- machine;
- notes.

## Tolerance level

Add selectable tolerance levels:

- standard: ±0.10 mm
- medium: ±0.05 mm
- precise: ±0.02 mm
- critical: custom

Tolerance level affects:
- complexity coefficient;
- finishing time;
- inspection time.

## Surface finish level

Selectable:
- rough
- standard
- fine
- aesthetic
- mirror / special

Affects:
- finishing time;
- surface treatment suggestion.

## Manual override

All CNC estimations must be editable.
The app must show:
- suggested value;
- final user value.
