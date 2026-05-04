# Create Quote Workflows

## Create Quote screen

When the user clicks "+ Create Quote", replace the dashboard with a mode selection screen.

Show three large cards:

1. Manual Quote
2. 2D DXF Quote
3. 3D STEP Quote

## Shared quote header

All modes share:

- quote number;
- date;
- customer name;
- customer reference;
- request reference;
- validity days;
- delivery estimate;
- currency;
- global margin;
- notes for customer;
- internal notes.

## Multi-part quote

A quote can contain unlimited parts/codes.

Each part row shows:
- part code;
- revision;
- description;
- quantity;
- quote mode;
- material;
- unit price;
- total price;
- confidence level;
- status.

Actions:
- add part;
- duplicate part;
- delete part;
- reorder part;
- copy phases from another part;
- import file;
- open review.

## Manual quote workflow

Used when no CAD file is available.

Steps:
1. Insert part code and description.
2. Insert quantity.
3. Select material.
4. Insert raw stock dimensions or manual material cost.
5. Add manufacturing phases.
6. Add treatments and extras.
7. Apply margin.
8. Review result.
9. Add part to quote.

## DXF quote workflow

Used mainly for wire EDM.

Steps:
1. Upload DXF.
2. Parse DXF.
3. Detect profiles.
4. Show 2D preview.
5. User selects one or more profiles.
6. Calculate total cutting length.
7. User selects material.
8. User inserts finished height.
9. User selects number of passes / quality.
10. App creates suggested EDM phase.
11. User reviews and edits.
12. Add part to quote.

## STEP quote workflow

Used for CNC or mixed operations.

Steps:
1. Upload STEP.
2. Parse geometry.
3. Show 3D preview.
4. Calculate bounding box.
5. Calculate volume.
6. Calculate surface area if possible.
7. Suggest raw stock.
8. Select material.
9. Calculate weight and material cost.
10. Suggest manufacturing cycle.
11. User edits phases.
12. Review quote.
13. Add part to quote.

## Rule

Never export the final customer PDF immediately after uploading CAD.

Always show a review screen before saving/exporting.
