# MechQuote — Documento di riferimento del progetto

> Questo è il documento di riferimento di MechQuote: cosa è, com'è fatto,
> quali decisioni sono state prese, cosa è stato verificato e cosa è solo
> riferito. È stato costruito a partire da cinque ricognizioni guidate del
> codice (sicurezza, prezzi/logica, struttura, performance, affidabilità).
>
> Regola di lettura: ogni informazione è marcata come **[verificato]** (esce
> da un'analisi del codice) oppure **[riferito]** (dichiarato da una persona,
> non ancora controllato con strumenti). La distinzione è importante: serve a
> sapere, fra sei mesi, su che base poggia ogni riga.

---

## 0. Sintesi rapida (aggiornata al 2026-07-02)

**Aggiornamento 2026-07-02 — sessione UI + permessi** (tutto su `main`):
- **Dark mode** a grigio neutro (tolte le tinte blu); accenti brand invariati.
- **Storico ordini**: nuova pagina unica (materiali + utensili) con recupero
  CSV/PDF ed **eliminazione** ordini; tolti i due "Storico" dalle pagine ordini.
- **CSV ordine materiale**: nuovo formato a 5 colonne
  (materiale / forma / dimensioni / riferimento / quantità), una riga per commessa.
- **Pagine impostazioni**: tutte unificate su `StandardPage`, due sole larghezze
  (`lg` form/cataloghi semplici, `xl` tabelle/hub); rimossa la doppia intestazione
  negli hub a tab.
- **Modello permessi ridisegnato (tema J)**: nuove chiavi `quotes.edit_locked`,
  `quotes.delete`, `orders.tools` (split da `tools` = catalogo); eliminati gli
  hardcode `role=='admin'` dalla logica (ora permessi delegabili); ruolo
  `officina` ristretto a officina + officina.write + tools; **token di login
  senza scadenza**. Fonte: `CLAUDE.md §3`.
- **Motore di calcolo unificato (tema E)**: tutte le formule pure del cost
  engine (materiale, fase, totali parte, **totale preventivo** standard+stampo,
  trattamento, round4) ora vivono in `backend/app/services/costing/primitives.py`
  = fonte unica; `recalculate_quote` e `pdf.py` le compongono. Registro
  `core/quote_types.py` (`is_die`/`is_standard`) al posto delle magic-string.
  Corretti bug: tariffa NULL→crash, 2 divergenze totale PDF↔anteprima.
- **Cataloghi "tutto collegato" (tema D)**: `NormalizedItem` prima orfano ora
  agganciato alle righe stampo (FK snapshot + `block_if_in_use`, autocomplete
  "dal catalogo"); **anti-doppioni** su 7 cataloghi (nome unico case-insensitive
  + indice UNIQUE + messaggio 400). Manca: policy Customer (D4), tempra/attributi
  utensile (D5), import ordine materiale (tema C, **sospeso** — vedi lista lavori).
- **Rete di test**: unit backend 128 passed + parità cost-engine BE↔FE completa
  (i golden chiamano il codice reale, coperto anche `dieCalc`/`calcPhase`);
  restano 2 fallimenti preesistenti in `test_dxf_parser` (ezdxf/pyparsing, non
  correlati). Notifiche riviste (click-through, segna-tutte-lette, rimosso flusso
  "richiede azione" morto). Codice morto rimosso (import inutilizzati, dict
  contatori).
- **Piano di lavoro corrente** (14 temi in 6 fasi) in testa a
  `MECHQUOTE_LISTA_LAVORI.md`; avanzamento: Fasi 0-1-2-3 fatte, Fase 4 con E✅ e
  D parziale (D1/D2✅).

---

Stato precedente (fotografia 2026-06-04):

- **Blocco A (messa in sicurezza)**: A1, A4, A5, A6, A7 fatti sul PC di
  sviluppo. **A2, A3** restano da fare sul server in azienda. **A8, A9**:
  due nuovi bug scoperti sul server il 2026-05-27 (PDF preventivi → 500,
  sezione stampi → 404 su `/api/dashboard/alerts`).
- **Fascia 1 calcolo prezzi**: **CHIUSA**. 5 correzioni di codice
  applicate (C1-C5). C6 e C7 spostate al cantiere stampi come modifiche
  di prodotto (vedi P2/P3 in `MECHQUOTE_LISTA_LAVORI.md`). Storico
  completo in `docs/history/CORREZIONI_PREZZI.md`.
