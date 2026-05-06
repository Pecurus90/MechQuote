# Manufacturing Cycle

## Concept

Each part has a manufacturing cycle.

A cycle is an ordered list of phases.

Do not model a part as a single operation.

## Example cycles

### Simple milled plate

10 - Saw cutting raw material
20 - CNC milling setup 1
30 - Drilling / tapping
40 - Deburring
50 - Quality control

### Hardened precision part

10 - Saw cutting raw material
20 - CNC roughing
30 - Heat treatment
40 - CNC finishing
50 - Grinding
60 - Surface treatment
70 - Quality control

### Mixed CNC + EDM

10 - Saw cutting raw material
20 - CNC roughing
30 - Drilling start holes
40 - Wire EDM
50 - CNC finishing
60 - Deburring
70 - Quality control

## Phase types

Supported phase types:
- raw_material_cutting
- cnc_milling
- cnc_turning
- drilling
- tapping
- wire_edm
- sinker_edm
- grinding
- manual_operation
- heat_treatment
- surface_treatment
- quality_control
- external_supplier
- packaging
- transport
- custom_extra

## Phase ordering

Phases must be reorderable.
Each phase must have a sequence number.

Example:
10, 20, 30, 40.

Allow gaps to insert new phases between existing ones.

## Phase visibility

Each phase has:
- internal visibility;
- customer PDF visibility.

Some phases may be hidden in customer PDF but still included in cost.

Example:
- setup details hidden;
- final operation summary shown.

## Phase templates

The user can create reusable templates.

Examples:
- CNC 3-axis roughing
- CNC 5-axis finishing
- EDM wire standard cut
- Heat treatment external
- Anodizing black
- Dimensional inspection

Templates speed up quoting.
