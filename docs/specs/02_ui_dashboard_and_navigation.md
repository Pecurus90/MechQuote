# UI - Dashboard and Navigation

> ⚠️ **DOC OBSOLETO** (CLAUDE.md §12). La sidebar attuale è strutturata in
> due macro-aree (Operatività + Impostazioni con sotto-sezioni Catalogo /
> Utensili / Fornitori / Wire EDM / Azienda / Sistema). Per la struttura
> aggiornata vedi `frontend/src/components/layout/Sidebar.tsx` o le
> sezioni §4 / §10-11 di `CLAUDE.md`. Mantenuto come storico.

## Main layout

The app runs in the browser.

Layout:
- fixed sidebar on the left;
- main content area;
- live summary panels where useful.

## Sidebar

The sidebar must contain:

Primary:
- Dashboard
- + Create Quote

Archive:
- Quote Archive

Cost settings:
- Materials
- Machines
- Phase Templates
- Treatments
- Suppliers
- Cost Rules
- EDM Rules
- CNC Rules
- STEP Color Rules

System:
- Company Settings
- PDF Settings
- Backup / Export

## Dashboard

The dashboard is not a management area.
It is a quick statistical overview of quoting activity.

### KPI cards

Show:
- total number of quotes;
- number of quotes this month;
- total quoted value;
- quoted value this month;
- monthly difference vs previous month;
- percentage difference vs previous month;
- average quote value;
- number of quoted part codes;
- CNC quoted value;
- EDM quoted value.

### Monthly comparison

Example:
- Current month quoted value: 42,500 €
- Previous month quoted value: 37,800 €
- Difference: +4,700 €
- Percentage: +12.4%

### Annual chart

Show a chart with:
- X axis = months;
- Y axis = quoted value;
- one line per year.

Example:
- 2024
- 2025
- 2026

The chart must allow comparing different years month by month.

### Future dashboard filters

Optional:
- year;
- customer;
- quote status;
- material;
- process type;
- CNC / EDM / mixed.
