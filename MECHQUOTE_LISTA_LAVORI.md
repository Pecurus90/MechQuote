# MechQuote — Lista lavori

> Questo è il piano di battaglia. Raccoglie i problemi emersi dalle cinque
> ricognizioni, **filtrati** (il rumore è stato tolto) e **ordinati per
> priorità**. Ogni voce è un lavoro delimitato: si affronta uno alla volta,
> con verifica.
>
> I lavori sono divisi in tre blocchi da **due linee**:
>
> - **PRIMA DELLA LINEA 1** — da completare prima di inserire dati reali sul
>   server.
> - **PRIMA DELLA LINEA 2** — da completare prima di far usare MechQuote a
>   più persone insieme.
> - **DOPO** — manutenzione e miglioramenti, senza fretta.
>
> Le stime di tempo sono quelle indicate da Claude Code: indicative.

---

## ░░░ BLOCCO A — PRIMA DI INSERIRE DATI REALI SUL SERVER ░░░

*Questi sono il minimo indispensabile. Finché non sono fatti, MechQuote non
va usato con clienti e preventivi veri.*

### A1 — Sistemare il backup automatico 🔴 IL PIÙ IMPORTANTE
Esiste già uno script di backup, ma è **difettoso**: copia solo il file
principale del database e ignora il file `-wal`, dove vivono le ultime
scritture. Risultato: il backup può essere **incompleto senza dare alcun
errore** — un'illusione di sicurezza.
**Cosa fare:** sostituire la copia semplice con il comando corretto
(`sqlite3 .backup`, oppure un `wal_checkpoint` prima della copia). Inoltre: le
copie devono finire su un **disco diverso** da quello del server, e va tenuto
qualche giorno di storico (non solo l'ultima copia).
**Perché prima di tutto:** è l'unico problema che fa *perdere il lavoro*, non
perdere tempo. *Stima: ~30 min. Da fare con cura — il backup ha già causato
incidenti (9-10 maggio).*

### A2 — Diagnosticare il crash del modulo stampi sul server 🔴
Aprire `C:\MechQuote\logs\uvicorn.log` sul server, cercare l'ultimo errore
registrato quando lo stampo crasha. Il messaggio dirà quale delle 5 piste è
quella vera (Chromium mancante, cartella di avvio sbagliata, tabelle non
create...). Solo *dopo* la diagnosi si decide la correzione.
**Perché qui:** è il bug originale da cui è partito tutto; e se la causa è
"Chromium mancante" o "cartella sbagliata", riguarda l'installazione del
server, che va sistemata prima di usarlo. *Stima diagnosi: ~5 min.*

### A3 — Configurazione sicura del server (file `.env`) 🔴
Sul server va creato il file di configurazione `.env` con una **chiave
segreta forte** (non quella di esempio). Chi conosce quella chiave può
impersonare qualunque utente, admin compreso.
*Stima: ~15 min.*

### A4 — Mettere i paletti su margine e sconto 🔴
Oggi MechQuote accetta un margine fortemente negativo o uno sconto sopra il
100%, e calcola tranquillamente un **prezzo negativo** che arriva fino al PDF
del cliente. Basta un errore di battitura (`-220` invece di `20`).
**Cosa fare:** aggiungere dei limiti (il margine non scende sotto una soglia,
lo sconto non supera 100%).
**Perché qui:** tantissimo rischio, pochissimo lavoro — e protegge la
correttezza dei prezzi fin dal primo preventivo reale. *Stima: ~10 min.*

### A5 — Aggiungere `busy_timeout` al database 🔴
Manca un'impostazione (una riga) che dice al database di **aspettare** invece
di fallire quando è occupato. Senza, due salvataggi contemporanei causano un
errore tecnico e una perdita di modifiche.
**Perché qui:** una riga di codice che evita perdite di dati quotidiane non
appena MechQuote viene usato in più persone. *Stima: ~5 min.*

### A6 — Aggiornare `python-jose` e le librerie del login 🔴
La libreria che "timbra" i token di login ha un difetto noto che, in certe
condizioni, permette di fabbricare token falsi. Si risolve aggiornandola
(insieme ad altre librerie con difetti minori). Da riverificare il login dopo
l'aggiornamento.
*Stima: mezza giornata, incluso il ricontrollo del login.*

### A7 — Verificare e cambiare la password dell'utente admin sul server 🔴
Lo script di creazione del primo admin (descritto nel CLAUDE.md) imposta una
password di default debole: la parola `admin`. Va bene sul PC di sviluppo, è
una **falla grave** sul server: chiunque provi "admin/admin" entra come
amministratore e vede tutti i dati aziendali — annullando tutta la sicurezza
(bcrypt, permessi).
**Cosa fare:** verificare che password ha oggi l'admin sul server; se è
quella di default o un'altra banale, cambiarla con una forte. Verificare
anche che eventuali altri utenti già creati non abbiano password banali.
**Perché qui:** è una porta aperta. Va chiusa prima di mettere dati veri.
*Stima: pochi minuti.*

---

## ═══ LINEA 1 — qui si possono inserire i primi dati reali ═══

---

## ░░░ BLOCCO B — PRIMA DELL'USO DA PARTE DI PIÙ PERSONE ░░░

*MechQuote nasce per più utenti. Questi lavori rendono quella promessa vera.*

### B1 — Gestire le modifiche in contemporanea sui preventivi 🔴
Oggi, se due persone modificano lo stesso preventivo, l'ultimo che salva
**cancella in silenzio** il lavoro dell'altro. Va aggiunta una protezione che
almeno **avvisa** ("attenzione, qualcuno ha modificato dopo di te").
**Da decidere con l'utente:** quante persone useranno davvero MechQuote
insieme, e quanto spesso capiterà che lavorino sullo stesso preventivo. La
risposta determina quanto è urgente. *Stima: media.*

### B2 — Riallineare le due "calcolatrici" dei prezzi 🔴
L'anteprima a schermo e il calcolo vero del server divergono in più punti
(spedizione materiale, "peso a zero", trattamenti speciali degli stampi, il
"NaN €" che a volte appare). L'utente vede un prezzo, salva, e il numero
cambia. Vanno corretti i punti di divergenza perché l'anteprima sia
affidabile. *Stima: media.*

**Stato avanzamento (B2)**:
- ✅ **#2** — Costo trattamento a 0 quando manca il peso (fatto).
- ✅ **#3** — Fallback densità e costo/kg mancanti → 0 invece di "NaN €" (fatto).
- ✅ **#6** — `calcQuoteTotal` ora gestisce anche i preventivi stampo +
  rimossa funzione morta `calcShippingShare` (fatto).
- ⏳ **#1** — Trattamenti calcolati a volume (€/dm³): l'anteprima non li
  gestisce ancora — **in corso**.
- ⏸ **#4** — Anteprima spedizione "stantia" tra una modifica e la
  successiva in preventivi commessa con stesso fornitore (da fare; richiede
  decisione di prodotto sulla strategia: replicare logica frontend, accettare
  stantitezza con avviso, o endpoint preview server-side).
- ⏸ **#5** — Arrotondamento "banker's" del backend vs "half-away" del
  frontend: differenze massime di 1 centesimo (da fare; richiede decisione
  contabile dell'azienda).
- ⏸ **#7** — **Materiale da magazzino in commessa**: la spedizione da
  magazzino è divisa diversamente tra backend e frontend (il backend
  divide per il numero di parti da magazzino, il frontend no). In un
  preventivo commessa con più parti da magazzino l'anteprima mostra la
  spedizione **raddoppiata** (o moltiplicata per il numero di parti).
  Trovata nella ricognizione del motore manuale. Da allineare il frontend
  al backend.
- ⏸ **#8** — **Doppio arrotondamento di `total_price`**: `unit_price`
  viene arrotondato a 2 decimali e poi rimoltiplicato per la quantità.
  Su preventivi con quantità alte accumula uno scarto fino a qualche euro
  sul prezzo finale. **Presente in modo identico in backend e frontend**:
  non è una divergenza ma un errore di calcolo da correggere in entrambi
  (formula corretta: arrotondare `total_price` direttamente dal
  `base × (1+margine) × qty`, senza passare per `unit_price` già
  arrotondato).

**Nota collegata (fuori da B2, da correggere nel backend)**:
**Pezzi tondi + trattamento a volume (€/dm³)** — confermato dalla
ricognizione: il backend calcola il volume come `raw_x × raw_y × raw_z`
anche per i pezzi cilindrici, producendo 0 (perché raw_x/raw_y sono NULL
sui tondi). I tondi vengono prezzati a 0 € sul trattamento. Già tracciato
nella sezione "Decisioni di prodotto → P1" come parte della discussione
sulla modellazione trattamenti/rivestimenti. Da correggere nel backend
indipendentemente da P1: la formula del cilindro esiste già in
`_raw_weight_kg` e `_compute_material_cost`, va replicata nei due punti
del ramo trattamento €/dm³ (`calculation.py:302-306` e `:412-415`).

**Voci emerse dalla ricognizione del wizard 2D (creazione preventivi
DXF)**: il 2D dopo la creazione passa per lo stesso motore del manuale,
quindi eredita tutti i bug B2-#1..#8 sopra. In più ha 2 problemi propri:

- ⏸ **#9** — **Unità DXF non convertite**: se un disegno DXF è in pollici
  (o altra unità diversa dai mm), MechQuote non se ne accorge e tratta
  le misure come millimetri → il prezzo del taglio risulta **circa 25
  volte sbagliato** (fattore di conversione pollici→mm = 25,4). Il file
  DXF contiene già il dato dell'unità (`$INSUNITS`) e il parser lo legge
  (`backend/app/services/dxf_parser.py:254-259`), ma oggi emette solo un
  *warning testuale* senza convertire. La correzione è far convertire
  automaticamente le misure leggendo `$INSUNITS`, **non** aggiungere un
  controllo manuale.

- ⏸ **#10** — **Forma del pezzo nel wizard 2D**: il wizard modella sempre
  il grezzo come rettangolo (`raw_x × raw_y × raw_z`). Per i pezzi
  tagliati al filo questo è corretto **solo quando** il materiale di
  partenza si compra a piastra rettangolare; ma non è sempre così (a
  volte il grezzo è tondo). Quando il materiale di partenza è tondo, il
  costo materiale risulta sovrastimato (su un disco Ø 100 × 20 mm la
  sovrastima è ~27%). Da rendere selezionabile la forma del grezzo nel
  wizard 2D, come già avviene nel preventivatore manuale (campo
  `raw_diameter_mm` esiste sul modello `Part` ma il wizard 2D non lo
  popola — `Dxf2dWizard.tsx:312-319`).

**Minori collegati al wizard 2D** (gravità media/bassa, registrati per
non essere dimenticati):

- **Tempo foratura del 2D mai ricalcolato dal backend dopo la creazione**:
  `cycle_hours_per_part` della fase Foratura è calcolato solo lato
  frontend al submit (`Dxf2dWizard.tsx:368`) e salvato. Se l'utente
  cambia in seguito l'altezza pezzo o se la tabella `DrillingTime`
  viene aggiornata, le ore restano congelate. Asimmetria col modulo
  stampi, che invece le ricalcola.

- **Autocalc EDM che restituisce 0 in silenzio**: se in `EdmCutSpeed`
  manca la riga per (famiglia, spessore) richiesto,
  `_compute_edm_hours_pure` ritorna `None` → `cycle_hours_per_part`
  resta 0 → la fase EDM costa 0 €. Il wizard 2D mostra un toast
  warning (`Dxf2dWizard.tsx:351-354`) ma il preventivo viene salvato
  comunque. Stessa cosa per la fase Foratura: se la tabella è incompleta
  la fase non viene proprio creata (`Dxf2dWizard.tsx:357-374`) — toast
  warning ma nessun blocco. Da rendere bloccante o almeno più visibile.

- **Validazione mancante: grezzo più piccolo del disegno**: nel wizard 2D
  i campi `raw_x_mm` e `raw_y_mm` sono editabili e non c'è check di
  coerenza con il bbox dei profili selezionati. Il viewer mostra un
  overlay rosso visivo ma il submit non lo blocca: un grezzo dichiarato
  più piccolo del taglio richiesto sottostima il costo materiale e
  passa al salvataggio senza errore (`Dxf2dWizard.tsx:245-282`,
  `validate()`).

### B3 — Test automatici sui punti che fanno male
Esiste già una base di 48 test che passano. Mancano in due punti precisi:
**login/permessi** (la parte sicurezza non ha rete di sicurezza) e un **test
di parità** che confronti le due calcolatrici dei prezzi. Da aggiungere test
mirati lì — non "una suite completa", solo i punti critici.
*Stima: ~1 giorno.*

### B4 — Proteggere la cartella `/uploads` + validazione file
La cartella dei file caricati (disegni tecnici, schede) è oggi scaricabile
**senza login** da chi indovina l'indirizzo. Va messa dietro autenticazione.
Insieme: far controllare i file caricati dal *contenuto reale* e non solo dal
nome. *Stima: ~mezza giornata.*

### B5 — Chiudere la lettura dei preventivi "dalla porta di servizio"
L'interfaccia nasconde i preventivi che non competono a un utente, ma chi fa
chiamate tecniche dirette potrebbe leggerli lo stesso. Da verificare e
chiudere. *Stima: piccola/media.*

### B6 — Nascondere i campi che non hanno effetto
Esistono campi nell'interfaccia che un utente può compilare credendo di
influenzare il prezzo, ma che il calcolo **ignora**. Vanno nascosti, per non
ingannare chi li compila. *Stima: piccola.*

### B7 — Aggiungere gli indici mancanti al database
Mancano alcuni "indici" (`quote_date`, `status`, `quote_type`,
`created_by_user_id`). Senza, con molti preventivi la dashboard e l'archivio
rallenteranno. Poche righe. *Stima: ~10 min. Conviene farlo presto, costa poco.*

---

## ═══ LINEA 2 — qui MechQuote è pronto per l'uso quotidiano in più persone ═══

---

## ░░░ BLOCCO C — MANUTENZIONE E MIGLIORAMENTI (senza fretta) ░░░

*Cose vere ma non urgenti: si affrontano quando c'è tempo.*

### Performance (problemi del "futuro", con la crescita dei dati)
- **C1** — La ricerca nell'archivio rallenterà oltre ~1000 preventivi.
- **C2** — La dashboard ricalcola tutto ad ogni apertura: lenta con molti dati.
- **C3** — La ricerca "stampi simili" carica tutto in memoria: lenta con
  centinaia di stampi.
- **C4** — La generazione PDF riavvia Chromium ogni volta (2-5 secondi a PDF).

### Robustezza e operatività
- **C5** — Il file di log cresce all'infinito: va configurata una "rotazione".
- **C6** — Nessun "controllo del battito": se MechQuote si pianta in silenzio,
  nessuno se ne accorge.
- **C7** — File caricati possono restare "orfani" su disco: serve una pulizia.
- **C8** — Il database non controlla i collegamenti tra i dati ("foreign
  keys"): rischio di dati scollegati, soprattutto durante import/ripristino.
- **C9** — Procedura di aggiornamento dal PC al server: documentata ma
  migliorabile (test su porta separata prima del passaggio, `npm ci`,
  endpoint `/api/version` per sapere che versione gira).

### Codice
- **C10** — La formula del costo fase è in TRE copie invece di due: ridurle.
- **C11** — Errori del lettore DXF troppo "chiacchieroni" verso l'utente.
- **C12** — File possono sovrascriversi se hanno lo stesso nome.
- **C13** — Piccole imprecisioni di arrotondamento (differenze di centesimi).
- **C14** — Dati che restano "vecchi" se si cambia materiale e si cancellano
  le dimensioni.
- **C15** — Riordino dei file più grandi (lavoro estetico, ultima priorità).

---

## ░░░ DA CHIARIRE CON L'AZIENDA (non sono lavori di codice) ░░░

Domande a cui solo l'azienda può rispondere — vanno sciolte, idealmente prima
del Blocco B:

- **D1** — Lo sconto può portare il totale sotto il "prezzo minimo" delle
  parti? Il minimo è invalicabile o no?
- **D2** — Lo sconto deve applicarsi anche a trasporto e imballaggio?
- **D3** — Quante persone useranno MechQuote insieme, e quanto spesso sullo
  stesso preventivo? (Determina l'urgenza di B1.)
- **D4** — Confermare se il server è raggiungibile solo da rete interna
  (idealmente verificandolo con chi gestisce la rete).

---

## ░░░ DECISIONI DI PRODOTTO ░░░

Cose che **non sono bug** del codice, ma rappresentazioni del dominio che
vanno discusse e potenzialmente riviste con l'officina. Sono "P" (prodotto),
distinte dalle "D" (domande operative all'azienda) e dalle voci A/B/C
(lavori di codice). Da affrontare **dopo il Blocco B**: prima si chiude
la messa in sicurezza, poi si rivedono le modellazioni.

### P1 — Separare Trattamenti e Rivestimenti
Nell'officina sono due famiglie distinte: **trattamenti termici** pagati a
**peso** (kg) e **rivestimenti** pagati a **volume** (dm³), con fornitori
diversi. MechQuote oggi li tiene in un'unica categoria "Trattamenti", con
un flag `cost_unit = 'kg' | 'dm3'` che switcha la formula del costo.

Non è un bug — il calcolo funziona — ma è una rappresentazione poco fedele:
**due famiglie con dinamiche e fornitori diversi sono fuse in una sola
voce di catalogo**. L'UX risulta meno chiara per chi compila il preventivo,
i report aggregati per "trattamento" mescolano cose diverse, e il campo
`cost_per_dm3` su un "trattamento" può essere fuorviante per chi pensa
all'asportazione truciolo (concetto **non** presente nel codice).

**Da verificare prima con l'officina**: i rivestimenti vanno **davvero a
dm³** o vanno a **superficie** (dm²)? Nel database SQLite esiste una colonna
**legacy** `cost_per_surface_area` sul modello `Treatment` — mappata in
passato, mai più letta dal cost engine — che suggerisce un modello "per
superficie" considerato e poi accantonato. Se i rivestimenti reali vanno a
superficie, l'attuale `cost_per_dm3` è una semplificazione che approssima
ma non rappresenta il prezzo vero del fornitore.

**Esito atteso**: una decisione su come modellare in MechQuote i due mondi
(due tabelle separate? una sola con tipologia? formula a superficie per i
rivestimenti?). Decisione di prodotto da affrontare **dopo il Blocco B**.

### P2 — Forma del pezzo negli stampi (rettangolare / tondo)
Il calcolo del perimetro pezzo a fallback (in `_estimate_die_perimeter`,
backend `services/calculation.py:~641-649` + gemello frontend
`lib/dieCalc.ts:~167-171`) usa oggi la formula rettangolare
`2 × (bbox_x + bbox_y) × complexity_factor` **per qualunque pezzo**, anche
quelli di sagoma tonda. Per un disco Ø 100 mm la sovrastima è di circa il
**53%** (perimetro vero π × 100 ≈ 314 mm; fallback 480 mm) → ore EDM filo
gonfiate, prezzo dello stampo sovrastimato. Conseguenza pratica: stampi
per pezzi tondi (dischi, rondelle, flange) quotati molto più cari del
dovuto.

Per correggerla servirebbe la formula del cerchio (`π × diametro`) nel
ramo "tondo", ma per scegliere il ramo il codice deve sapere **che forma
ha il pezzo**: oggi il modello `DieSpec` non lo dice. Le uniche
dimensioni del pezzo sono `bbox_x_mm`, `bbox_y_mm`, `perimeter_pezzo_mm`
(opzionale) e `complexity_factor` — niente campo `shape`, `forma`, o
`raw_diameter`. Dal punto di vista del codice un disco Ø 100 e un
quadrato 100×100 sono indistinguibili.

Originariamente questa voce era in Fascia 1 come "C7" nelle correzioni
prezzo. Spostata qui in Decisioni di prodotto perché non è una correzione
di codice come le altre (C1-C6): è una **modifica di modello + UX** che
deve essere parte naturale del ripensamento del calcolo stampi.

**Esito atteso**: decidere come dichiarare la forma del pezzo (campo
`shape` enum su `DieSpec` con radio nel wizard? altra rappresentazione?),
applicare la formula del cerchio nel ramo "tondo" sia nel backend che nel
gemello frontend, attivare il caso d'oro S7 (oggi xfail con
`fails_until: P_die_shape`). Da affrontare **dopo il Blocco B**, come
parte del cantiere stampi.

### P3 — Ripensare il calcolo lavorazioni piastre stampo
La voce "foratura piastre" del cost engine stampi (in
`_estimate_die_plate_breakdown`, backend `services/calculation.py:~569-619`
+ gemello frontend `lib/dieCalc.ts:~34`) ha **tre problemi che si tengono
insieme** e che non si possono affrontare separatamente:

1. **Tariffa foratura inesistente come campo dedicato.** In
   `_recalculate_die_levels` (~`calculation.py:777`) il fallback di
   `rate_drill` è `settings.hourly_rate_milling` (tariffa fresatura). La
   colonna `hourly_rate_drilling` **non esiste** nel modello `DieSettings`.
   Se l'utente non aggancia esplicitamente una `drilling_machine_id`, la
   foratura piastre costa quanto la fresatura. Era originariamente la
   "C6" in Fascia 1.

2. **Doppio conteggio foratura + EDM filo su matrice e porta_punzoni.**
   Ogni piastra (compresa la matrice) riceve la voce "ore foratura" come
   stima generica `area × n_facce × ore/dm²` con `n_drilled ≥ 1` di
   default per tutti e cinque i ruoli (cappello, porta_punzoni,
   premilamiera, matrice, base). Le matrici e i porta_punzoni ricevono
   in più la voce EDM filo, calcolata separatamente. Risultato: una
   matrice viene pagata sia per la foratura che per il filo, mentre in
   officina (a quanto dice l'esperto interpellato) le matrici temprate
   si fanno tutte al filo e la foratura non c'è.

3. **Ruoli piastra disallineati dalla realtà di officina.** Il codice
   conosce solo 5 ruoli (`cappello`, `porta_punzoni`, `premilamiera`,
   `matrice`, `base`); termini come "montante" o "accompagnatrice" che
   in officina sono distinti non esistono. In più, nel codice la
   premilamiera **non** va al filo (`continue` esplicito in
   `_estimate_die_edm_hours:701` per `cappello/premilamiera/base`),
   mentre l'esperto di officina dice che la premilamiera va al filo
   come matrice e accompagnatrice. C'è uno scarto da chiarire fra
   modello e officina.

Correggere solo il punto 1 (rinominare/aggiungere `hourly_rate_drilling`)
risolverebbe un sintomo lasciando i punti 2 e 3 intatti: la foratura
sarebbe pagata alla tariffa giusta, ma continuerebbe a essere addebitata
su piastre che non la fanno. Ha più senso ripensare insieme: ruoli
piastra ↔ lavorazioni applicabili ↔ tariffe.

**Esito atteso**: una conversazione con l'officina per chiarire ruoli
reali e lavorazioni per ciascuno, poi rivedere `_PLATE_ROLE_DEFAULTS` e
la branca EDM filo, e in coda aggiungere `hourly_rate_drilling` a
`DieSettings` con la sua migration. Da affrontare **dopo il Blocco B**
insieme a P2 (forma del pezzo): sono entrambi pezzi dello stesso
cantiere stampi.

---

## ░░░ IDEE PER IL FUTURO (non pianificate) ░░░

- IVA opzionale attivabile dalle impostazioni (oggi i preventivi sono al netto;
  questa funzione andrebbe costruita da zero).
- Spostare la cartella `PRV/` (vecchio sito) fuori dal progetto.
- **Interruttore manuale mm/pollici nel wizard 2D** come rete di sicurezza
  per i rari disegni che non dichiarano l'unità di misura (`$INSUNITS = 0`
  "unitless"). Complementare alla conversione automatica di B2-#9: quando
  l'unità è dichiarata MechQuote la converte da sola; quando non lo è,
  l'utente deve poter scegliere a mano prima del calcolo.
- Audit UX — dopo qualche settimana di uso reale.
- Aggiornare esbuild/vite (rischio solo sul PC di sviluppo, costo alto: per ora
  non conviene).

---

## ░░░ NOTA A PARTE — il CLAUDE.md ░░░

Il `CLAUDE.md` attuale del progetto contiene **una formula di prezzo superata**
(descrive un meccanismo, `is_shared`, rimosso dal codice). Questo va corretto
**presto e a parte**, perché Claude Code crede a quel documento: una formula
sbagliata lì dentro disorienta ogni lavoro futuro sui prezzi.

Prossimo passo dopo questa lista: correggere quell'errore e costruire un
`CLAUDE.md` aggiornato, con le **note di cautela** sulle parti fragili
(§7 del documento di riferimento) e una regola sul fatto che Claude Code deve
attenersi al compito assegnato senza allargarlo.

---

*Lista basata sulle cinque ricognizioni del 22 maggio 2026. Va aggiornata
spuntando i lavori completati.*
