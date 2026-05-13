# Settings and Rules

> ⚠️ **DEPRECATED — DRIFT** (CLAUDE.md §12). Non usare come riferimento. La tabella `CostRule` è stata droppata; settings vivono in `CompanySettings` singleton + UI Catalogo/Sistema. La tabella `CostRule` qui citata è stata
> sostituita da `CompanySettings` (singleton id=1) molto tempo fa
> (tabella `cost_rules` droppata in migration). I default operativi
> (margine, prezzo minimo, trasporto, packaging) vivono ora come campi
> di `CompanySettings`. Le sezioni "Settings → Catalogo" qui descritte
> non riflettono la struttura attuale della sidebar (vedi §10-11 di
> `CLAUDE.md`). Mantenuto come storico.

## Materials

Fields:
- name;
- family;
- density kg/dm3;
- cost €/kg;
- EDM coefficient;
- CNC machinability coefficient;
- default scrap %;
- notes.

Example material families:
- aluminum;
- carbon steel;
- stainless steel;
- tool steel;
- copper;
- brass;
- bronze;
- plastics;
- titanium.

## Machines

Fields:
- name;
- type;
- hourly rate;
- setup minimum;
- active;
- notes.

Machine types:
- CNC 3-axis;
- CNC 5-axis;
- lathe;
- wire EDM;
- sinker EDM;
- grinder;
- manual bench;
- inspection.

## Phase templates

Purpose:
Speed up quote creation.

Fields:
- name;
- phase type;
- default machine;
- default supplier;
- default setup time;
- default cycle time;
- default fixed cost;
- default customer visibility.

## Treatments

Fields:
- name;
- treatment type;
- supplier;
- fixed cost;
- cost per kg;
- cost per part;
- minimum cost;
- notes.

Types:
- heat treatment;
- surface treatment;
- coating;
- polishing;
- sandblasting;
- anodizing;
- black oxide;
- zinc plating;
- nickel plating.

## EDM rules

Fields:
- material coefficient;
- pass coefficient;
- precision coefficient;
- default speed;
- start hole cost;
- minimum EDM setup cost.

## CNC rules

Fields:
- material MRR values;
- default complexity coefficients;
- setup time defaults;
- tolerance coefficients;
- surface finish coefficients.

## Cost rules

Fields:
- default margin;
- minimum part price;
- minimum quote price;
- rounding rule;
- default scrap;
- default packaging cost;
- default transport cost.

## STEP color rules

Fields:
- color hex;
- color name;
- meaning;
- suggested phase;
- complexity coefficient;
- notes.