- **Rete di test T0**: in piedi, 32 passed + 1 xfailed (S7 promemoria
  P_die_shape) backend, 19/19 frontend.
- **Cantieri di prodotto aperti**: Catalogo Normalizzati (Step 1-3 fatti,
  restano 4-6 + 7 opzionale, ~2½-3 giornate).
- **Cantiere Import CSV cataloghi**: **COMPLETATO** — motore condiviso
  `app.core.csv_import` + import su 8 cataloghi (materiali, fornitori
  grezzi, macchine, lavorazioni, fornitori esterni, utensili, fornitori
  utensili, trattamenti). Restano fuori scope: import normalizzati (Step 6
  del cantiere normalizzati) e import dei lookup utensili.
- **Strumenti di lavoro creati**: `update.bat` — script di aggiornamento
  manuale del server, da lanciare a mano da CMD admin.

---

## 1. Cos'è MechQuote

MechQuote è un'applicazione **preventivatore** per un'azienda di lavorazioni
meccaniche (Fratelli Dalla Via). Serve a costruire preventivi per la
lavorazione di pezzi: si inseriscono i dati di un pezzo (materiale, dimensioni,
tempi di lavorazione, fasi), e l'applicazione calcola un prezzo a partire dai
costi più un margine.

Gestisce diverse aree di lavoro collegate tra loro:

- **Preventivazione manuale** (pezzo singolo e multiplo) — il cuore storico,
  in uso dal primo giorno. **[riferito]** funziona bene.
- **Preventivazione 2D** (a partire da disegni DXF). **[riferito]** funziona.
- **Modulo Stampi** — il modulo più recente (costruito a metà maggio 2026).
  **[riferito]** funziona sul PC di sviluppo ma **crasha sul server** — vedi
  §6 e la lista lavori.
- Aree di contorno: clienti, catalogo prodotti/voci, utensili, officina,
  ordini materiali, dashboard.

Stato dichiarato: **circa 80% completato. [riferito]**

L'obiettivo dichiarato dall'utente: passare MechQuote a un uso reale in
azienda, ma **solo dopo una revisione** che metta in sicurezza le aree
critiche. Questa revisione è il lavoro descritto qui.

---

## 2. Com'è fatto (tecnologie)

