# 21 — Concorrenza multi-utente sui preventivi (F5 / Blocco B)

> **Stato:** PIANIFICATO, non ancora implementato. Blocco B.
> Documento di riferimento per quando si affronta il lavoro: problema,
> infrastruttura già presente, soluzione proposta, decisioni da prendere,
> piano di implementazione. Emerso dall'audit preventivazione 2026-07 (voce F5).

---

## 1. Il problema — "lost update silente"

MechQuote nasce multi-utente, ma oggi due persone sullo stesso preventivo
possono sovrascriversi a vicenda **senza alcun avviso**:

- Marco e Laura aprono lo stesso preventivo.
- Marco cambia il margine e salva.
- Laura, che aveva la versione vecchia aperta, cambia una nota e salva.
- Il salvataggio di Laura sovrascrive anche il margine di Marco (torna al
  valore vecchio). Nessuno viene avvisato: **l'ultimo che salva vince**
  (last-write-wins).

Peggiora col fatto che l'editor salva **on-blur di continuo** (campi
numerici, fasi): non serve nemmeno un click esplicito su "Salva" per
sovrascrivere il lavoro altrui.

Riferimenti: `CLAUDE.md §4` (Concorrenza — last write wins),
`MECHQUOTE_RIFERIMENTO.md §7` (tema multi-utente).

---

## 2. Cosa esiste GIÀ (infrastruttura parziale)

Non si parte da zero. È già presente:

- **Colonna `Quote.updated_at`** bumpata a ogni modifica dell'aggregato: il
  ricalcolo (`services/calculation.py` → `recalculate_quote`, riga finale
  `quote.updated_at = utc_now()`) passa per ogni scrittura di parte/fase, e il
  PUT `/quotes/{id}` la tocca. Quindi `updated_at` cambia per QUALSIASI
  modifica al preventivo (parti e fasi comprese).
- **Endpoint di versione leggero:** `GET /api/quotes/{id}/version`
  (`api/quotes.py` → `get_quote_version`) ritorna `{id, updated_at}` senza
  caricare parti/fasi. Nato apposta per il rilevamento concorrenza.
- **Rilevamento lato editor (solo avviso):** `QuoteEditor.tsx` polla
  `/version` ogni 15s + on-focus; se `updated_at` è diverso da quello
  dell'ultimo sync mostra un **banner giallo** "modificato da un'altra
  persona, ricarica prima di salvare".

**Il buco:** il banner è **solo informativo**. Nessuna scrittura controlla la
versione: l'utente può ignorare l'avviso e ogni blur salva comunque,
sovrascrivendo. Manca il **blocco vero** lato server.

---

## 3. Soluzione proposta — optimistic locking (If-Match su updated_at)

Approccio classico e leggero, coerente con l'infrastruttura esistente:

1. Il client, quando ha caricato il preventivo, conosce `updated_at` (la
   "versione" vista). Lo tiene (già fa: `serverVersion` ref in QuoteEditor).
2. Ad ogni **scrittura** (PUT quote, PUT/POST/DELETE parti e fasi) il client
   invia la versione vista, es. header `If-Match: <updated_at>` o un campo
   `expected_updated_at` nel body.
3. Il server, prima di scrivere, confronta la versione attesa con quella
   attuale del preventivo. Se **diverse** → rifiuta con **409 Conflict** e un
   messaggio chiaro, senza scrivere nulla.
4. Il client, sul 409, mostra all'utente "Qualcun altro ha modificato nel
   frattempo: ricarica per vedere le modifiche" (niente sovrascrittura
   silenziosa) e offre **Ricarica**.

Vantaggi: minimale, si appoggia a `updated_at` che già c'è, nessuna nuova
colonna, nessun merge complesso. È esattamente ciò che serve per "non perdere
lavoro".

---

## 4. Decisioni di prodotto DA PRENDERE (prima di scrivere codice)

Queste vanno confermate con l'utente:

1. **Gestione del conflitto — solo blocco+avviso, o merge?**
   Raccomandato: **solo blocco+avviso** (optimistic lock come sopra). Il merge
   automatico (fondere le modifiche dei due) è molto più lavoro e rischio, e
   raramente giustificato per questo strumento. → *decisione: blocco+avviso.*

