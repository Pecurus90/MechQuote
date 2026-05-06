# Product Scope

## What the app is

MechQuote is a browser-based technical quoting tool for mechanical components.

It helps estimate:
- material cost;
- CNC machining cost;
- EDM wire cost;
- EDM sinker cost;
- heat treatments;
- surface treatments;
- grinding;
- manual operations;
- quality control;
- external supplier costs;
- margin;
- final quote price.

## What the app is not

It is not:
- ERP;
- invoicing software;
- stock management;
- production scheduler;
- accounting system;
- CRM.

It may store quotes and statistics, but only to support quoting speed and analysis.

## Core workflow

1. Open dashboard.
2. Click "Create Quote".
3. Select quote mode:
   - Manual
   - 2D DXF
   - 3D STEP
4. Create one or more part codes.
5. For each part, define material, quantity and manufacturing cycle.
6. Review totals.
7. Export PDF.

## Main entities

Quote
- contains multiple parts.

Part / Code
- contains quantity, material, files, geometry data and phases.

Phase
- represents one manufacturing step.

Settings
- materials, machines, treatments, cost rules, color rules.
