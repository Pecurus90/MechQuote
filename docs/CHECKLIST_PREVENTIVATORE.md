# Checklist preventivatore — verifiche manuali post-fix

Lista di scenari numerici concreti per verificare i flussi critici del preventivatore manuale e 2D DXF dopo qualsiasi fix che tocchi `calculation.py`, `quoteCalc.ts`, `PartCard.tsx`, `PhaseEditor.tsx`, `QuoteEditor.tsx`, `parts.py`, `phases.py`, `quotes.py`.

**Tempo richiesto**: 5–10 min per checkpoint completo.

**Setup ricorrente**: backend live su `localhost:8000`, frontend `localhost:5173`, login `admin/admin`. Usa cataloghi reali (Material, MaterialSupplier con `shipping_cost`, Treatment con `minimum_weight_kg` + `minimum_cost`, Machine con `hourly_rate`).

---

## A — Preventivo singolo (single quote)

### A1. Crea preventivo + 1 parte semplice
1. Nuovo Preventivo → Manuale → tipo "Singolo".
2. Compila: cliente esistente, codice univoco.
3. Apri la parte, seleziona materiale + dimensioni grezzo (es. `100×50×20 mm`, materiale acciaio).
4. Imposta `qty=10`, `peso finito=0.5 kg`, `margine=30%`.
**Atteso**:
- "Costo mat." > 0 (calcolato da volume × densità × €/kg × scrap)
- "Spediz. mat." = `shipping_cost` intero del fornitore (1 parte sola = prende tutto)
- "Costo/pz" = `material_cost + shipping/qty + cutting/qty + Σ fasi`
- "Prezzo/pz" = `Costo/pz × 1.30`
- "Totale" = `Prezzo/pz × 10`

### A2. PDF cliente / interno
1. Da A1, click "PDF cliente": deve aprirsi PDF con sezioni cliente-friendly.
2. Click "PDF interno": stesso preventivo, ma con dettagli costi/margini.
**Atteso**: 2 PDF distinti, header `%PDF-1.x`, > 100 KB, niente errori in console.

### A3. PDF su preventivo vuoto
1. Crea preventivo nuovo, NON aggiungere parti.
2. Click "PDF cliente".
**Atteso**: PDF si apre, contiene **box giallo "⚠ Preventivo senza componenti"**. Nessun crash.

---

## B — Commessa multi-parte (verifiche aggregazione)

### B1. Spedizione materiale proporzionale al peso grezzo
1. Nuovo Preventivo → Manuale → tipo "Commessa", `num_components=3`.
2. Tutte e 3 le parti: stesso materiale, fornitore con `shipping_cost = 30€`.
3. Compila dimensioni grezzo: parte 1 = `100×100×10` (acciaio 7.85), parte 2 = `50×50×10`, parte 3 = `200×200×20`.
4. Imposta `qty` su tutte = 1.
**Atteso**:
- Parte 1: peso grezzo ≈ 0.785 kg → quota spedizione ≈ `30 × 0.785 / Σ`
- Parte 2: peso grezzo ≈ 0.196 kg → quota più piccola
- Parte 3: peso grezzo ≈ 6.28 kg → quota più grande
- **Somma "Spediz. mat." su 3 parti = 30€ esatti**

### B2. Selezione solo materiale → spedizione = 0
1. In commessa, su una parte: seleziona solo il materiale, NON compilare dimensioni.
**Atteso**: "Spediz. mat." resta a 0 (o vuoto). Il valore intero NON appare poi scompare.

### B3. Cancellazione parte → ridistribuzione
1. Da B1 (3 parti, somma spediz = 30€), elimina parte 2.
**Atteso**: rimangono 2 parti, le quote di parte 1 e parte 3 si **ridistribuiscono** proporzionali al loro peso. **Somma = ancora 30€**.

