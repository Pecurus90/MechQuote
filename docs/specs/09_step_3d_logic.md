# STEP 3D Logic

## Goal

STEP import should assist quoting.

It should not create final quotes blindly.

## STEP import

Use OCP / OpenCascade.

Extract:
- bounding box;
- volume;
- surface area;
- colors if available;
- faces;
- cylindrical features;
- hole-like features if possible;
- basic geometry warnings.

## 3D preview

Frontend should display:
- 3D model;
- rotate/pan/zoom;
- selected colored faces;
- bounding box;
- optional feature overlays.

## Raw stock suggestion

For prismatic parts:

raw_x = bbox_x + allowance_x
raw_y = bbox_y + allowance_y
raw_z = bbox_z + allowance_z

Allowances configurable by material/process.

Example:
- aluminum: +3 mm per side
- steel: +2 mm per side
- precision part: custom

## Weight

finished_weight_kg =
volume_mm3 / 1,000,000 * density_kg_dm3

raw_weight_kg =
raw_volume_mm3 / 1,000,000 * density_kg_dm3

## Feature detection MVP

Initial MVP:
- bounding box;
- volume;
- surface area;
- color extraction;
- manual phase creation.

Advanced:
- through holes;
- blind holes;
- pockets;
- bosses;
- slots;
- cylindrical external faces;
- thin walls;
- deep cavities.

## Colored face rules

STEP colors can suggest operations.

Example:
- red = critical machining;
- blue = holes/threading;
- purple = EDM;
- green = aesthetic/surface finish;
- yellow = tight tolerance.

Rules must be configurable.

## Suggested manufacturing cycle

The app can suggest phases based on:
- part shape;
- material;
- volume removal;
- colors;
- detected features.

Example:
- raw material cutting;
- CNC roughing;
- CNC finishing;
- drilling/tapping;
- EDM wire;
- surface treatment;
- inspection.

## Confidence level

Each STEP analysis must produce a confidence level:

High:
- simple prismatic part;
- clean bounding box;
- basic operations.

Medium:
- recognizable geometry;
- some assumptions.

Low:
- complex freeform geometry;
- many unsupported features;
- missing color/material info.

Show warning:
"Automatic estimate confidence is low. Please review manually."

## Manual override

Every STEP-derived value must be editable:
- raw stock;
- volume;
- weight;
- detected operations;
- estimated times;
- phases.
