# Tutorial — Come si fa un preventivo

Questa guida ti spiega passo passo come usare i **tre modi di preventivare** che MechQuote ti mette a disposizione. È scritta come se non sapessi nulla del software: ogni campo, bottone e parametro è spiegato in parole semplici, con esempi numerici reali.

---

## Indice

1. [Quale modo uso quando?](#quale-modo-uso-quando)
2. [Concetti comuni a tutti e tre](#concetti-comuni-a-tutti-e-tre)
3. [Modo 1 — Preventivo Manuale](#modo-1--preventivo-manuale)
4. [Modo 2 — Preventivo 2D DXF (Wire EDM)](#modo-2--preventivo-2d-dxf-wire-edm)
5. [Modo 3 — Preventivo Stampi (la guida completa)](#modo-3--preventivo-stampi-la-guida-completa)
6. [Impostazioni — dove sta cosa](#impostazioni--dove-sta-cosa)
7. [Trucchi e raccomandazioni finali](#trucchi-e-raccomandazioni-finali)

---

## Quale modo uso quando?

| Hai questo | Usa |
|---|---|
| Solo testa e disegno cartaceo (niente file digitali) | **Manuale** |
| File DXF (2D, profilo da tagliare a filo) | **2D DXF** |
| Devi preventivare uno **stampo per lamiera** (passo o blocco) | ~~**Stampi**~~ *(modulo rimosso, in ricostruzione — vedi Modo 3)* |

Pensa così:
- **Manuale** = compili a mano, riga per riga, quante ore e quale macchina.
- **2D DXF** = il computer guarda il DXF, misura il profilo, calcola da solo le ore di taglio filo.
- **Stampi** = scegli "stampo passo a 3 stazioni" o "stampo a blocco", il sistema crea le piastre, calcola le ore EDM, prepara la lista normalizzati. Tu ritocchi solo dove serve.

---

## Concetti comuni a tutti e tre

Prima di entrare nei tre modi, ci sono alcune cose che funzionano uguale in tutti.

### Il **codice preventivo**
Formato: `XXX-YYC_NNN`, es. `240-26A_001`.
- `XXX` = 3 cifre del **cliente** (sempre 3, anche se nel gestionale ha 1 sola cifra → "5" diventa "005").
- `YY` = 2 cifre dell'**anno** (26 = 2026).
- `C` = una lettera che indica la **categoria** del lavoro (A, B, C…). Le categorie si configurano in Impostazioni.
- `_NNN` = il numero progressivo del gestionale.

Il wizard ti aiuta a comporlo: tu inserisci le cifre, lui mostra il codice finale.

### Gli **stati** del preventivo
Ogni preventivo passa per 3 stati:
1. **Bozza** = ci stai lavorando. Tutti i campi modificabili.
2. **Inviato per revisione** = hai cliccato il bottone "Invia per revisione". Solo l'admin può ancora modificarlo. Il sistema avvisa chi deve rivederlo.
3. **Completato** = l'admin l'ha aperto e confermato. Non si modifica più (tranne i campi "venduto" e "consuntivo", vedi sotto).

Se sbagli, da bozza puoi sempre cancellare il preventivo.

### Il **margine** e lo **sconto**
- **Margine** = la tua percentuale di guadagno aggiunta al costo industriale. Esempio: costo 1000€, margine 30% → prezzo lordo 1300€.
- **Sconto** = riduzione che applichi sul prezzo lordo per fare ingoiare la pillola al cliente. Esempio: prezzo lordo 1300€, sconto 10% → prezzo finale 1170€.

Il margine ha un default in **Impostazioni → Azienda → Dati Azienda** (campo "Margine di default %"). Quando crei un preventivo nuovo, parte da lì. Tu puoi sempre cambiarlo per il singolo preventivo.

### Il **prezzo minimo per parte**
In Impostazioni → Azienda c'è "Prezzo minimo per parte (€)". Se il costo calcolato di una parte è sotto questa cifra, il sistema usa il minimo. Serve per evitare prezzi ridicoli (es. una rondellina che esce a 0.30€ → la fatturi a 50€ minimo).

### **Trasporto** e **packaging**
Due voci forfettarie aggiunte al totale del preventivo. Default in Impostazioni → Azienda. Si modificano per singolo preventivo dall'editor.

### **Chiusura commessa** (sold_price + actual_cost)
**Quando il preventivo è completato** appare una sezione speciale in fondo all'editor: "Chiusura commessa". Lì inserisci:
- **Prezzo venduto** = a quanto l'hai venduto davvero, post-trattativa.
- **Costo consuntivo** = quanto ti è costato fare il lavoro davvero.

Questi due numeri sono opzionali ma se li compili, il sistema impara: nei prossimi preventivi simili, ti dirà "questi stampi li hai venduti in media a 1.18× il preventivo" — calibrazione automatica gratis.

---

## Modo 1 — Preventivo Manuale

Lo usi quando non hai file digitali (DXF/STEP) e devi inserire tutto a mano. È il modo più "vecchia scuola" ma sempre presente come fallback.

### Step 1 — Creazione

Da Dashboard o Sidebar → **Nuovo Preventivo** → tile **Manuale**.

Il wizard ti chiede:
- **Cliente** = scegli da elenco (autocompleta col nome o col numero cliente). Se il cliente non c'è ancora, lo crei prima in Clienti.
- **Categoria** = una delle 5-7 categorie del tuo gestionale (A, B, C…). Cambia solo la lettera nel codice.
- **Anno** = di default l'anno corrente.
- **Progressivo** = il numero del gestionale.
- **Tipo preventivo**: due opzioni:
  - **Singolo** = una sola parte. Codice parte = codice preventivo.
  - **Commessa** = N parti (es. 5 parti dello stesso preventivo). Le parti vengono numerate `_01`, `_02`, `_03`…
- **N. componenti** (solo se commessa) = quante parti vuoi creare subito.
- **Quantità di default** = la `qty` iniziale delle parti (es. 100 pezzi).

Clicchi "Crea" → il sistema crea il Quote + le N Part vuote.

### Step 2 — Editor

Adesso sei sulla pagina del preventivo. La struttura:

**Sidebar sinistra**: elenco delle parti del preventivo. Clicchi su una parte per editarla.

**Pannello principale**: dati della parte selezionata.

### I campi di una **Part** (parte)

| Campo | Cosa significa | Cosa tocca |
|---|---|---|
| Codice parte | Identificativo della parte (es. `240-26A_001_03`) | Sul PDF |
| Descrizione | Cosa è il pezzo (es. "Flangia di tenuta") | Sul PDF |
| Quantità | Pezzi da preventivare | Divisore per setup + base per costo totale |
| Peso finito (kg) | Peso del pezzo lavorato finito | Calcolo trattamenti (batch + spedizione) |
| Materiale | Da catalogo | Calcolo costo grezzo (volume × densità × €/kg) + spedizione |
| Dimensioni grezzo X/Y/Z (mm) | Bbox del materiale di partenza | Calcolo volume → peso → costo |
| Scrap factor | Spreco materiale (es. 1.15 = 15% in più di materiale di quello che servirebbe) | Moltiplicato al costo materiale |
| Materiale fornito dal cliente | Spunta "conto lavoro" | Azzera costo materiale + spedizione + cutting |
| Materiale da magazzino | Hai il materiale già in officina | Sostituisce shipping/cutting del fornitore con override globali |
| Margine % (override parte) | Sovrascrive il margine globale del preventivo per questa parte | Calcolo unit_price |
| Prezzo minimo parte | Soglia minima di unit_price | Se costo < minimo, usa minimo |

### Le **fasi di lavorazione** (ManufacturingPhase)

Ogni parte ha N fasi (ciascuna è uno step di lavorazione: tornitura, fresatura, EDM filo, trattamento termico, ecc.).

Per ogni fase compili:

| Campo | Cosa significa | Esempio |
|---|---|---|
| **Tipo** | Macro-categoria (interno, esterno, trattamento, ecc.) | "Lavorazione interna" |
| **Operazione** | Da catalogo: tornitura, fresatura, ecc. | "Fresatura 3 assi" |
| **Macchina** | Quale macchina lo fa | "Mori Seiki NL2500" |
| **Setup (ore)** | Ore di attrezzaggio macchina. Pagate UNA volta, divise per tutte le qty | 0.5 h |
| **Ciclo per pezzo (ore)** | Ore di lavorazione di **un singolo pezzo** | 0.25 h (15 min/pezzo) |
| **Costo fisso** | Eventuale costo fisso aggiuntivo per la fase | Es. costo di un'attrezzatura dedicata |
| **Costo variabile per pezzo** | Costo extra per pezzo (es. punte usurabili) | 1.50 €/pezzo |
| **Trattamento** (solo se tipo "trattamento esterno") | Da catalogo, con fornitore | "Tempra 50 HRC" |

**Formula della fase** (per pezzo):
```
setup_per_pezzo = setup_hours × tariffa_setup / qty
ciclo = cycle_hours × tariffa_lavoro
fisso = fixed_cost / qty
variabile = variable_cost (già per pezzo)

costo_fase_per_pezzo = setup_per_pezzo + ciclo + fisso + variabile
```

Le **tariffe** vengono dalla `Machine`:
- `setup_hourly_rate` = €/h per attrezzaggio (di solito uguale al lavoro).
- `hourly_rate` = €/h per la lavorazione.

Se non hai impostato `setup_hourly_rate`, usa `hourly_rate` (fallback).

### Materiali grezzi: come funziona la spedizione

Se 3 parti dello stesso preventivo hanno tutte materiale dal **fornitore A** con `shipping_cost = 30€`, il fornitore fa un solo viaggio. Il sistema divide i 30€ proporzionalmente al **peso grezzo** delle 3 parti:
- Parte 1, grezzo 1 kg → quota 30 × 1 / totale
- Parte 2, grezzo 5 kg → quota 30 × 5 / totale
- Parte 3, grezzo 0.5 kg → quota 30 × 0.5 / totale

**Totale spedizione = 30€** (1 solo viaggio per fornitore). Non vedi mai 90€!

### Trattamenti: soglia batch

I trattamenti termici (es. tempra) hanno una **soglia minima**:
- Sotto la soglia (es. batch di 5 kg, soglia 20 kg) → si paga il **forfait** del fornitore (es. 80€).
- Sopra la soglia → si paga `cost_per_kg × peso_batch`.

Il sistema raggruppa per `(treatment_id, material_id)`: se hai tempra su 3 parti in C45 + 2 parti in 1.2311, sono **due batch separati** (materiali diversi vanno in forni diversi).

Se nel preventivo manca il **peso finito** di una parte che ha un trattamento, il campo diventa rosso con avviso "compila il peso, serve per costo e spedizione del trattamento". Senza, il costo del trattamento resta 0.

### PDF, Invia, Completa

Quando hai finito:
- **PDF cliente** = versione pulita (nessun costo interno, niente margini esposti).
- **PDF interno** = versione completa con tutti i dettagli.
- **Invia per revisione** = passa a `inviato`, l'admin riceve notifica.
- L'admin apre il preventivo → automaticamente diventa `completato`, ricevi notifica.

---

## Modo 2 — Preventivo 2D DXF (Wire EDM)

Lo usi quando hai un **DXF del profilo da tagliare** (lavorazione a Wire EDM). Il sistema fa il grosso del lavoro per te.

### Step 1 — Creazione

Da **Nuovo Preventivo** → tile **2D**.

Wizard composto in 3 sotto-step:

**Step 1: Upload DXF**
Trascini o selezioni il file `.dxf`. Limite 50 MB. Il sistema fa il parser: estrae linee, archi, polilinee, spline. Ti mostra:
- Bbox globale (X × Y in mm)
- Numero profili identificati (chiusi e aperti)
- SVG di anteprima

**Step 2: Selezione profili**
Vedi tutti i profili rilevati come elenco con visualizzazione SVG. Clicchi su quelli che ti interessano (di solito i profili chiusi del pezzo). Ogni profilo selezionato contribuisce alla **lunghezza totale di taglio** (`cut_length_mm`).

**Step 3: Parametri**
Compili:
- **Cliente** + codice preventivo (come nel manuale).
- **Materiale** (da catalogo): il sistema usa la sua **famiglia** (acciaio_inox, alluminio, …) per il lookup velocità EDM.
- **Altezza pezzo (mm)** = lo spessore della lamiera che andrai a tagliare. Es. 5 mm.
- **Ciclo di taglio** = una pre-configurazione passate (es. "Standard 1+3" = 1 rough + 3 finish). Da Impostazioni → Wire EDM → Cicli di taglio.
- **Modalità foratura**:
  - **Pre-fori** = i pierce vengono fatti su un'altra macchina (foratrice EDM). Il sistema crea una fase "Foratura" aggiuntiva con tempo calcolato.
  - **Pierce diretto in EDM** = il filo EDM fa il pre-foro lui. Più lento ma una macchina sola.
- **Numero pierce** = quante fori di partenza servono (1 per ogni profilo chiuso, di solito).
- **Diametro foro** (solo per modalità pre-fori) = Ø elettrodo che usi.

Clicchi "Crea Preventivo" → si crea Quote (1 parte), 1 fase Wire EDM con tutti i parametri popolati.

### Cosa succede dietro le quinte

Il cost engine guarda:
- `cut_length_mm` (mm) = lunghezza totale dei profili selezionati
- `cut_height_mm` (mm) = altezza pezzo che hai inserito
- `material.family` = famiglia del materiale (es. "acciaio_inox")
- `cutting_cycle.passes` = sequenza di passate del ciclo scelto

E cerca nella tabella **EdmCutSpeed** (Impostazioni → Wire EDM → Velocità di taglio) la riga giusta per `(family, range_altezza)`. Trova la velocità in **mm/min** del filo.

**Calcolo ore EDM**:
```
per ogni passata del ciclo:
  factor = rough_factor / semi_factor / finish_factor (Impostazioni → Wire EDM → Parametri globali)
  speed_pass = speed_base × factor
  tempo_passata = cut_length / speed_pass

tempo_totale = somma tempi passate + n_pierce × tempo_pierce
ore = tempo_totale / 60
```

Le ore calcolate finiscono in `cycle_hours_per_part` della fase. Costo = ore × tariffa macchina EDM. Tutto automatico.

### Editor

Una volta creato, l'editor è quello del preventivo manuale: vedi 1 parte con 1-2 fasi (EDM + eventuale Foratura). Puoi modificare a mano i parametri, aggiungere fasi extra, ecc. Le fasi Wire EDM hanno 4 campi extra evidenziati: `cut_length_mm`, `cut_height_mm`, `cutting_cycle_id`, `n_pierce`. Il `cycle_hours_per_part` è read-only quando l'auto-calc è attivo (c'è un bottone "Modifica manualmente" se vuoi forzare).

---

## Modo 3 — Preventivo Stampi (la guida completa)

> ⛔ **MODULO RIMOSSO (2026-07-14) — non disponibile.** Il Preventivatore
> Stampi è stato rimosso dal software e verrà **riscritto da zero**. Le
> istruzioni di questa sezione descrivono il **vecchio** modulo e restano
> qui solo come riferimento per la ricostruzione: **oggi in MechQuote esistono
> solo il Modo 1 (Manuale) e il Modo 2 (2D DXF)**. Vedi
> `MECHQUOTE_LISTA_LAVORI.md` → "MODULO STAMPI RIMOSSO".

Questo è il modo più articolato. Lo usi per preventivare uno **stampo per lamiera**, sia a **passo** (progressivo, con N stazioni) sia a **blocco** (una singola operazione).

### Quando passo, quando blocco?

| Tipologia | Cos'è | Esempio |
|---|---|---|
| **Stampo a passo** (progressivo) | La striscia di lamiera avanza, ad ogni step una nuova operazione | Stampo che tranciona + piega + foracchia + taglia in un colpo solo |
| **Stampo a blocco** | Una sola operazione, un solo "ciclo" | Stampo da tranciatura semplice di un cerchio |

### Step 1 — Composizione codice

Da **Nuovo Preventivo** → tile **Stampo**.

Step 1 è uguale al manuale (cliente, categoria, anno, progressivo). In più scegli la **tipologia** (Passo o Blocco). Clicchi "Continua".

### Step 2 — Geometria, template, feature

Qui è dove c'è tutta la "carne": una pagina ricca con form a sinistra e render live + suggerimenti a destra.

#### Sezione **Geometria pezzo**

##### Carica DXF (opzionale)
Se hai il DXF del pezzo da produrre, lo trascini qui. Il sistema:
- Misura il bbox X × Y del pezzo.
- Somma le lunghezze dei profili → **perimetro pezzo** (driver chiave per EDM).
- Mostra l'anteprima SVG.

Se NON hai DXF, compili manualmente.

##### I campi geometria

| Campo | Cosa significa | Esempio |
|---|---|---|
| **Pezzo X (mm)** | Lunghezza massima del pezzo | 80 mm |
| **Pezzo Y (mm)** | Larghezza massima del pezzo | 40 mm |
| **Spessore lamiera (mm)** | Spessore del materiale che lavori | 2 mm |
| **Perimetro pezzo (mm)** | Lunghezza del profilo del pezzo (giro completo) | 320 mm (auto-da DXF) |
| **Complessità profilo** | Se non hai DXF, dimmi quanto è articolato il pezzo | "Sagoma media" = 1.3 |

Il **perimetro pezzo** è il driver più importante per il calcolo delle ore EDM filo (vedi sotto). Se non lo hai dal DXF, il sistema lo stima come `2 × (X + Y) × complessità`:
- **Rettangolare puro** (1.0): es. 2×(80+40)×1.0 = 240 mm
- **Quasi rettangolare** (1.2): 2×(80+40)×1.2 = 288 mm (qualche raccordo, piccoli intagli)
- **Sagoma media** (1.3): 312 mm (forme curve mediamente articolate)
- **Sagoma complessa** (1.6): 384 mm (molti contorni, intagli profondi)
- **Molto articolato** (1.9): 456 mm (sagomato come una stella, contorni intricati)

#### Sezione **Striscia & castello**

Qui dici al sistema **quanto è grande lo stampo** in pianta.

##### Se hai scelto Passo
| Campo | Cosa significa | Esempio |
|---|---|---|
| **N. stazioni** | Quanti step di lavorazione (= quante "stazioni" sulla striscia) | 3 |
| **Passo (mm)** | Distanza tra una stazione e l'altra | 100 mm |
| **Offset Y striscia (mm)** | Margine sopra/sotto al pezzo nella striscia | 10 mm |

##### Se hai scelto Blocco
| Campo | Cosa significa | Esempio |
|---|---|---|
| **Offset striscia (mm)** | Margine attorno al pezzo | 50 mm |

##### Per entrambi: **Offset castello X/Y**

| Campo | Cosa significa | Esempio |
|---|---|---|
| **Offset castello X (mm)** | Quanto materiale c'è ai lati della striscia, dove vanno i fissaggi (vite + spina) | 80 mm |
| **Offset castello Y (mm)** | Idem in verticale | 80 mm |

I default sono in Impostazioni → Stampi → Tariffe (card 9-10), tipicamente 80 mm.

#### Le dimensioni del **castello** sono calcolate automaticamente

Il sistema calcola la **striscia** e il **castello** così:

**Passo**:
```
strip_X = pitch × n_stazioni
strip_Y = pezzo_Y + offset_Y_striscia
castello_X = strip_X + 2 × offset_castello_X
castello_Y = strip_Y + 2 × offset_castello_Y
```

Esempio: pezzo 80×40, passo 100mm, 3 stazioni, offset Y 10, offset castello 80×80:
- strip_X = 100 × 3 = 300 mm
- strip_Y = 40 + 10 = 50 mm
- castello = (300 + 160) × (50 + 160) = **460 × 210 mm** (≈ 9.7 dm²)

**Blocco**:
```
strip_X = pezzo_X + offset_striscia
strip_Y = pezzo_Y + offset_striscia
castello come sopra
```

A destra nella pagina vedi il **render live del castello in pianta** + lo **spaccato verticale** con le 5 piastre. Cambi un numero, si aggiorna subito.

#### Sezione **Template**

Dropdown con 5 template di partenza (configurabili in Impostazioni → Stampi → Template):
- **Tranciatura semplice a blocco**
- **Tranciatura + piega a blocco**
- **Progressivo 3-4 stazioni**
- **Progressivo complesso 5+ stazioni**
- **Tranciatura fine (precisione)**

Scegliere un template **pre-carica** tutto il resto: piastre, materiali default, spessori, BoM normalizzati di partenza, suggerimento difficoltà, suggerimento n. pieghe/punzoni. Risparmi 10 minuti di compilazione manuale.

#### Sezione **Difficoltà & feature**

| Campo | Cosa significa | Cosa tocca |
|---|---|---|
| **Difficoltà** | Base / Media / Alta | Ore di progettazione CAD + forfait montaggio |
| **N. pieghe semplici/medie/complesse** | Conta delle pieghe per fascia | Ore design + (parzialmente) metri EDM |
| **N. punzoni semplici/medi/complessi** | Conta dei punzoni per fascia | Ore design + (parzialmente) metri EDM extra (per punzoni sagomati) |

**Difficoltà** è una macro-classificazione che indica quanto è complicato lo stampo nel complesso. Tocca:
- **Ore CAD/progettazione** (vedi Impostazioni Stampi card 7): es. base = 8h, media = 16h, alta = 32h.
- **Forfait montaggio/collaudo** (card 8): es. base = 300€, media = 600€, alta = 1200€.

**Feature** = pieghe e punzoni. Per ogni fascia (semplice/medio/complesso) inserisci il conteggio:
- Le **pieghe** servono al sistema per calcolare quante ore CAD aggiuntive dare al progettista (es. +0.4 h per piega).
- I **punzoni medi/complessi** contribuiscono ai **metri di EDM filo** dei porta_punzoni (i punzoni sagomati richiedono taglio del filo per le loro sagome).

#### Sezione **Stampi simili** (a destra)

Mentre compili, una card a destra chiamata **"Stampi simili (N)"** si aggiorna in tempo reale. Mostra **fino a 5 preventivi storici** che hanno caratteristiche simili (stesso subtype, area castello ±30%, pieghe ±2, punzoni ±2). Per ognuno vedi codice + cliente + prezzo preventivo.

In più, se i preventivi storici hanno la **chiusura commessa compilata** (sold_price), vedi anche:

> "3 stampi simili venduti in media a **1.18×** il preventivo (3 con prezzo finale tracciato)"

Così sai se stai stimando in linea o se di solito i tuoi stampi vengono venduti più alti del preventivato.

#### Submit

Clicchi "Crea preventivo →" in fondo. Il sistema:
1. Crea il `Quote` con `quote_type='die'`.
2. Salva la `DieSpec` con tutti i parametri geometrici e feature.
3. Se hai scelto un template:
   - Crea le **piastre** come Part separate (cappello, porta_punzoni, premilamiera, matrice, base) con materiali, spessori, snapshot produttività dal template.
   - Crea i **normalizzati di default** (colonne, boccole, molle, viti) usando le formule scalabili del template.
4. Ricalcola tutti i livelli L1-L5.

Vieni reindirizzato all'editor del preventivo appena creato.

---

### L'editor preventivo stampi — 4 tab

L'editor è organizzato in **4 tab** in alto:

#### Tab 1 — **Geometria**

Tutti i parametri che hai compilato nel wizard. Puoi modificarli qui:
- Difficoltà
- Consegna (gg lavorativi) — solo informativo, va sul PDF
- Pezzo X/Y/Spessore
- Perimetro pezzo + Complessità profilo
- Feature (6 input)
- Note tecniche + Extras (voce manuale: descrizione + importo)

Cambiare la difficoltà o aggiungere feature → l'**anteprima L4** (Accessori) si aggiorna live nel tab Costi.

#### Tab 2 — **Piastre (N)**

Tabella delle piastre del castello. Ogni riga:

| Colonna | Cosa | Modificabile? |
|---|---|---|
| Ruolo | cappello / porta_punzoni / premilamiera / matrice / base | No (dipende dal template) |
| X × Y × Z (mm) | Dimensioni. X e Y vengono dal castello auto-compilato. Z è lo spessore | Solo Z modificabile dall'editor |
| Materiale | Da catalogo (es. C45, 1.2842, 1.2311) | Sì |
| Ore mecc. | Stima ore (setup + Σ area×h/dm²×n_facce + station_bonus) — calcolato live | No (è un display) |
| Costo | Costo finale della piastra (materiale grezzo + spedizione + trattamento se presente) | No (è un display) |

Le **ore meccaniche** sono il driver del costo L3-mech. Si calcolano automaticamente. Se vedi un numero che non ti torna, controlla:
- Le **costanti per ruolo** nel template (Impostazioni → Stampi → Template).
- Le **produttività officina** (Impostazioni → Stampi → Tariffe → card 12).
- Le **fasce piastra** (Impostazioni → Stampi → Fasce piastra).

#### Tab 3 — **Normalizzati (M)**

Tabella dei componenti commerciali (colonne guidate, boccole, molle, viti, spine, tendispinotti…). Per ogni riga:

| Colonna | Cosa |
|---|---|
| Descrizione | Es. "Colonna guidata Ø32" |
| Fornitore | Da catalogo (Normalized Suppliers) |
| Qty | Numero pezzi |
| €/u | Prezzo unitario |
| Totale | Qty × €/u |

Il sistema **aggiunge automaticamente la spedizione del fornitore** (1 viaggio per fornitore, anche se hai 10 voci dello stesso). Es. se Misumi ha `shipping_cost=25€`, paghi 25€ totali a Misumi anche se hai 5 componenti diversi loro.

Bottone "+ Aggiungi" per aggiungere un normalizzato a mano. "X" per cancellare.

I normalizzati di default (dal template) sono pre-popolati e scalano automaticamente con `n_stazioni` (es. "Molle: 2 × n_stazioni + 4"). Se cambi `n_stazioni` nel wizard, la qty cambia. Nell'editor sono modificabili come qualsiasi altra riga.

#### Tab 4 — **Costi**

Il riepilogo finale: i 7 livelli L1-L7 in tabella, con il prezzo finale evidenziato in fondo.

```
L1 Materiale piastre          € 580,00   [↗ override matita]
L2 Normalizzati + spedizione  € 240,00   [↗ override matita]
L3 Lavorazione stampo         € 1.305,00 [↗ override matita]
   ↳ di cui lavorazione meccanica piastre  € 810,00
   ↳ di cui EDM filo (matrice + estrattore) € 495,00
L4 Accessori                  € 1.450,00 [↗ override matita]
L5 Costo industriale          € 3.575,00
L6 Margine (30%)              + € 1.072,50
L7 Sconto (5%)                − € 232,38
─────────────────────────────────────────
Prezzo finale                 € 4.415,12
```

**Override matita** (icona matita): se uno dei 4 valori non ti convince, clicchi la matita accanto, inserisci il numero "vero" e premi salva. Il sistema usa il tuo valore al posto di quello calcolato per L5. Il numero calcolato resta visibile in piccolo. Per togliere l'override, clicca la X.

In fondo trovi anche:
- **Margine & sconto**: 2 input editabili.
- **Stampi simili stats**: se ci sono preventivi storici simili con sold_price, vedi "3 stampi simili venduti in media a 1.18× il preventivo (suggerimento prezzo finale: € 4.213)". Usalo come sanity check.
- **Chiusura commessa** (solo se status=completato): 2 input "Prezzo venduto" e "Costo consuntivo".

### Cos'è dietro i 7 livelli — formule semplici

Ti spiego cosa fa il sistema dietro le quinte. Non devi sapere niente di queste formule per usare il software, ma se vuoi capire perché un numero è quello che è, ecco.

#### **L1 — Materiale piastre**
Per ogni piastra: `peso = X × Y × Z × densità_materiale`. Costo = `peso × €/kg × scrap_factor`. Aggiungo spedizione del fornitore materiale (proporzionale al peso grezzo) e cutting cost se previsto.

Se la piastra ha un trattamento (es. tempra su matrice), si aggiunge il costo trattamento (con soglia batch).

Sommo i costi di tutte le piastre del castello.

#### **L2 — Normalizzati + spedizione**
Σ(`qty × unit_price`) per ogni voce + Σ(`shipping_cost`) **una sola volta per fornitore**.

#### **L3 — Lavorazione stampo** (la voce più grossa, ~50% del totale)

Due sottocomponenti:

**L3.mech — Lavorazione meccanica piastre**: per ogni piastra calcolo le ore separatamente per operazione:
```
ore_setup    = template.setup_hours_fixed                  (es. matrice = 0.5 h)
ore_mill     = area_dm² × template.n_milled_faces × milling_h_per_dm²
                                                            (es. 12 × 2 × 0.15 = 3.6 h)
ore_grind    = area_dm² × template.n_ground_faces × grinding_h_per_dm²
ore_drill    = area_dm² × template.n_drilled_faces × drilling_h_per_dm²
ore_station  = n_stazioni × template.station_bonus_hours    (matrice/porta_punzoni)
```

Le ore vanno moltiplicate per la **fascia piastra** (es. piastre tra 40-65 dm² → × 1.15). Poi ogni ora ha la SUA tariffa (fresa, rettifica, foratura, EDM filo).

**L3.edm — EDM filo per matrice e porta_punzoni**: il driver è il **perimetro pezzo**:
```
lunghezza_EDM_matrice = perimetro × n_stazioni
lunghezza_EDM_porta_punzoni = perimetro × n_stazioni × edm_extractor_factor (default 0.6)
                              + perimetro × n_punzoni_med_o_compl × edm_punch_factor (default 0.3)
```

Poi: `ore_EDM = lunghezza / velocità_lookup(materiale, spessore_piastra, ciclo)`. Velocità prese dalla tabella Wire EDM esistente.

Costo EDM = ore × tariffa_edm_die.

**L3 totale = L3.mech + L3.edm**.

#### **L4 — Accessori**
```
ore_design = ore_design[difficoltà] 
           + n_pieghe_totali × design_h_per_bend (0.4 di default)
           + n_punzoni_totali × design_h_per_punch (0.3 di default)
costo_design = ore_design × design_hourly_rate
montaggio = forfait_montaggio[difficoltà]
extras = manuale (campo extras_amount)

L4 = costo_design + montaggio + extras
```

#### **L5 — Costo industriale**
`L5 = L1 + L2 + L3 + L4`, con override matita che sostituiscono i valori calcolati.

#### **L6 / L7 — Markup e sconto**
`prezzo_lordo = L5 × (1 + margine/100)`  
`prezzo_finale = prezzo_lordo × (1 - sconto/100)`

---

### Workflow stampo: bozza → inviato → completato → chiusura

1. **Bozza**: lavori sul preventivo. Modifichi geometria, piastre, normalizzati, costi.
2. **Invia per revisione**: passa all'admin. Tu non puoi più modificarlo.
3. **Completato**: l'admin l'apre, automaticamente diventa completato.
4. **Chiusura commessa** (post-vendita): apri il preventivo, vai al tab Costi, compila:
   - **Prezzo venduto** (post-trattativa col cliente)
   - **Costo consuntivo** (a fine commessa, quando hai i numeri veri)
   
   Questi 2 numeri vengono usati dal sistema per i prossimi preventivi simili. Più ne compili, più la "calibrazione automatica" diventa precisa.

### Versioning rev2, rev3...

Se il cliente ti chiede modifiche, **NON modifichi il preventivo originale** (che magari è già stato inviato). Usi **Clone**:
- Bottone "Clona come revisione" → crea un nuovo preventivo con suffix `_rev2` (poi `_rev3`, ecc.) sul codice.
- Copia spec + piastre + normalizzati + DXF.
- Status reset a bozza.

Lavori sulla revisione senza toccare l'originale.

---

## Impostazioni — dove sta cosa

L'app è piena di parametri. Ti faccio una mappa per orientarti.

### Impostazioni → Catalogo

Le anagrafiche condivise da tutti i preventivi:

| Voce | Cosa |
|---|---|
| **Materiali** | Acciai e altri (C45, 1.2311, 1.2842, Inox…). Per ognuno: densità, €/kg, scrap_factor, supplier, famiglia |
| **Fornitori materiali** | Chi vende il grezzo. Include shipping_cost + cutting_cost_per_part |
| **Macchine** | Le tue macchine: fresa, rettifica, EDM, ecc. Con hourly_rate + setup_hourly_rate + machine_type |
| **Trattamenti** | Tempra, nitrurazione, ecc. Con soglia minima, cost_per_kg, cost_per_dm³, fornitore |
| **Fornitori trattamenti** | Chi fa lavorazioni esterne |
| **Lavorazioni** | Catalogo operazioni (fresatura, tornitura, ecc.) |
| **Template fasi** | Sequenze riutilizzabili di fasi (es. "Tornitura + rettifica + tempra" applicabile a più parti) |
| **Categorie preventivo** | Le lettere A-G del codice |
| **Fornitori normalizzati** | Misumi, Bossard, ecc. Con shipping_cost |

### Impostazioni → Stampi (tutto quello che serve al modulo Stampi)

#### Tab **Tariffe & costi** (12 card)

| Card | Cosa |
|---|---|
| **1. Tariffe orarie** | Fresatura, Rettifica, EDM filo, EDM tuffo. Puoi anche **agganciare una Machine** dal dropdown: in quel caso la tariffa effettiva = `machine.hourly_rate`. Se cambi €/h della macchina in Catalogo → Macchine, anche i preventivi stampi futuri usano il nuovo numero |
| **7. Progettazione** | Ore CAD per difficoltà (base 8h, media 16h, alta 32h) + tariffa €/h + bonus h per piega + bonus h per punzone |
| **8. Forfait montaggio/collaudo** | Importo fisso per difficoltà |
| **9-10. Margine + offset castello default** | Margine base, offset castello X/Y di default nel wizard |
| **11. Driver EDM filo piastre stampo** | Ciclo EDM default (riusato dal modulo Wire EDM), factor estrattore (0.6 = la sagoma dell'estrattore è 60% del perimetro pezzo), factor punzoni (0.3 = quanto i punzoni sagomati pesano in EDM) |
| **12. Produttività officina piastre stampo** | h/dm² per fresatura/rettifica/foratura. Questi numeri li tari sulla TUA officina osservando 5-10 stampi reali |

#### Tab **Fasce piastra**

Tabella con label/area_min/area_max/coefficient. Esempio default:

| Fascia | Area min | Area max | Coeff |
|---|---|---|---|
| S | 0 dm² | 15 dm² | 1.00 |
| M | 15 | 40 | 1.05 |
| L | 40 | 65 | 1.15 |
| XL | 65 | ∞ | 1.30 |

Quando il sistema calcola le ore meccaniche di una piastra, guarda l'area, trova la fascia, moltiplica le ore per il coefficient. Serve per gestire piastre più grandi che richiedono gru, manipolazione extra, ecc.

#### Tab **Template stampi**

CRUD dei 5 template default + tuoi custom. Per ogni template:
- Nome, descrizione, tipologia (passo/blocco)
- Suggerimento n. stazioni, n. pieghe/punzoni di default, difficoltà di default
- **Piastre** (5 standard: cappello, porta_punzoni, premilamiera, matrice, base): spessore default, materiale default, trattamento default, + 5 parametri produttività per ruolo (setup_h, n_milled, n_ground, n_drilled, station_bonus)
- **Normalizzati di default** (BoM scalabile): per ognuno descrizione, fornitore, formula quantità, prezzo unitario default

Le **formule quantità** sono mini-espressioni valutate sul preventivo. Variabili disponibili:
- `n_stations` (numero stazioni)
- `n_bends_total` (pieghe totali)
- `n_punches_total` (punzoni totali)
- `area_castello_dm2`
- `castle_x_mm`, `castle_y_mm`
- `bbox_x_mm`, `bbox_y_mm`

Esempi:
- `4` = sempre 4 pezzi (es. 4 colonne guidate)
- `n_stations * 2 + 4` = 2 molle per stazione + 4 base (es. progressivo 3 stazioni → 10 molle)
- `4 if area_castello_dm2 < 30 else 6` = 4 viti se castello piccolo, 6 se grande

### Impostazioni → Azienda

Dati azienda (ragione sociale, indirizzo, ecc.) + 4 default operativi:
- Margine di default (%)
- Prezzo minimo per parte (€)
- Trasporto (€)
- Packaging (€)

### Impostazioni → Wire EDM

Riusato anche dal modulo Stampi.

| Tab | Cosa |
|---|---|
| **Velocità di taglio** | Per ogni famiglia materiale × range altezza → velocità mm/min. Tabella che il sistema interroga durante il calcolo EDM (sia 2D che Stampi) |
| **Cicli di taglio** | Pre-configurazioni di passate (rough/semi/finish). Es. "Standard 1+3", "Alta precisione 1+1+3" |
| **Tempi foratura** | Velocità foratura per famiglia × diametro elettrodo |
| **Parametri globali** | Pierce time di default, factor passate, ecc. |

### Impostazioni → Sistema

- **Utenti** + **Ruoli e permessi**
- **Backup & restore** (esporta tutto come JSON)

---

## Trucchi e raccomandazioni finali

### Quando i numeri non tornano nel preventivo stampi

1. **L1 troppo alto** → controlla `scrap_factor` del materiale (se 1.40 vuol dire +40% di spreco, magari è troppo).
2. **L3 troppo basso** → forse le ore meccaniche delle piastre non sono tarate. Vai in Impostazioni → Stampi → Tariffe card 12 e aumenta `milling_h_per_dm2`.
3. **L3 EDM = 0** → manca la **famiglia** sul materiale matrice (controlla in Catalogo → Materiali). Senza famiglia, il lookup velocità EDM fallisce.
4. **L4 piattissimo** → la difficoltà è "base" ma lo stampo è complicato → cambia in "medio" o "alto".

### Quando usare l'**override matita**

Quando il sistema dà un numero che TU sai essere sbagliato per quel preventivo specifico:
- Stampo con materiale speciale che il sistema non conosce.
- Lavorazione anomala (es. matrice da fare in più passate per geometria difficile).
- Un fornitore ti ha fatto un'offerta speciale che il sistema non riflette.

NON usare l'override come scorciatoia abituale: se ogni volta forzi i numeri, il sistema non ti serve. Tarando i parametri (template + settings) elimini il bisogno di override.

### Come tarare il sistema sui TUOI numeri

1. **Fai 5 stampi reali** con il preventivatore. Annota: preventivato vs venduto vs consuntivo.
2. **Compila la chiusura commessa** su ognuno (sold_price + actual_cost).
3. Dopo 5-10 stampi, guarda il ratio medio:
   - Se vendi sempre a 1.30× il preventivo → il tuo margine è basso o le formule sottostimano. Aumenta tariffe orarie o margine default.
   - Se i consuntivi sono 1.20× il preventivo → stai sottostimando le ore. Aumenta h/dm² o riduci la produttività delle macchine.
4. **Aggiusta i parametri** in Impostazioni → Stampi una sola volta. Da quel momento, tutti i preventivi successivi sono più precisi.

### Workflow consigliato per un nuovo cliente

1. Crea il **cliente** in Clienti.
2. Apri **Nuovo Preventivo → Stampo**.
3. Compila Step 1 (codice).
4. Step 2: carica DXF del pezzo se disponibile (= bbox e perimetro automatici).
5. Scegli un **template** appropriato (Progressivo 3-4 stazioni se è un progressivo medio).
6. Aggiusta solo i numeri che differiscono dal template (es. cambi materiale matrice se serve).
7. Guarda i **Stampi simili** a destra: se vedi qualcosa che assomiglia tantissimo a quello che stai facendo, magari clonalo invece di partire da zero.
8. Clicca "Crea preventivo".
9. **Tab Costi**: guarda se il totale è ragionevole. Usa l'override solo per le voci che ti convincono poco.
10. **PDF cliente** → genera, controlla, invialo.
11. **Invia per revisione** quando sei sicuro.

### Backup

Vai in **Impostazioni → Sistema → Backup**, clicca "Esporta tutto". Scarica un JSON con tutto il tuo database (clienti, materiali, preventivi, settings, ecc.). Salvalo in un posto sicuro (drive personale, NAS) **almeno una volta a settimana**. Se il PC del server si rompe, da quel JSON puoi ricostruire tutto.

---

## Hai domande?

Se incontri un campo che non capisci o un numero che non quadra, **controlla questa guida** prima di chiedere. Per i casi specifici della TUA officina (tarature, casi limite, decisioni di prodotto), parla con chi gestisce il sistema.

Buon preventivare!