| Parte | Tecnologia |
|---|---|
| Backend (il "motore") | Python — framework FastAPI |
| Frontend (l'interfaccia) | React + TypeScript |
| Database | SQLite — un unico file `backend/mechquote.db` |
| Server web | Apache 2.4, come reverse proxy |
| Sistema operativo server | Windows 11 |
| Servizio di avvio | NSSM (tiene acceso il backend come servizio Windows) |
| Generazione PDF | Playwright + Chromium |
| Storico modifiche | Git — presente e pulito **[verificato]** |

I client accedono via rete con il browser. **[verificato]** la struttura.

### Componenti che devono essere installati sul server

Python 3.11 (raccomandato), Node.js 20, Git, Apache 2.4, NSSM, Chromium di
Playwright (~150 MB, va installato a parte), e ~30 librerie Python.
**[verificato]** — elencati nella guida `INSTALLAZIONE.md`, descritta come
documentazione molto buona.

---

## 3. I due ambienti

MechQuote vive in **due posti distinti**:

- **PC di sviluppo** — dove si scrive e si prova il codice. I dati qui sono
  di prova.
- **Server aziendale** — dove MechQuote sarà usato per davvero, con dati
  reali.

I due ambienti hanno la **stessa versione (release)** del codice.
**[riferito]**

**Nota importante:** "stessa release" *non* significa "ambienti identici". Il
crash del modulo stampi sul solo server lo dimostra: qualcosa è diverso tra le
due macchine (vedi §6). Lo si tiene a mente per ogni futura modifica.

**Stato attuale del server:** installato da poco, sostanzialmente **vuoto** —
nessun dato aziendale di valore ancora dentro. **[riferito]**

### LA LINEA — confine tra "revisione" e "uso reale"

C'è un confine preciso che governa tutto il piano di lavoro:

> **Prima di inserire il primo cliente/preventivo reale sul server, i lavori
> della categoria "PRIMA DELLA LINEA" (vedi lista lavori) devono essere
> completati.**

Il motivo: alcuni problemi (su tutti il backup) sono di una categoria diversa
da tutti gli altri. Un bug ti fa *perdere tempo*; un backup difettoso ti fa
*perdere il lavoro*. Quella linea esiste per non attraversarla impreparati.

---

## 4. Sicurezza e login — stato

| Aspetto | Stato | Note |
|---|---|---|
| Password | **Solido [verificato]** | Salvate con bcrypt + salt. Illeggibili anche aprendo il database. |
| Login (sessione) | Funziona, da rifinire **[verificato]** | Token JWT salvato nel browser, durata 24 ore. |
| Permessi per ruolo | **Solido [verificato]** | Controlli attivi sul *server*, non solo nell'interfaccia: la barriera vera c'è. |
| Difesa brute-force | Presente **[verificato]** | Max 5 tentativi di login al minuto per IP. |
| Protezione anti-config-debole | Presente **[verificato]** | Se la chiave segreta è debole, in modalità produzione il server si rifiuta di partire. |
| Server raggiungibile da | Solo rete interna **[riferito — non verificato tecnicamente]** | Affermato dall'utente. Non controllato con strumenti né con chi gestisce la rete. |
| Password admin sul server | **Da verificare [verificato il rischio]** | Lo script di bootstrap usa una password di default debole (`admin`). Sul server va cambiata con una forte — vedi lista lavori A7. |

### I quattro ruoli utente **[verificato]**

- **admin** — accesso completo: utenti, backup, impostazioni azienda,
  catalogo, tutti i preventivi e gli stampi.
- **ufficio_tecnico** — crea e modifica preventivi e stampi, gestisce clienti,
  scarica PDF. NON vede i preventivi altrui, NON gestisce utenti/azienda/backup.
- **officina** — solo la propria area: Officina (documenti/tabelle/calcolatori,
  con upload e modifica via `officina.write`) e anagrafica/catalogo utensili
  (`tools`). NON vede preventivi/archivio/PDF, NON gestisce ordini, dashboard o
  notifiche. (Default: `officina`, `officina.write`, `tools` — vedi
  `permissions.py`.)
- **amministrazione** — dashboard, archivio completo, PDF, ordini materiali.
  NON crea/modifica preventivi.

L'admin può creare ruoli aggiuntivi; i singoli permessi (22 in tutto) sono
chiavi fisse nel codice.

---

## 5. I prezzi — come funzionano

Punto chiave da avere sempre chiaro: **MechQuote non ha listini fissi.** Ogni
prezzo viene **calcolato ogni volta** da una formula. **[verificato]**

Formula di base, per ogni pezzo:

```
costo_totale = materiale + trasporto + taglio + somma(fasi di lavorazione)
prezzo_unitario = max(costo_totale, prezzo_minimo) × (1 + margine%)
```

Conseguenza pratica: se si cambia un costo (es. il costo orario di una
macchina), **tutti i preventivi futuri si aggiornano da soli**; quelli già
fatti restano "congelati" come erano. È un comportamento corretto e voluto.

### Decisioni prese sui prezzi

- **IVA: i preventivi sono al netto.** Decisione confermata con l'azienda.
  L'IVA viene aggiunta a valle, in fatturazione. Un'eventuale "IVA opzionale
  attivabile dalle impostazioni" è un'idea per il futuro — **non esiste oggi**,
  andrebbe costruita (vedi lista lavori, sezione futuro).

### Domande ancora aperte sui prezzi (da chiarire con l'azienda)

1. **Lo sconto può portare il totale sotto il "prezzo minimo"** delle singole
   parti. Il prezzo minimo è una soglia invalicabile o un punto di partenza
   che uno sconto può superare?
2. **Lo sconto si applica anche a trasporto e imballaggio.** In alcune aziende
   il trasporto "non si sconta". È corretto così?
3. Un valore del modulo stampi è salvato nel database "al lordo" di margine e
   sconto: report estratti dal database non corrisponderebbero ai PDF.

### Trattamenti e rivestimenti — modellazione da rivedere (rimando a P1)

Nell'officina **trattamenti termici** (pagati a peso, kg) e **rivestimenti**
(pagati a volume, dm³) sono due famiglie distinte, con fornitori diversi.
MechQuote oggi li tiene in **un'unica categoria** "Trattamenti" con un flag
`cost_unit = 'kg' | 'dm3'`. **[verificato nel codice]** Il calcolo funziona,
ma la rappresentazione mescola due mondi: catalogo, UX e report aggregati ne
risentono. Inoltre va verificato con l'officina se i rivestimenti vadano
davvero a dm³ o a **superficie** (una colonna legacy `cost_per_surface_area`
nel modello DB lo suggerisce). Vedi **lista lavori → Decisioni di prodotto
→ P1** — non è un lavoro di codice immediato, da affrontare dopo il Blocco B.

### Le due "calcolatrici" — fragilità nota

MechQuote calcola i prezzi in **due punti**: il *server* (calcolo vero, quello
salvato e stampato) e l'*interfaccia* (anteprima dal vivo mentre si digita).
Dovrebbero dare lo stesso numero. **Le ricognizioni hanno trovato più punti in
cui non lo danno.** **[verificato]** Conseguenza: l'anteprima a schermo può
mostrare un prezzo diverso da quello che verrà salvato. Vedi lista lavori.

---

## 6. Il crash del modulo stampi sul server

Sintomo: il modulo Stampi funziona sul PC di sviluppo ma crasha sul server.
**[riferito]**

La ricognizione ha individuato **5 piste possibili**, nessuna delle quali è un
difetto del codice degli stampi — tutte sono differenze tra le due macchine.
Le più probabili:

1. **Chromium non installato sul server** → ogni PDF fallisce.
2. **Servizio avviato dalla cartella sbagliata** → MechQuote cerca dati e file
   nel posto sbagliato.
3. Tabelle del modulo stampi non create sul database del server.

**Come si scopre quale:** il server tiene un file di log degli errori in
`C:\MechQuote\logs\uvicorn.log`. L'ultimo errore registrato dice esattamente
cosa è andato storto. È il primo passo diagnostico (~5 minuti).

---

## 7. Qualità del codice — quadro onesto

Conclusione delle cinque ricognizioni: **MechQuote è un buon progetto.**

Cosa è risultato **solido [verificato]**:
- Codice ordinato: nessun file-fotocopia, nessun "appunto da sistemare"
  lasciato in giro, stile uniforme.
- Query del database protette da SQL injection.
- Permessi controllati sul server.
- 48 test automatici presenti, **e tutti passano**.
- Documentazione di installazione molto curata.
- Salvataggi "atomici": o tutto o niente, niente preventivi salvati a metà.

### Parti fragili — da maneggiare con cura **[verificato]**

Queste **non sono problemi** (funzionano), sono **avvertenze**: parti delicate
dove una modifica rischia un effetto domino. Diventeranno note di cautela nel
`CLAUDE.md`.

- **`recalculate_quote()`** (`services/calculation.py`) — il motore di calcolo
  prezzi, ~300 righe intrecciate. Il punto più delicato dell'intero progetto.
- **Le 187 migrazioni** in `main.py` — l'ordine conta, vanno toccate con
  attenzione.
- **La formula del costo fase esiste in TRE copie** (server + due punti
  dell'interfaccia) che devono restare allineate.

### Tema di fondo: MechQuote e l'uso multi-utente

Tre ricognizioni diverse (prezzi, struttura, performance) hanno puntato lo
stesso problema: **MechQuote, così com'è, non è ancora pronto per essere usato
da più persone contemporaneamente.** Due facce dello stesso tema:

- Due utenti sullo stesso preventivo: l'ultimo che salva sovrascrive il lavoro
  dell'altro, senza alcun avviso ("lost update silente").
- Due utenti che salvano insieme: il database può rispondere con un errore
  tecnico e far perdere le modifiche (manca l'impostazione `busy_timeout`).

Questo è **il capitolo principale** da affrontare prima dell'uso reale in più
persone — visto che MechQuote nasce proprio per quello. Non è da rifare: è da
finire.

---

## 8. Cose archiviate (chiuse, non richiedono lavoro)

- **Cartella `PRV/`** — è il vecchio sito aziendale, un progetto diverso.
  **[verificato]** completamente isolata: MechQuote non la tocca. Da ignorare
  per qualsiasi modifica. (Più avanti si potrà spostare altrove, non urgente.)
- **File "troppo grandi"** (`schemas.py`, `models.py`, ecc.) — esistono, ma
  riordinarli è lavoro estetico senza ricadute su sicurezza o prezzi. In fondo
  alla lista.
- **Audit UX** — proposto, ma rimandato: ha senso solo dopo qualche settimana
  di uso reale, raccogliendo i fastidi veri di chi usa MechQuote.

---

## 9. Metodo di lavoro condiviso

- Si procede **un lavoro alla volta**, con verifica, senza correre.
- Si lavora sul **PC di sviluppo**; solo quando una cosa è solida la si porta
  sul server.
- Le **proposte di Claude Code** (che tende ad allargare il lavoro) non sono
  ordini: si valutano prima di eseguirle.
- Ogni lavoro va capito nel **perché**, non solo nel cosa.
- Priorità alte fissate dall'utente: **sicurezza, login, correttezza di dati
  e prezzi.**

---

## 10. Diario delle sessioni rilevanti

### Sessione 2026-06-04 — Cantiere import CSV cataloghi

- **Motore condiviso** `backend/app/core/csv_import.py`: decode
  multi-encoding (utf-8-sig / utf-8 / cp1252 / latin1), auto-detect
  riga header con lookahead, csv.reader con delimiter `;`, dedup per
  chiave normalizzata (`strip+lower`) con regola anti-sovrascrittura
  (voci già presenti saltate, mai update), commit atomico con rollback
  su `SQLAlchemyError`, helper `csv_template_response` per il modello
  scaricabile (UTF-8 con BOM per Excel italiano), helper
  `parse_decimal_it` per la virgola decimale italiana. Risposta
  standard `{created, skipped_existing, skipped_invalid,
  total_processed, examples}`. Test unit dedicato (19/19 verdi).
- **8 cataloghi cablati** (POST `…/import-csv` + GET `…/csv-template`,
  ciascuno con bottoni `Modello` / `Importa CSV` nella propria pagina
  settings):
  - Materiali (`Material`) — aggancio fornitore grezzo per nome
  - Fornitori grezzi (`MaterialSupplier`)
  - Centri di costo (`Machine`) — tariffa setup vuota = NULL (fallback)
  - Lavorazioni (`Operation`) — UNIQUE su `name`
  - Fornitori esterni / trattamenti (`Supplier`)
  - Utensili (`Tool`) — **validazione stretta**: Tipo, Marca, Locazione
    e Fornitore devono già esistere nei rispettivi cataloghi (nessuna
    creazione al volo), chiave anti-duplicato = `code` (UNIQUE)
  - Fornitori utensili (`ToolSupplier`)
  - Trattamenti (`Treatment`) — **strict tariffe**: `kg` richiede
    `cost_per_kg`, `dm3` richiede `cost_per_dm3` (evita trattamenti a
    costo zero silenziosi nei preventivi)
- **Aperti** (fuori dal cantiere chiuso): import normalizzati (resta
  come Step 6 del cantiere catalogo normalizzati) e import dei lookup
  utensili (`ToolType` / `ToolBrand` / `ToolLocation`, voce nuova in
  "IDEE PER IL FUTURO").
- **L'import clienti** (`POST /api/customers/import-csv`) resta sul suo
  endpoint storico: ha semantica diversa (upsert per `customer_number`).

### Sessione 2026-06-03 — Bonifica documenti di progetto

- Backup in INSTALLAZIONE.md reso WAL-aware (§9.1); §10 rimanda a `update.bat`
  (commit `893a3ef`).
- Rimossa nota obsoleta su CLAUDE.md dalla lista lavori (`7cc2e9c`).
- B2 della lista lavori ridotto a rimando verso `docs/history/CORREZIONI_PREZZI.md`.
- Stato cantiere normalizzati aggiornato: Step 2-3 fatti.
- Fonte unica di stato adottata: RIFERIMENTO §0. `docs/ROADMAP.md` ridotto a
  rimando; puntatori in `CLAUDE.md` aggiornati.
- Registrata **C16** (consolidare il backup WAL-aware in
  `backend/backup_db.py`).
- Fotografia modulo Catalogo completata (sola lettura): ritrovamenti in
  `MECHQUOTE_LISTA_LAVORI.md`, sezione "Consolidamento moduli — Catalogo".
- **CAT-1 — Semantica `active` ✅ CHIUSO**.
  - **Semantica "ritirato"**: una voce di catalogo con `active=false`
    sparisce dai menu di SCELTA per voci nuove (preventivatore manuale,
    2D, stampi), ma resta sui preventivi che la usano già (mostrata
    "(ritirato)" nella dropdown della sola riga interessata) e resta
    ricalcolabile invariata. Il cost engine non è toccato: naviga le FK
    per id (`Material.id == part.material_id`, `Machine.id == phase.machine_id`,
    ecc.) senza passare dalle liste di catalogo, quindi le voci ritirate
    continuano a calcolare il prezzo dei preventivi storici.
  - **Backend**: parametro `?active` opzionale sui GET catalog
    (`/materials`, `/machines`, `/operations`, `/treatments`, `/suppliers`,
    `/normalized-suppliers`) — default invariato = ritorna tutto, per
    non rompere settings e altre chiamate esistenti. `PhaseOut` esteso
    con 4 nested (`machine`, `operation`, `treatment`, `supplier`) per
    fornire il nome leggibile della voce ritirata; joinedload mirato su
    TUTTE le route che ritornano fasi (no N+1):
    `quotes._load_quote`, `parts.{add,get,update,duplicate}_part`,
    `phases.{add,update}_phase` via helper `_load_phase_with_catalog`,
    `workflow_templates.apply_workflow_to_part`.
  - **Frontend**: helper unico `frontend/src/lib/catalogSelect.ts`
    (`buildCatalogOptions`) che, dato `(activeList, currentValue,
    currentItem, toLabel)`, costruisce le option del `<select>`:
    aggiunge un'option speciale "<Nome> (ritirato)" se `currentValue` è
    settato ma non appare nella lista attiva. Fallback `"(ritirato — id N)"`
    se manca il nested.
  - **Principio**: si filtra `?active=true` SOLO dove l'utente sceglie
    da un menu, MAI sui lookup automatici del codice (rischio: una voce
    di sistema ritirata farebbe sparire una fase intera dal preventivo).
    Mappa per modulo:
    - **Manuale** (`QuoteEditor.tsx` + `PhaseEditor.tsx`): filtrati
      `/materials`, `/machines`, `/operations`, `/treatments`,
      `/suppliers`.
    - **2D** (`NewQuote2DPage.tsx` + `Dxf2dWizard.tsx`): filtrato solo
      `/materials` (unica scelta utente). `/machines` e `/operations`
      restano NON filtrati perché il wizard li usa come lookup
      automatici per `wire_edm`, `EDM a filo`, `Foratura`.
    - **Stampi** (`DieQuoteEditor.tsx`): filtrati `/materials`
      (materiale piastra) e `/normalized-suppliers` (fornitore
      normalizzato). `/machines` NON filtrato (lookup automatico per le
      tariffe `milling/grinding/drilling/edm_wire`). `/treatments`
      lasciato com'è — vedi CAT-7 in lista lavori.
  - **Commit**: `3b11e7f` (backend, filtro opzionale GET catalog),
    `c88058b` (manuale), `febc2ec` (2D), `9a3defc` (stampi).

### Sessione 2026-05-27 — Chiusura Fascia 1 + apertura cantiere normalizzati

Cosa è stato fatto:

- **Fascia 1 calcolo prezzi chiusa.** 5 correzioni di codice applicate
  (C1 trattamento volume tondi, C2 anteprima trattamenti €/dm³, C3
  spedizione magazzino su parti from_stock, C4 doppio arrotondamento +
  unit_price a 4 decimali, C5 unità DXF convertite automaticamente).
- **C6 e C7 spostate** al cantiere stampi come P3 e P2 (modifiche di
  prodotto, non correzioni di codice come le altre).
- **Script `update.bat`** creato per l'aggiornamento manuale del server
  da Git. Backup DB WAL-aware come primo passo, fail-fast con messaggi
  chiari, rollback stampato ma non automatico, nessun automatismo a
  tempo.
- **Cantiere "Catalogo Normalizzati" aperto.** Step 1 fatto (modello
  `NormalizedItem` + migration). Restano Step 2-6 (~5-6 giornate).
  Opzione A confermata per l'aggancio template/preventivi (snapshot).
- **Bug nuovi sul server** registrati: PDF preventivi → 500, stampi →
  404 su `/api/dashboard/alerts`. Vanno indagati in azienda insieme ad
  A2 e A3.
- **Brainstorming idee di prodotto** registrato in
  `MECHQUOTE_LISTA_LAVORI.md` (import CSV cataloghi, descrizione
  trattamenti completa, duplica riga anagrafiche, finestra impostazioni
  più larga, pulizia file).
- **Visione utente registrata per P2 + P3**: "template stampo
  configurabili con lavorazioni abilitabili per piastra". Risolve in un
  colpo solo doppio conteggio foratura/filo, ruoli officina disallineati,
  e forma del pezzo.

Cosa NON è stato toccato (esplicitamente fuori scope):

- Server in azienda (tutti i lavori A2/A3/A8/A9 attendono il viaggio).
- Fascia 2 calcolo prezzi (fragilità medie — programmata per dopo).
- Cantiere stampi (P2/P3 — dopo il Blocco B).

---

*Documento basato sulle cinque ricognizioni condotte fino al 22 maggio
2026. Aggiornato in corso d'opera man mano che i lavori vengono
completati e le domande aperte ricevono risposta. Ultimo aggiornamento:
2026-06-04.*