2. **Granularità — a livello di quale scrittura si controlla la versione?**
   - Solo il PUT dei campi preventivo (`/quotes/{id}`), o
   - anche parti/fasi (`/parts/*`, `/phases/*`) che salvano on-blur?
   Per essere davvero al riparo servono **anche parti/fasi** (è lì che si
   sovrascrive di più). Ma questo tocca molti endpoint. Possibile fasare:
   prima il PUT quote (facile), poi parti/fasi.

3. **Cosa conta come "conflitto"?** Siccome `updated_at` è dell'INTERO
   aggregato, due persone che toccano parti diverse dello stesso preventivo
   confliggono comunque. Va bene? (Semplice e sicuro, ma può dare falsi
   conflitti se due lavorano su articoli diversi della stessa commessa.)
   Alternativa più fine (versione per-parte) = più lavoro. → decidere il
   livello di tolleranza.

4. **UX del conflitto:** blocco duro (non puoi salvare finché non ricarichi) o
   scelta ("Ricarica" / "Sovrascrivi comunque")? Raccomandato: **Ricarica**
   come azione primaria; "sovrascrivi comunque" solo se davvero serve.

---

## 5. Piano di implementazione (bozza)

### Backend (`api/quotes.py`, `api/parts.py`, `api/phases.py`)
- Helper condiviso `ensure_version(quote, expected)` in `quotes.py`: se
  `expected` è presente e `!= quote.updated_at` → `HTTPException(409, ...)`.
- Riceverlo via header `If-Match` (o campo body) su:
  - `PUT /quotes/{id}` (fase 1),
  - `PUT /parts/{id}`, `POST /quotes/{id}/parts`, `DELETE /parts/{id}`,
    `PUT /phases/{id}`, `POST /parts/{id}/phases`, `DELETE /phases/{id}` (fase 2).
- Attenzione: `updated_at` viene bumpato nel ricalcolo; confrontare il valore
  PRE-scrittura. Le transizioni di stato (confirm/reopen/...) probabilmente
  restano fuori (sono azioni puntuali di amministrazione, non editing
  concorrente) — da confermare.

### Frontend (`QuoteEditor.tsx`, `lib/api.ts`)
- Inviare `serverVersion.current` come `If-Match` su tutte le scritture
  dell'editor (`saveQuote`, `savePart`, `saveImmediate`/`savePhase` in
  PhaseEditor, add/delete parte/fase).
- Interceptor 409 in `lib/api.ts` (o gestione locale): su 409 mostrare il
  banner/toast "modificato da altri — ricarica" e NON considerare salvato.
  Riusare il `staleConflict` già presente + il pulsante "Ricarica".
- Aggiornare `serverVersion.current` ad ogni risposta fresca (già fatto in
  `applyQuoteData`).

### Note tecniche
- SQLite in WAL + `busy_timeout`: `MECHQUOTE_RIFERIMENTO.md §7` segnala anche
  la mancanza di `busy_timeout` (due commit simultanei → errore tecnico).
  Valutare di impostarlo (`PRAGMA busy_timeout`) nello stesso lavoro:
  complementare all'optimistic lock (uno evita lost-update logico, l'altro
  evita l'errore fisico di lock DB).

---

## 6. Scope

**Dentro:** protezione lost-update sull'editing dei preventivi (campi + parti +
fasi), avviso all'utente, `busy_timeout` SQLite.

**Fuori:** merge automatico; versioning storico delle modifiche; lock
pessimistico ("preventivo in uso da X, sola lettura"); presence/awareness in
tempo reale.

---

## 7. Test

- Unit/integration backend: due scritture con la stessa `expected_updated_at`
  → la seconda riceve 409; con versione aggiornata → 200.
- Simulazione due sessioni (come negli harness dell'audit): A salva, B (con
  versione vecchia) salva → 409, nessuna sovrascrittura; B ricarica → 200.
- Verifica che il ricalcolo/`updated_at` non generi falsi 409 nella stessa
  sessione (il client deve aggiornare la versione dopo ogni risposta).

---

## 8. Rischi / note

- **Falsi conflitti** su commesse multi-parte (versione a livello aggregato):
  accettabile all'inizio, eventualmente affinare dopo.
- **Molti endpoint** da toccare per la fase 2 (parti/fasi): fasare per non
  fare tutto in un colpo.
- Zona sensibile: gli endpoint di scrittura passano da `ensure_editable` /
  `recalculate_part`; inserire il check versione senza rompere quei flussi.
- È un lavoro di **affidabilità multi-utente**, non una feature visibile:
  vale la pena solo se il preventivatore è usato da più persone insieme
  (che è l'obiettivo dichiarato del progetto).
