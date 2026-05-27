# MechQuote — Correzioni Prezzi

> Lista ordinata di tutto quanto emerso dalle tre ricognizioni sui
> preventivatori (manuale, 2D da DXF, stampi). Tre fasce di priorità.
>
> **Metodo di lavoro**: si parte da **T0** (costruire la rete di test sul
> calcolo prezzi). Poi si affrontano le voci della **Fascia 1** una alla
> volta, con verifica numerica e commit separato per ognuna. La Fascia 2
> dopo la Fascia 1, una alla volta. La Fascia 3 contiene voci che
> richiedono prima una decisione dell'azienda o che hanno impatto minore.
>
> I numeri di riga indicati nei file sono approssimativi (`~`) perché
> tendono a slittare dopo ogni modifica. Il riferimento autoritativo
> resta il nome della funzione + il significato semantico.
>
> **Stato Fascia 1 (al 2026-05-27): CHIUSA per le correzioni di codice
> pure — 5 su 7 fatte. Le altre 2 (C6 e C7) sono state riconosciute come
> modifiche di prodotto e spostate al cantiere stampi.**
>
> - ✅ C1 trattamento volume tondi (backend)
> - ✅ C2 trattamento volume anteprima frontend
> - ✅ C3 spedizione magazzino spalmata su tutte le parti from_stock
> - ✅ C4 doppio arrotondamento total_price
> - ✅ C5 unità DXF convertite automaticamente in mm
> - ➡ **C6 spostata** al cantiere stampi (P3 in `MECHQUOTE_LISTA_LAVORI.md`):
>   non è una correzione di tariffa isolata. La "foratura piastre" è oggi
>   modellata in modo intrecciato con altri nodi del calcolo stampi
>   (doppio conteggio foratura + EDM filo su matrici e porta_punzoni;
>   ruoli piastra che non coincidono con la realtà dell'officina;
>   "premilamiera" che nel codice non va al filo ma per l'officina sì).
>   Correggere la sola tariffa risolverebbe metà del problema e lascerebbe
>   tutto il resto rotto.
> - ➡ **C7 spostata** al cantiere stampi (P2 in `MECHQUOTE_LISTA_LAVORI.md`):
>   richiede aggiungere al modello `DieSpec` un campo "forma del pezzo"
>   (rettangolare/tondo) — è modifica di modello + UX, non correzione
>   di codice.

---

## T0 — Rete di test sul calcolo prezzi (PREREQUISITO)

Prima di toccare le 7 voci della Fascia 1: costruire una **suite di test
"a casi d'oro"** che verifichi i risultati attesi del cost engine per il
preventivatore manuale e per gli stampi, **più un test di parità** che
confronti backend e frontend sugli stessi input.

Scopo: ogni correzione successiva si verifica facendo girare la suite, e
se qualcosa si rompe inavvertitamente la suite se ne accorge.

Dettaglio: vedi piano operativo concordato a parte (non ancora scritto in
questo documento; documenteremo qui il risultato finale dopo l'esecuzione).

---

## ░░░ FASCIA 1 — Errori di prezzo veri (priorità alta) ░░░

Sette voci. Sono gli errori che oggi producono **un prezzo sbagliato sul
PDF cliente** o sull'anteprima visibile. Ognuno si affronta da solo, con
verifica T0 prima e dopo, e commit dedicato.

### C1 — Trattamento a volume sui pezzi tondi

**Problema**: il server calcola il volume del pezzo per i trattamenti
`€/dm³` come `raw_x × raw_y × raw_z`. Per i pezzi cilindrici
(`raw_diameter_mm` valorizzato, raw_x e raw_y NULL), il volume risulta
**0** → il trattamento costa **0 €** in entrambi i preventivatori. Se nel
batch ci sono pezzi misti (tondi + prismatici), i tondi viaggiano gratis
e i prismatici si beccano tutto il costo.

**Dove sta**: `backend/app/services/calculation.py:302-306`
(pre-aggregazione del batch volume) e `~412-415` (volume del pezzo per la
quota). La formula del cilindro esiste già altrove (`_raw_weight_kg`,
`_compute_material_cost`): va replicata nei due punti del ramo
trattamento €/dm³.

**Esempio numerico**: tondo Ø 50 × 100 mm, trattamento nitrurazione
2 €/dm³, qty 100.
- Volume reale: π × 25² × 100 / 1.000.000 × 100 = 19,6 dm³ → 39,20 €.
- Volume oggi: 0 × 0 × 100 / 1.000.000 × 100 = 0 dm³ → **0 €**.

**Rischio**: per chi lavora tondi con rivestimento/nitrurazione, l'intera
voce trattamento è azzerata in silenzio.

---

### C2 — Trattamento a volume ignorato dall'anteprima

**Problema**: l'anteprima `calcTreatmentCost` del frontend ignora del
tutto `cost_unit='dm3'` e usa sempre `cost_per_kg`. Per un trattamento a
volume mostra **0 €** a video; il prezzo vero appare solo dopo il
salvataggio.

**Dove sta**: `frontend/src/lib/quoteCalc.ts` (`calcTreatmentCost`).

**Da fare DOPO C1**: ha senso allineare l'anteprima solo quando il
backend è già corretto sui pezzi tondi; altrimenti l'anteprima
replicherebbe il bug del backend.

**Rischio**: l'anteprima diverge dal prezzo finale ogni volta che c'è un
trattamento a volume.

---

### C3 — Materiale da magazzino in commessa: spedizione raddoppiata in anteprima

**Problema**: nel calcolo della spedizione "da magazzino" il backend
divide per il numero di parti from-stock **e** per la quantità; il
frontend divide solo per la quantità. In un preventivo commessa con più
parti da magazzino, l'anteprima mostra la spedizione moltiplicata per il
numero di parti.

**Dove sta**: `backend/app/services/calculation.py:~346-348` vs
`frontend/src/lib/quoteCalc.ts:~84`.

**Esempio numerico**: 2 parti da magazzino, `stock_shipping_cost = 20 €`,
qty A=10, qty B=5.
- Backend: A riceve 1 €/pezzo, B 2 €/pezzo.
- Frontend (oggi): A vede 2 €/pezzo, B 4 €/pezzo (×2 il giusto).

**Rischio**: in preventivi commessa con materiale a magazzino l'anteprima
inganna; al salvataggio il prezzo scende e l'utente non sa quale fidare.

---

### C4 — Doppio arrotondamento del prezzo totale

**Problema**: `total_price = round(unit_price × qty, 2)` su un
`unit_price` già arrotondato a 2 decimali. Su quantità alte accumula uno
scarto fino a **qualche euro** sul prezzo finale. Presente in modo
identico in backend e frontend — non è una divergenza ma un errore
allineato in entrambi.

**Dove sta**: `backend/app/services/calculation.py:~483-484` e
`frontend/src/lib/quoteCalc.ts` (in `calcPartTotals`).

**Esempio numerico**: costo 0,985 €, margine 0%, qty 100.
- Matematicamente: 0,985 × 100 = **98,50 €**.
- Oggi: round(0,985, 2) = 0,98 → 0,98 × 100 = **98,00 €**.
- Scarto: 0,50 € per 100 pezzi → si moltiplica con quantità maggiori.

**Correzione**: arrotondare `total_price` direttamente da
`max(cost, min) × (1 + margine/100) × qty`, senza passare per
`unit_price` già arrotondato.

**Rischio**: su preventivi a quantità alta (1000+ pezzi) il prezzo
finale può discostarsi di qualche euro dal calcolo corretto.

---

### C5 — Unità DXF non convertite

**Problema**: il parser DXF legge `$INSUNITS` (codice di unità nel file
DXF) e **emette un warning testuale** se è diverso da mm, ma **non
converte** le coordinate. Un disegno in pollici (codice 1) viene trattato
come mm → prezzo del taglio EDM **circa 25 volte sbagliato**
(fattore 25,4).

**Dove sta**: `backend/app/services/dxf_parser.py:~254-259`. La
correzione corretta è far **convertire automaticamente** le coordinate
leggendo `$INSUNITS`, non aggiungere un controllo manuale. Come rete di
sicurezza per i rari file `unitless` (codice 0) si valuta poi un
interruttore mm/pollici nel wizard (idea futura).

**Rischio**: prezzi catastroficamente sbagliati su qualsiasi disegno non
nativo in mm (file americani, file di certi CAD, file generati con
unità diverse).

---

> **Nota.** Originariamente la Fascia 1 conteneva 7 voci. Due sono state
> riconosciute come modifiche di prodotto (cantiere stampi) e spostate
> in `MECHQUOTE_LISTA_LAVORI.md` (sezione Decisioni di prodotto):
>
> - **C6** "tariffa foratura piastre stampo usa la tariffa fresatura" →
>   **P3**. Il bug della tariffa è reale (in `_recalculate_die_levels`
>   il fallback di `rate_drill` è `hourly_rate_milling` e non esiste
>   `hourly_rate_drilling` nel modello), ma fissarlo isolatamente avrebbe
>   poco senso: la "foratura piastre" oggi è una stima ore generica
>   `area × n_facce × ore/dm²` applicata a tutte le piastre, anche a
>   quelle che vanno al filo (matrice, porta_punzoni). Si paga foratura
>   e EDM in parallelo. C6 fa parte del ripensamento più ampio.
>
> - **C7** "perimetro sagome tonde stampi sovrastimato del ~53%" →
>   **P2**. Richiede un campo "forma del pezzo" su `DieSpec` (non
>   esiste). Il caso d'oro S7 resta nella suite con
>   `fails_until: P_die_shape` come promemoria.

---

## ░░░ FASCIA 2 — Fragilità medie ░░░

Voci che producono comportamenti opachi, anteprime stantie o calcoli
silenziosamente zero. Non causano un errore di prezzo "ogni volta", ma
in scenari specifici sì.

- **Anteprime stantie su spedizione materiale e trattamento**: il
  frontend usa i valori salvati nel DB, non ricalcola live. Tra una
  modifica e l'altra l'anteprima è "vecchia"; si allinea al primo
  salvataggio. (B2-#4 e affini.)
- **Calcoli che mettono 0 in silenzio quando manca un dato**:
  - Autocalc EDM (manuale + 2D): se manca la riga `EdmCutSpeed` per
    (famiglia, spessore), `cycle_hours_per_part = 0` senza warning
    bloccante.
  - Lookup tempo foratura nel wizard 2D: se manca la riga
    `DrillingTime`, la fase Foratura non viene proprio creata.
  - L3 EDM stampi: piastre senza family o senza cycle vengono
    silenziosamente saltate (`hours_by_plate[plate.id]` non popolato).
  - L4 accessori stampi: se `difficulty` non è valido o
    `design_hourly_rate` è NULL, intere voci vanno a 0 senza warning.
  - L1 piastre stampi: Part senza `plate_role` valorizzato non vengono
    sommate, ma restano visibili nell'editor.
- **Forma del pezzo non selezionabile nel wizard 2D**: il grezzo è
  sempre modellato come parallelepipedo, anche per pezzi nati da barre
  tonde. Sovrastima costo materiale ~27% sui dischi (vedi B2-#10 in
  lista lavori).
- **Tempo foratura 2D non ricalcolato dal server**: una volta creato
  il preventivo, modifiche all'altezza pezzo o alla tabella
  `DrillingTime` non aggiornano il tempo foratura. Resta "congelato".
- **Validazione grezzo mancante nel wizard 2D**: si può salvare un
  grezzo più piccolo del bbox profili senza che nulla blocchi.
- **Arrotondamento costo materiale troppo presto**: `_compute_material_cost`
  arrotonda a 2 decimali prima che il valore entri in `total_cost` (a
  4 decimali). Perde precisione, marginale.
- **Default silenziosi negli stampi**: `_PLATE_ROLE_DEFAULTS`
  (`calculation.py:~539-545`) sostituisce snapshot Part NULL con valori
  hardcoded senza segnalarlo all'utente.
- **Backend riscrive override manuali su fasi trattamento**: ogni
  `recalculate_quote` sovrascrive `variable_cost_per_part` e
  `fixed_cost` delle fasi con trattamento. Se l'utente cerca di
  forzarli a mano, perde la modifica.

---

## ░░░ FASCIA 3 — Domande all'azienda e minori ░░░

Voci che richiedono una **decisione di prodotto** prima dell'intervento
tecnico, o che hanno impatto basso.

**Da chiarire con l'azienda**:
- **Sconto sotto il prezzo minimo**: oggi lo sconto a livello preventivo
  può portare il totale sotto la somma dei "prezzi minimi" delle parti.
  Il prezzo minimo è invalicabile o un punto di partenza? (Domanda D1
  nella lista lavori.)
- **Sconto su trasporto/imballaggio**: oggi lo sconto si applica anche a
  queste voci. Va corretto a "trasporto vivo, non scontabile"? (D2.)
- **Arrotondamento contabile**: oggi backend usa "banker's rounding"
  (0,005 → 0,00), frontend usa "half-away-from-zero" (0,005 → 0,01).
  Differenze massime di 1 centesimo. Decisione dell'amministrazione su
  quale convenzione adottare ovunque. (B2-#5.)

**Minori**:
- **Tariffa "station bonus" stampi**: usa la tariffa fresatura. Da
  verificare con l'officina se è semanticamente corretto.
- **Limiti mancanti su `n_bends_*` / `n_punches_*`**: nessun massimo
  Pydantic. Errore di battitura ("100 pieghe" invece di "10") porta L4
  a sovrastimare. Da aggiungere `le=...` ragionevole.
- **Override matita negativi**: nessun vincolo Pydantic verificato sui 4
  `override_*` di DieSpec. Da verificare e bloccare se necessario.
- **L2 spedizione "tutto o niente"**: anche un item con `quantity = 0`
  ma `supplier_id` valorizzato aggiunge l'intera spedizione. Voluto?
- **L6 margine moltiplica gli override matita "alti"**: l'override
  matita "tutela rischio" viene poi moltiplicato dal margine
  percentuale. Comunicare meglio nell'UI.
- **Fallback cycle_id "primo attivo"**: ordine potenzialmente diverso
  tra backend (`order by id`) e frontend (`find` su array in ordine
  arbitrario). Caso edge.
- **`cost_industrial` salvato al netto di margine/sconto**: report SQL
  diretti sul DB non corrispondono ai PDF clienti. Da gestire a livello
  di dashboard/export, non di cost engine.

---

## Storico delle correzioni applicate

| Data | Voce | Commit | Test T0 |
|---|---|---|---|
| 2026-05-25 | T0 — rete di test (casi d'oro backend+frontend, parità, regressivi, canarino) | `2f9f2fc` | suite costruita, esito iniziale: 29+15 verdi, 4+4 xfail |
| 2026-05-26 | C1 — trattamento volume tondi (backend cilindro) | `ee28831` | M10 backend → verde (0,3927 €/pz) |
| 2026-05-26 | C2 — anteprima frontend trattamenti a volume | `7c7421c` | M9 e M10 frontend → verdi (0,20 e 0,3927 €/pz) |
| 2026-05-26 | C3 — spedizione magazzino spalmata su parti from_stock (frontend) | `70ffef5` | M6 frontend → verde (A=1,00 €/pz, B=2,00 €/pz) |
| 2026-05-26 | C4 — niente doppio arrotondamento; unit_price a 4 dec con zeri tagliati | `fa4594d` | M2 backend+frontend → verdi (98,50 €) |
| 2026-05-26 | C5 — coordinate DXF convertite in mm in base a `$INSUNITS` | `8de2732` | D2 backend → verde (9070 mm) |
| 2026-05-27 | C7 — **rinviata** al cantiere stampi (P2): richiede campo `shape` su DieSpec, non è correzione di codice come le altre | — | S7 resta xfail con motivo `P_die_shape` come promemoria |
| 2026-05-27 | C6 — **rinviata** al cantiere stampi (P3): la tariffa foratura è un sintomo, il calcolo lavorazioni piastre stampo va ripensato (doppio conteggio drill+EDM, ruoli piastra, "premilamiera" al filo) | — | nessun caso d'oro dedicato a C6 (la suite non lo copriva: era un fallback di tariffa, non un calcolo specifico) |

**Stato finale Fascia 1**: 5 correzioni di codice applicate, 2 rinviate
al cantiere stampi (C6→P3, C7→P2). La Fascia 1 è chiusa per le
correzioni di codice pure: i bug isolati e ben circoscritti sono stati
risolti; quelli intrecciati con la modellazione degli stampi vanno
affrontati nel cantiere dedicato.
