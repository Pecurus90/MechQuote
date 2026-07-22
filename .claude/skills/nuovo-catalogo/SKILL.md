---
name: nuovo-catalogo
description: Scaffold di un nuovo catalogo CRUD in MechQuote (lista valori con create/edit/delete + protezione delete + import CSV opzionale). Usala quando serve aggiungere una nuova anagrafica/catalogo (es. un nuovo tipo di fornitore, una nuova lista di attributi).
---

# Nuovo catalogo CRUD

Segue il pattern dei cataloghi esistenti (Materiali, Macchine, Trattamenti,
Operazioni, ecc.). Costruisci il modulo **il più auto-contenuto possibile**
(CLAUDE.md §4), ma modello/migration/tipo restano nei 3 registri centrali.

## Sequenza (routine B, CLAUDE.md §2)

1. **`models.py`** — classe SQLAlchemy. Nome UNIQUE dove serve (indice
   case-insensitive su `lower(trim(name))` come gli altri cataloghi). Mai
   `Enum`: usa `String(N)` con valori documentati nel commento.
2. **`main.py` `_run_migrations()`** — `CREATE TABLE IF NOT EXISTS ...` (e
   l'indice UNIQUE). Idempotente. Inseriscila sapendo cosa la precede (§0-quater).
3. **`schemas.py`** — `Base → Create → Update → Out` con `from_attributes = True`
   su `Out`.
4. **`api/<catalogo>.py`** — router dedicato con list/create/update/delete.
   - Write gated con `require_permission('<chiave>')` (di norma `settings`).
   - **DELETE**: sempre `block_if_in_use()` da `app.core.catalog_protect` prima
     di `db.delete()` (evita orfani su SQLite, FK non enforced).
   - create/update: `check_duplicate_name()` per il vincolo nome.
   - Registra il router in `main.py` con `app.include_router(..., prefix="/api")`.
5. **Import CSV (opzionale)** — se serve, usa il motore condiviso
   `app.core.csv_import` (`CsvImportConfig` + `import_catalog_csv` +
   `csv_template_response`). Non scrivere un parser ad-hoc.
6. **`types/index.ts`** — tipo TS condiviso (mai ridefinirlo localmente).
7. **Frontend** — pagina in `pages/settings/`. Per una lista di valori semplici
   usa il pattern inline-edit di `QuoteCategoriesPage.tsx` (table + edit row +
   new row in fondo). **Niente colonna/toggle "Attivo"** nella UI (§5): le voci
   si gestiscono con create/edit/delete. Chiamate via `@/lib/api`, feedback con
   `toast`.
8. **Route + Sidebar** gated con `hasPermission('<chiave>')`.

## Attributi via stringa libera (raro)
Se il catalogo è referenziato da altre tabelle **via stringa** (come
`ToolType.name` ↔ `Tool.tool_type`), il PUT deve fare **cascade rename** con
`UPDATE` manuale su tutte le child (pattern `_mount_tool_attribute_crud` in
`api/tools.py`).

## Verifica
Chiudi con la §7 (`/verifica`): tsc + startup + (se tocca API/modelli) pytest.
Prova a mano create/edit/delete e il blocco delete-in-uso.
