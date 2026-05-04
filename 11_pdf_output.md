# PDF Output

## Two PDF modes

The app must generate:

1. Customer PDF
2. Internal PDF

## Customer PDF

Shows:
- company logo;
- company info;
- customer name;
- quote number;
- date;
- validity;
- delivery estimate;
- list of part codes;
- descriptions;
- quantities;
- unit prices;
- total prices;
- final quote total;
- payment/validity notes;
- customer notes.

Does NOT show:
- hourly rates;
- margins;
- internal costs;
- supplier costs;
- hidden phase details;
- internal notes.

## Internal PDF

Shows everything:
- material cost;
- raw stock dimensions;
- phase list;
- machines;
- setup hours;
- cycle hours;
- hourly rates;
- EDM length/height;
- coefficients;
- treatments;
- extras;
- margins;
- formulas;
- internal notes;
- confidence levels;
- warnings.

## Customer phase visibility

Each phase has a customer_visible flag.

If true, show a simplified description.
If false, hide it from customer PDF but include in cost.

## PDF sections

Customer:
1. Header
2. Customer data
3. Quote summary
4. Part table
5. Total
6. Terms and notes

Internal:
1. Header
2. Quote summary
3. Detailed part breakdown
4. Manufacturing cycles
5. Cost details
6. Warnings and confidence
7. Internal notes

## Export formats

Initial:
- PDF

Future:
- Excel
- JSON backup
- CSV part list
