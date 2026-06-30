# 17 — Architettura target e roadmap di consolidamento

> Esito della ricognizione strategica del 2026-06-30 (4 scansioni a sola lettura
> su motore, modello dati, coerenza, estendibilità). Questo documento è un
> **piano**, non lo stato corrente: la fonte di verità del codice resta
> `models.py` / `calculation.py`. Obiettivo: portare MechQuote da "app cresciuta
> a pezzi" a "app pensata dall'inizio", future-proof, con tutto collegato.

---

## 0. Principio guida — monolite modulare, motore come cuore puro

Il motore preventivi diventa una **libreria di dominio autosufficiente**
(`backend/app/services/costing/`) che **non conosce** FastAPI, React né PDF:
riceve input di dominio, restituisce costi. Sopra si agganciano **adattatori
sottili**: API REST (frontend React), renderer PDF, test, ed eventuali futuri
frontend/report/CLI. È l'architettura *core + adattatori* (clean/esagonale) a
scala piccola.

**NON** si fa un servizio separato in rete (microservizio): per un gestionale
mono-officina su SQLite è over-engineering. Si resta **monolite con confini
interni netti**.

Conseguenza future-proof: un nuovo preventivatore, un nuovo frontend o un nuovo
formato di output si **agganciano al cuore senza modificarlo**.

---

## 1. Punto di partenza (cosa è già sano — non rifare)

- Il cost engine ha **già un unico ingresso** (`recalculate_quote`): gli stampi
  sono una *sovrastruttura* sopra il motore standard, non un secondo motore.
- Cataloghi **Material, Machine, Operation, Treatment, CuttingCycle** + fornitori:
  già **FK pulite e condivise** ("aggiungi una volta, usa ovunque"). `Machine` è
  già pescata da 4 domini = secondo modello-oro oltre ai Materiali.
- Infrastruttura test: golden cases condivisi BE/FE (`tests/fixtures/cost_golden_cases.json`).
- Frontend già ordinato: mini-app per dominio + `StandardPage`.

Il lavoro NON è "riscrivere": è **consolidare + proteggere + aggiungere agganci**.

---

## 2. I problemi reali (3 zone)

### ① Motore: formule inline e gemelli a mano
- Le 4 formule economiche (trattamento, **costo fase**, totali parte, **totale
  preventivo**) sono scritte *dentro* le ~300 righe di `recalculate_quote`, non
  estratte → manca una "fonte unica" backend pulita.
- Il **totale preventivo** vive **solo in `pdf.py`** (`:701`, `:767`), non in
  `calculation.py`, ed è triplicato (anche `quoteCalc.ts:159`). La formula fase
  ha una **4ª copia** in `pdf.py:584`.
- Gemelli BE↔FE reali: **13** (alcuni tripli). I golden test **reimplementano**
  le formule invece di chiamare il codice vero → una divergenza non verrebbe
  scoperta. `dieCalc.ts` non ha test FE; `calcPhase` (FE) nemmeno.

### ② Nessun registro dei tipi di preventivo
- Tutto è `if quote_type == 'die'` sparso: `calculation.py` (243/260/509),
  `pdf.py:965`, **8 query SQL in `dashboard.py`**, `quotes_archive.py`,
  `quotes.py`, e frontend `QuoteEditor.tsx:340`.
- Aggiungere il 3° preventivatore = rifare a mano tutti i branch (Stampi ha
  toccato **13 file**). La **dashboard** è il punto più fragile (un KPI che
  dimentica il filtro inquina i numeri standard, in silenzio).

### ③ Connettività "a macchia di leopardo" (il principio materiali non è ovunque)
- **`NormalizedItem` è un catalogo orfano**: CRUD completo ma **nessuna FK** lo
  referenzia (le righe stampo copiano descrizione/prezzo senza `normalized_item_id`).
  → fix a più alto ROI / più basso rischio.
- **Attributi utensile** (tipo/marca/posizione): stringhe libere con match per
  nome, non FK.
- **Customer**: FK presente, ma PDF/dashboard/ricerca leggono la *stringa*
  snapshot `customer_name` → drift (rinomina non propagata; cliente senza nome
  sparisce dalle statistiche).
- **Tempra**: `HeatTreatmentResult.material` è testo libero, non pesca dai Materiali.

### (+) Debito di coerenza
`phase_type` rimosso a metà ma ancora `NOT NULL` + richiesto nello schema; ~50
copie dell'estrazione errore API (manca `getApiError()`); ~12 pagine non ancora
su `StandardPage`; naming misto tempra/heat_treatment; file Stampi enormi
(DieQuoteEditor 899, NewDieQuotePage 853, DiesSettingsPage 816); `pdf.py` 1047;
`EdmPhaseFields` con 17 prop nel dominio sbagliato (`components/quotes/`).

