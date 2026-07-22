---
name: nuovo-campo
description: Aggiunge un nuovo campo a un modello esistente in MechQuote attraversando tutti i layer (modello → migration → schema → API → tipo TS → componente). Usala quando serve aggiungere una colonna/attributo a Quote, Part, Phase, Material, ecc.
---

# Nuovo campo su un modello

Attraversa **tutti** i layer nello stesso commit, per non lasciare divergenze
(errore classico #1 e #8 di CLAUDE.md §9).

## Sequenza

1. **`models.py`** — aggiungi il campo alla classe SQLAlchemy. `String(N)` con
   valori documentati nel commento se è un enum logico (mai `Enum`). Scegli il
   default con cura: SQLite **non** supporta `DROP COLUMN`.
2. **`main.py` `_run_migrations()`** — `ALTER TABLE <t> ADD COLUMN <col> ... DEFAULT ...`.
   ⚠️ **Sempre** anche qui, non solo nel modello, o i DB esistenti si rompono a
   runtime. Verifica con `grep <col> backend/app/main.py` prima di committare.
   Idempotenza: l'ALTER sta nel `try/except` della lista migrazioni; l'ordine
   conta (§0-quater).
3. **`schemas.py`** — aggiungi il campo a `Base`/`Create`/`Update`/`Out` secondo
   dove serve (input vs output).
4. **`api/<resource>.py`** — gestisci il campo in create/update. Se il campo
   influenza i costi e sta su `Part`/`ManufacturingPhase`, dopo il write chiama
   `recalculate_part(part_id, db)` (errore classico #6).
5. **`types/index.ts`** — aggiorna il tipo TS **nello stesso commit** dello
   schema (errore classico #8). Mai ridefinire il tipo localmente.
6. **Componente** — UI in `pages/`/`components/`. Per input numerici decimali usa
   `DecimalField`/`parseDecimal` (mai `type=number`, convenzione decimali IT).
   Per i tempi ricorda la convenzione minuti↔ore (`lib/timeUnits`): input in
   minuti, DB/calcoli in ore.

## Se il campo tocca il cost engine
È un **gemello DRY**: la stessa formula vive su backend (`costing/primitives.py`)
e frontend (`quoteCalc.ts` / `PhaseEditor.calcPhase`). Modificali **insieme**,
stesso commit, e fai girare i golden test (§0-quater, §4).

## Verifica
Chiudi con `/verifica` (§7). Se hai toccato calcoli/modelli/API includi i test.
Prova a mano il flusso: salva un valore, riapri, controlla che persista e che i
totali siano coerenti DB↔UI.
