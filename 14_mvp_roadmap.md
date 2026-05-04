# MVP Roadmap

## MVP 1 - Manual quoting

Goal:
Create useful quotes without CAD.

Features:
- sidebar;
- dashboard basic KPIs;
- quote creation;
- multiple part codes;
- material settings;
- machine settings;
- phase templates;
- manufacturing cycle editor;
- cost calculation;
- customer PDF;
- internal PDF;
- local database.

This MVP must be usable in real work.

## MVP 2 - DXF EDM

Features:
- DXF upload;
- profile parsing;
- 2D preview;
- profile selection;
- length calculation;
- EDM calculator;
- automatic EDM phase creation;
- review and override.

## MVP 3 - STEP basic

Features:
- STEP upload;
- 3D preview;
- bounding box;
- volume;
- weight;
- raw stock suggestion;
- manual cycle creation from STEP data.

## MVP 4 - STEP smart

Features:
- color extraction;
- color rules;
- suggested phases;
- confidence level;
- feature count;
- rough CNC estimation.

## MVP 5 - Officina intelligence

Features:
- historical quote suggestions;
- similar part search;
- estimated vs actual data if entered manually;
- learning from confirmed quotes;
- quote templates by part type.

## Implementation rule

Do not build all modules at once.

Start with manual quote and cycle model.
Everything else must plug into the same Part + Phase architecture.