---

## 3. Architettura target

- **Nucleo costi unico** — package `services/costing/`: `primitives.py` (atomi
  puri: material/phase/part-totals/treatment/edm/bracket/**quote_total**) +
  `strategies/{standard,die}.py` che li *compongono* + `engine.py` dispatcher.
  Standard e stampi = varianti sopra gli stessi mattoni. API pubblica
  (`recalculate_quote/part`) invariata (re-export, ~26 call-site preservati).
- **Gemelli FE protetti da test di parità veri** — si tengono i twins per il
  preview live (il preview-da-backend è stato valutato e scartato:
  latenza/UX/rischio). I golden test chiamano il **codice di produzione** su
  entrambi i lati.
- **Tutto collegato** — generalizzare il modello materiali: collegare
  `NormalizedItem`; mantenere gli snapshot *legittimi* (ordini utensili,
  parametri piastra, apply-template); decidere la policy `Customer`. I nuovi
  preventivatori pescano dagli stessi cataloghi (quasi tutti già pronti).
- **Registro dei tipi** — `core/quote_types.py` (elenco + `is_die/is_standard`)
  elimina le magic-string; poi dispatch a strategie quando serve.
- **Guard-rail future-proof** — test di parità cross-layer + script che verifica
  la catena "campo aggiunto → migrazione/schema/tipo" (oggi solo disciplina §9).

---

## 4. Roadmap (per rischio crescente)

| # | Sprint | Cosa | Rischio | Valore |
|---|---|---|---|---|
| **F1** | Guard-rail | `quote_types.py` + helper · golden test puntano al codice vero · test FE mancanti (calcPhase, dieCalc) · script check campo-sync | Basso | Rende sicuro tutto il resto |
| **F2** | Nucleo costi | Estrarre le 4 formule inline in `costing/primitives.py` (comportamento invariato) · unificare il totale preventivo (oggi 3 copie) | Basso (protetto da F1) | Fonte unica del motore |
| **F3** | Collega normalizzati | FK nullable `normalized_item_id` su DieNormalizedItem/DieTemplateNormalized + autocomplete + `block_if_in_use` | Basso | "Materiali" esteso, ROI top |
| **C1** | Pulizia coerenza | `getApiError()` helper · liberare `phase_type` dallo schema · finire StandardPage (~12 pagine) · regola inline-vs-modal | Basso | Coerenza |
| **C2** | Split Stampi FE | Spezzare DieQuoteEditor/NewDieQuote/DiesSettings · ricollocare EdmPhaseFields · split `pdf.py` | Basso-medio | Leggibilità |
| **P1** | Decisioni prodotto | Policy `Customer` snapshot · dashboard KPI centralizzata · uniformare i 4 fornitori (**senza fonderli**) | Medio | Richiede decisione utente |
| **D1** | *Differito* | Registro strategie + dispatch motore · attributi utensile→FK | Medio-alto | **Solo** all'arrivo del 3° preventivatore / se serve |

---

## 5. Da NON fare (over-engineering per officina singola / SQLite)

- Preview calcolato dal backend (perdita reattività, alto rischio).
- Tabelle EAV per "campi custom" (rompe type-safety e leggibilità del motore).
- Ereditarietà polimorfica ORM su `Quote` (complica le migrazioni manuali senza Alembic).
- Plugin-system / microservizi.
- Fondere le 4 tabelle fornitori (rischio FK su SQLite vs beneficio nullo: oggi
  nessuna si comporta male — vedi CLAUDE.md §4).

---

## 6. Note di metodo

- SQLite gira con `PRAGMA foreign_keys=OFF`: aggiungere una FK **non** la rende
  enforced. Le "stringa → FK" qui valgono per pulizia modello + autocomplete,
  non per integrità garantita dal DB.
- Ogni cambio dati = migrazione idempotente in `main.py _run_migrations()`,
  solo `ADD COLUMN` nullable (no `DROP COLUMN` su SQLite); colonne vecchie
  restano orfane e si smette di leggerle.
- Prima di aprire i task, **incrociare con `MECHQUOTE_LISTA_LAVORI.md`**: alcuni
  item (StandardPage, colonne orfane, naming) potrebbero già esserci.
- `P1` (Customer) è una **decisione di prodotto**: va concordata, non decisa dal codice.