### B4. Selezione parte stabile dopo modifica
1. Commessa multi-parte. Seleziona parte 2 nella sidebar.
2. Aggiungi un trattamento alla parte 2.
**Atteso**: la parte 2 resta selezionata (non salta su un'altra). Il valore "spedizione trattamento" si aggiorna senza ulteriori click.

---

## C — Trattamenti termici (soglia batch)

### C1. Sopra soglia → applico cost_per_kg
Setup: trattamento "Cementazione" con `minimum_weight_kg = 20`, `minimum_cost = 80€`, `cost_per_kg = 5€`.
1. Commessa 3 parti: pesi finiti 5, 8, 10 kg (tot batch 23 kg > 20).
2. Assegna trattamento "Cementazione" a tutte e 3.
**Atteso**:
- **Nessun warning "lotto sotto soglia"** su nessuna parte
- Costo totale trattamento = `23 × 5 = 115€`
- Distribuito proporzionale: parte 1 = `115 × 5/23 ≈ 25€`, parte 2 = `115 × 8/23 ≈ 40€`, parte 3 = `115 × 10/23 = 50€`

### C2. Sotto soglia → applico minimum_cost forfait
Stesso setup C1.
1. Commessa 3 parti: pesi 2, 3, 4 kg (tot 9 kg < 20).
**Atteso**:
- **Warning "lotto sotto soglia"** visibile (su tutte le parti del gruppo)
- Costo totale trattamento = **80€** (forfait)
- Distribuito proporzionale: parte 1 = `80 × 2/9 ≈ 17.78€`, parte 2 ≈ `26.67€`, parte 3 ≈ `35.56€`

### C3. Trattamento senza peso finito
1. Singola parte. Aggiungi trattamento. NON compilare "Peso finito".
**Atteso**:
- Campo "Peso finito (kg)" diventa **rosso** con asterisco
- Sotto il campo: "⚠ Compila il peso: serve per costo e spedizione del trattamento"
- Costo trattamento e spedizione visibili = 0

### C4. Refresh immediato cambio trattamento
1. Commessa 2 parti, entrambe con stesso trattamento (supplier `shipping_cost = 50€`).
2. Cambia il trattamento su una parte (es. da "Cementazione" a "Nitrurazione" stesso supplier).
**Atteso**: toast "Trattamento salvato" appare, valori "spediz. trattamento" sulle siblings si aggiornano **subito** (nessun click extra richiesto).

---

## D — Workflow stati preventivo

### D1. Bozza → Inviato → Completato (admin)
1. Crea preventivo con utente normale (non-admin).
2. Compila parte, click "Invia per revisione".
3. Stato passa a "Inviato".
4. Login come admin, apri il preventivo.
**Atteso**:
- Stato passa automaticamente a "Completato"
- Notifica "Preventivo NNN completato" creata per il creatore
- Preventivo non più editabile da non-admin

### D2. Cancellazione preventivo (solo creatore o admin)
1. Login come utente A (creatore di un preventivo bozza).
2. Cancella → ok.
3. Login come utente B (diverso creatore, non admin).
4. Tenta di cancellare un preventivo di A.
**Atteso**: 403, B non può.

---

## E — Preventivatore 2D DXF

### E1. Upload DXF valido + selezione profili
1. Nuovo Preventivo → 2D DXF → upload file `.dxf` valido.
2. Step 2: vedi lista profili, seleziona alcuni chiusi.
3. Step 3: compila campi (materiale, ciclo, n_holes), click "Crea Preventivo".
**Atteso**: preventivo creato, quote_mode='2d_dxf' (verifica via `/api/quotes/{id}` → `parts[0].quote_mode == '2d_dxf'`).

### E2. Upload file invalido
1. Rinomina un PDF o ZIP a `.dxf` → upload.
**Atteso**: HTTP 400 con messaggio specifico "File non sembra un DXF valido (header non riconosciuto)".

### E3. Tolerance fuori range
1. Modifica chiamata API: `POST /api/dxf/analyze?tolerance_mm=0` con file valido.
**Atteso**: HTTP 422 (Pydantic), messaggio "Input should be greater than 0".

### E4. File vuoto
1. Upload file di 0 byte rinominato `.dxf`.
**Atteso**: HTTP 400 "File vuoto".

### E5. File >50 MB
1. Upload file `.dxf` da 51+ MB.
**Atteso**: HTTP 413 "File troppo grande (max 50 MB)".

---

## F — Validazioni (sicurezza dati)

### F1. quote_number duplicato
1. Crea preventivo con `quote_number="TEST-001"`.
2. Crea altro preventivo con stesso numero.
**Atteso**: HTTP 400 "Numero preventivo 'TEST-001' già esistente". Mai 500.

### F2. quantity negativa via API
1. `PUT /api/parts/{id}` con `{"quantity": -5}`.
**Atteso**: HTTP 422 (validation Pydantic ge=1).

### F3. Privilege escalation chiusa
1. Login come utente non-admin (es. ruolo "officina").
2. POST `/api/auth/register` con `{"role": "admin", ...}`.
**Atteso**: HTTP 403 "Solo un admin può assegnare il ruolo admin".

---

## Come usare questa checklist

- **Dopo ogni fix sul preventivatore**: gira gli scenari della sezione corrispondente (es. fix calculation → sezione B+C).
- **Prima di un release**: gira tutto.
- **Quando trovi un nuovo bug**: aggiungi uno scenario qui sotto descrivendo input/atteso/visto, così resta tracciato per il futuro.

## Bug noti aperti (da fixare)

- M1 — `PUT /api/phases/{id}` richiede sempre `phase_type` (PhaseUpdate non parziale)
- M2 — `POST /api/customers` richiede `customer_number` int (frontend genera, API consumer esterno deve saperlo)
- M3 — `GET /api/dashboard/my-quotes` richiede query param `status` (no default)
