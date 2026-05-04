# Acceptance Criteria

## General

The app is acceptable when:
- it runs locally in a browser;
- it can create and save quotes;
- one quote can contain multiple parts;
- each part can contain multiple phases;
- totals update correctly;
- values are editable;
- PDF export works.

## Manual quoting acceptance

User can:
- create quote;
- add customer data;
- add 3 part codes;
- select material;
- add raw stock;
- add 5 phases per part;
- modify setup/cycle times;
- apply margin;
- see total;
- export customer PDF;
- export internal PDF.

## DXF acceptance

User can:
- upload DXF;
- see detected profiles;
- select profile;
- calculate cutting length;
- insert height/material;
- calculate EDM cost;
- add EDM phase to part.

## STEP acceptance

User can:
- upload STEP;
- see geometry summary;
- see bounding box;
- see volume/weight;
- select material;
- create suggested raw stock;
- add/edit manufacturing phases.

## Dashboard acceptance

Dashboard shows:
- number of quotes;
- total quoted amount;
- monthly value;
- previous month comparison;
- yearly monthly chart.

## Cost engine acceptance

The same quote must produce consistent totals:
- in editor;
- in saved data;
- in PDF;
- after reopening.

Backend calculation is source of truth.
