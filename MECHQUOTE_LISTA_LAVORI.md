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

## ░░░ CANTIERI APERTI (lavori in corso oltre i blocchi) ░░░

### Cantiere Catalogo Normalizzati 🚧 IN CORSO (aperto 2026-05-27)
Nuovo modulo: catalogo globale dei pezzi normalizzati (viti, cuscinetti,
molle, colonne, boccole, ecc.). Oggi i normalizzati esistono solo dentro
template stampo (`DieTemplateNormalized`) e dentro singoli preventivi
stampo (`DieNormalizedItem`) — niente catalogo centrale da cui pescarli.
Risultato: un componente ricorrente viene digitato a mano N volte, con
prezzi che divergono e zero memoria storica.

Cantiere in 6 step incrementali, commit separato per ogni step. Opzione di
aggancio scelta: **Opzione A — snapshot**: i template/preventivi avranno
una FK opzionale al catalogo; al collegamento i valori vengono copiati;
preventivi storici restano congelati ai loro numeri.

**Stato avanzamento**:
- ✅ **Step 1** — modello `NormalizedItem` + migration (`ca738ab`, 27/05)
- ✅ **Step 2** — endpoint CRUD (`f430eb4`)
- ✅ **Step 3** — pagina UI catalogo (`26e7ab8`)
- ⏸ **Step 4** — aggancio `DieTemplateNormalized` (FK + autocomplete) (~1 giornata)
- ⏸ **Step 5** — aggancio `DieNormalizedItem` (FK + autocomplete) (~1 giornata)
- ⏸ **Step 6** — import CSV + modello scaricabile (~½ giornata) — il
  motore condiviso `app.core.csv_import` esiste già (cantiere import
  cataloghi chiuso il 2026-06-04), quindi è ora un lavoro breve: serve
  solo cablare un mapper su `NormalizedItem` e i due endpoint.
- ⏸ **Step 7** (opzionale) — estrazione automatica voci da template esistenti (~½ giornata)

**Stima residua**: restano Step 4-5-6 (+7 opzionale), ~2½-3 giornate di
lavoro effettivo. Cantiere a sé, indipendente da altri lavori in corso. Si
procede 1 step alla volta, ogni step richiede ok esplicito prima di partire.

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

### A8 — Bug server: PDF preventivi dà errore 500 🔴 (scoperto 2026-05-27)
Sul server, generare il PDF di un preventivo restituisce **HTTP 500
Internal Server Error**. Sul PC di sviluppo funziona. Sintomi tipici per
questa classe di errore: Chromium di Playwright non installato (la
generazione PDF dipende da un browser headless che pesa ~150 MB e va
installato a parte rispetto a Python/Node), oppure permessi sulla cartella
temporanea, oppure cartella di avvio del servizio sbagliata.
**Cosa fare:** aprire `C:\MechQuote\logs\uvicorn.log` sul server al momento
del tentativo PDF, identificare l'eccezione. La causa più probabile è
Chromium mancante. Stesso check incrociato con A2 (crash stampi): se è
Chromium, A2 e A8 hanno la stessa radice e si risolvono insieme con
`playwright install chromium` nel venv del server.
*Stima diagnosi: ~5 min. Stima correzione: ~10 min se è Chromium.*

### A9 — Bug server: sezione stampi crasha, errore 404 su `/api/dashboard/alerts` 🔴 (scoperto 2026-05-27)
Sul server, aprire la sezione Stampi causa un errore in console del browser:
**GET `/api/dashboard/alerts` → 404 Not Found**. L'endpoint esiste nel
codice (`backend/app/api/dashboard.py:553`), quindi il 404 viene da Apache
che non sta inoltrando la richiesta al backend, **non** da FastAPI che la
riceve e risponde 404. Cause tipiche: configurazione `ProxyPass` di Apache
incompleta (la regola `/api/` non inoltra tutte le sotto-route), oppure
backend non in esecuzione, oppure servizio backend partito dalla cartella
sbagliata e quindi non risponde su `:8000`. Affine ad A2 (stesso ambiente
server, stesse cause possibili).
**Cosa fare:** verificare `nssm status MechQuoteBackend` (servizio acceso?),
`curl http://localhost:8000/api/dashboard/alerts` dal server (risponde il
backend?), poi `C:\Apache24\conf\extra\httpd-vhosts.conf` per controllare la
regola di proxy.
*Stima diagnosi: ~10 min.*

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
Anteprima a schermo e calcolo del server devono dare lo stesso numero; in
piu' punti non lo fanno. **Stato e dettaglio completo in
`MECHQUOTE_CORREZIONI_PREZZI.md`** (fonte unica sul calcolo prezzi).
Sintesi: **Fascia 1 CHIUSA** (C1-C5 applicate; C6 -> P3, C7 -> P2, spostate
al cantiere stampi). Restano la **Fascia 2** (fragilita' medie: anteprime
stantie, calcoli che vanno a 0 in silenzio, forma pezzo nel wizard 2D,
validazioni mancanti) e la **Fascia 3** (decisioni azienda: D1/D2,
arrotondamento). Elenco puntuale in CORREZIONI_PREZZI.

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
- **C16** — Backup WAL-aware: la logica `sqlite3.backup()` e' oggi
  duplicata inline in `update.bat` e in `backup.ps1` (§9.1 di
  INSTALLAZIONE.md). Consolidarla in un unico `backend/backup_db.py`
  richiamato da entrambi.

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

### P4 — Dare significato pieno al campo "active" in tutto il progetto
Oggi il campo `Tool.active` / `Material.active` / `Supplier.active` /
`MaterialSupplier.active` / `ToolSupplier.active` / `NormalizedSupplier.active`
/ `NormalizedItem.active` è presente in tutti i modelli catalogo e ha
una checkbox nel form di edit, ma è consultato **solo** dalle 6 pagine
catalogo (toggle "Solo attivi", introdotto il 2026-05-27 con il commit
`669b2f9`). In tutti gli altri posti il campo è ignorato.

**Risultato attuale**: "ritirare" una voce la nasconde nella sua pagina
catalogo, ma **NON** la esclude da:
- generazione ordini utensili (utensili inattivi sotto scorta vengono
  comunque proposti per il riordino — `OrdersToolsPage` chiama
  `/api/tools?low_stock_only=true` senza filtrare per `active`)
- alert dashboard "sotto scorta" (`/api/tools/low-stock-count` conta
  anche gli inattivi)
- notifiche low-stock generate dallo scan barcode
  (`tools.scan_tool` → `services/notifications.py`, nessun check su
  `active`)
- dropdown materiali nei preventivi (materiali ritirati comunque
  selezionabili)
- dropdown fornitori vari (`NormalizedSupplier`, `MaterialSupplier`,
  `ToolSupplier`, `Supplier` trattamenti — nessuno filtra per `active`)
- dropdown trattamenti nelle fasi di preventivo
- dropdown macchine nelle fasi
- dropdown lavorazioni (`Operation`) nelle fasi
- (futuro) autocomplete `NormalizedItem` quando arriveranno gli
  Step 4-5 del cantiere normalizzati — andrà deciso lì

**Esito atteso**: voce di prodotto, da affrontare come cantiere a sé
**dopo che MechQuote sarà in uso in azienda**. L'uso reale dirà quali
di questi punti pesano davvero e in che ordine vanno sistemati (es. è
plausibile che l'esclusione dagli ordini utensili sia la priorità #1,
mentre il filtro sui dropdown materiali sia meno urgente: dipende da
quanti articoli si ritirano e con che frequenza). Decisione di prodotto
da rimandare al feedback dell'utenza reale, non da affrontare a freddo.

**Scoperta**: emersa il 2026-05-29 come domanda dell'utente sugli
ordini utensili. La fotografia completa dello stato attuale (quali
endpoint filtrano `active`, quali no) è stata fatta lo stesso giorno
e vive in questo documento — l'elenco dei "non filtra `active`" sopra
è la fotografia, non un'ipotesi.

### Visione utente registrata per P2 + P3 (2026-05-27)
Durante la sessione del 27 maggio è emersa una **visione di prodotto**
condivisa con cui affrontare insieme P2 e P3 quando si aprirà il
cantiere stampi:

> **Template stampo configurabili con lavorazioni abilitabili per piastra.**
> L'utente (anziché vincolare le piastre ai 5 ruoli fissi attuali con i
> default hardcoded `_PLATE_ROLE_DEFAULTS`) definisce **un proprio
> template di stampo dove per ogni piastra dichiara quali lavorazioni si
> applicano**: fresatura sì/no, rettifica sì/no, foratura sì/no, EDM
> filo sì/no, station_bonus sì/no — con i propri parametri (n. facce,
> ore di setup, ecc.).
>
> Questo risolve in un colpo solo:
> - **P3.2** doppio conteggio foratura + EDM filo su matrice/porta_punzoni
>   → se la matrice non fa la foratura, l'utente la disabilita nel template
> - **P3.3** ruoli officina disallineati (montante, accompagnatrice, ecc.)
>   → l'utente dichiara i ruoli che gli servono, non c'è più una lista
>   fissa di 5
> - **P2** forma del pezzo → diventa una proprietà del template (o del
>   preventivo), formula del perimetro decisa lì
> - **P3.1** tariffa foratura → resta come è (tariffa per lavorazione),
>   ma ora la lavorazione è opzionale per piastra, quindi se non c'è la
>   tariffa non viene applicata
>
> È una **decisione di prodotto futura**, non un piano operativo. Vale
> come orientamento quando si entrerà nel cantiere stampi (dopo il
> Blocco B).

---

## ░░░ IDEE DA BRAINSTORMING DEL 27 MAGGIO 2026 ░░░

Idee di prodotto emerse durante la sessione del 27 maggio, registrate qui
come "candidate" — non ancora pianificate, da valutare a freddo per
priorità e impatto.

- **Descrizione completa dei trattamenti nella selezione** (oltre al
  nome). Oggi quando l'utente sceglie un trattamento da una `<select>`
  vede solo il nome, non se è €/kg o €/dm³, non il fornitore. Sarebbe
  utile vedere subito il dettaglio per evitare ambiguità (es. "Tempra
  HRC60 — Haerta — 2,00 €/kg, minimo 50 kg / 50 €").

- **Pulsante "duplica riga" nelle anagrafiche**. Per voci di catalogo
  simili a una esistente, ora bisogna ricompilare tutto a mano. Un
  bottone "duplica" che cloni la riga con nome "(copia)" velocizza
  l'inserimento.

- **Allargare la finestra delle pagine impostazioni per leggibilità**.
  Le tabelle delle pagine settings (catalog, materiali, utensili...)
  oggi hanno larghezza ridotta e su molti monitor sprecano spazio ai
  bordi. Da valutare un layout fluid con larghezza piena.

- **Pulizia file del progetto**. Ricognizione sistematica di file non
  più utilizzati nel repo (componenti orfani, pagine deprecate, asset
  vecchi). Pulizia da fare a freddo, una sola passata.

---

## ░░░ STRUMENTI DI LAVORO ░░░

### `update.bat` — script di aggiornamento manuale del server (creato 2026-05-27)
Sta in radice del repo (`C:\MechQuote\update.bat` sul server). Va lanciato
**a mano** da CMD aperto **come amministratore**:

```
cd C:\MechQuote
update.bat
```

Cosa fa (in ordine, fail-fast): backup DB WAL-aware → verifica
prerequisiti (git, npm, venv, servizio NSSM, branch == main, working
tree pulito) → `git fetch` + `git pull --ff-only` → `pip install` e
`npm install` solo se le dipendenze sono cambiate → `npm run build` →
`nssm restart MechQuoteBackend` → health check via curl → riepilogo +
comando di rollback stampato (non eseguito).

Niente automatismi a tempo (no Task Scheduler), niente `git reset
--hard` cieco, niente push automatici. Lo script è rilanciabile in
sicurezza dopo un fallimento parziale (tutti i passi idempotenti). Commit
`261883e`.

---

## ░░░ CONSOLIDAMENTO MODULI — CATALOGO (fotografia 04/06/2026) ░░░

Esito della fotografia "sola lettura" del modulo Catalogo (materiali,
fornitori grezzi, macchine, lavorazioni, trattamenti, fornitori esterni,
normalizzati item + suppliers). Le voci sotto sono i disallineamenti
emersi, NON un cantiere unico: alcune richiedono decisioni di prodotto
prima del codice, altre sono pulizia "en passant" da fare quando si tocca
la zona.

### CAT-1 — Semantica del campo `active` 🔴 (tocca i preventivi)

Oggi una voce non-attiva (materiale / macchina / lavorazione / trattamento
/ fornitore) **resta nelle dropdown del preventivatore ed è usata dal cost
engine** (`services/calculation.py` non filtra `active`, tranne
`CuttingCycle.active` riga 681). Il toggle "Solo attivi" è solo
client-side e incoerente: presente in 6 pagine (MaterialSuppliers,
TreatmentSuppliers, NormalizedSuppliers, ToolSuppliers, MaterialsPage
sezione Materiali, NormalizedItems), assente in 3 (Machines, Operations,
Treatments). I filtri server-side `?active=…` esistono solo per
`/normalized-items` e `/customers`.

**DECISO (04/06/2026)**: "ritirare" una voce di catalogo la **toglie dai
menu di SELEZIONE** del preventivatore (nuove scelte); **lo storico resta
intatto e ricalcolabile**. Il filtro `active=true` si applica **solo alle
liste di nuova scelta**, MAI al caricamento o al ricalcolo delle voci
già agganciate a parti/fasi di preventivi esistenti. Stato: **da
implementare**.

### CAT-2 — Doppione gestione fornitori

`MaterialSupplier` e `Supplier` (esterni/trattamenti) si gestiscono da
**due punti UI ciascuno**:
- pagina **combo** (`MaterialsPage` / `TreatmentsPage`, sezione fornitori
  con inline-edit in tabella);
- pagina **standalone** (`MaterialSuppliersPage` / `TreatmentSuppliersPage`,
  modale, in tab dentro `/settings/suppliers`).

Le due viste lavorano sullo stesso endpoint ma sono **asimmetriche**: la
versione co-locata è più povera (manca il toggle "Solo attivi", manca
`notes` per entrambi, manca `supplier_type` per Supplier esterni). Stessa
entità, due esperienze diverse a seconda della rotta.

Candidato pulizia: **un solo punto per fornitore** (tenere la pagina
standalone, rimuovere o ridurre la sezione co-locata a link). Impatto
UX + chiusura della doppia manutenzione.

### CAT-3 — Tre "scuole" UI nei cataloghi

In compresenza:
1. **Inline-edit in tabella** (stile `QuoteCategoriesPage`) — usata nelle
   sezioni fornitori dentro `MaterialsPage` e `TreatmentsPage`.
2. **Modale** (overlay `fixed inset-0`) — usata da tutte le pagine
   standalone e dalle sezioni "Materiali" / "Trattamenti" delle pagine
   combo.
3. **Modale + toolbar avanzata** (debounce, multi-filtro, sort) — solo
   `NormalizedItemsPage`.

Approccio consigliato: **fissare uno standard** (probabilmente "modale
semplice", che è il pattern di maggioranza) e allineare le pagine
gradualmente quando le si tocca per altri motivi. **Non un cantiere
unico**: il costo di un refactor en bloc supera il valore di consistenza
finché le pagine restano funzionali.

### CAT-4 — Quattro anagrafiche fornitori separate (DECISO: non intervenire)

Coesistono `MaterialSupplier`, `Supplier` (esterni), `NormalizedSupplier`,
`ToolSupplier` con campi parzialmente sovrapposti (tutti hanno `name` +
`address` + `active`; `shipping_cost` in 3 su 4; `phone`/`email` in 2 su
4; `cutting_cost_per_part` solo su `MaterialSupplier`; `supplier_type`
solo su `Supplier`).

Commento esplicito in `models.py:622-626` (ToolSupplier): *"Distinto da
Supplier (trattamenti) e da MaterialSupplier (materiale grezzo). Domini
diversi, niente sovrapposizioni voluta dal cliente."* La frammentazione è
una **scelta di prodotto**, non un difetto tecnico. **Non accorpare**.

### CAT-5 — Cosmetici / tecnici (bassa priorità, ripulire en passant)

Da affrontare opportunisticamente quando si tocca la zona:

- **Due convenzioni di naming endpoint FastAPI**: path completo nei
  decoratori (`materials.py`, `machines.py`, `operations.py`,
  `treatments.py`) vs prefix-per-router (`normalized_items.py`,
  `normalized_suppliers.py`). Nuovi catalog usano il secondo,
  nessuna regola dichiarata in `CLAUDE.md`.
- **Due stili di gating permessi**: inline `dependencies=[require_permission('settings')]`
  vs variabile factorizzata `_can_settings = require_permission(...)`.
- **Search con debounce** solo in `NormalizedItemsPage`. Filtri backend
  (`?q=&active=&supplier_id=&category=`) **pronti ma non cablati** dal
  frontend; `limit(500)` hard-coded solo lì. Le altre pagine cercano
  senza debounce, niente cap.
- **Colonne legacy** in `treatments`: `fixed_cost`, `cost_per_part`,
  `cost_per_surface_area`, `treatment_supplier_id` esistono nel DB
  (SQLite non droppa), non sono mappate dal modello (vedi
  `16_legacy_columns.md`).
- **`MACHINE_TYPES` hardcoded** in `MachinesPage.tsx` (13 valori). Niente
  tabella backend; aggiungere/rinominare un tipo = code change frontend.
- **Uniqueness DB**: solo `Operation.name` è `UNIQUE`. Gli altri
  cataloghi (Material, Machine, Treatment, Supplier, MaterialSupplier,
  NormalizedSupplier) non hanno unique constraint; dedup vive solo
  nell'app (UI + motore CSV).

### CAT-6 — NormalizedItem senza `block_if_in_use` (rimando)

`DELETE /api/normalized-items/{id}` non chiama `block_if_in_use`: già
**TODO Step 4-5 del cantiere normalizzati** (vedi `normalized_items.py:137-142`).
Si chiude naturalmente quando arriveranno le FK opzionali da
`DieTemplateNormalized` e `DieNormalizedItem`. Non riaprire qui.

---

## ░░░ IDEE PER IL FUTURO (non pianificate) ░░░

- IVA opzionale attivabile dalle impostazioni (oggi i preventivi sono al netto;
  questa funzione andrebbe costruita da zero).
- Spostare la cartella `PRV/` (vecchio sito) fuori dal progetto.
- **Interruttore manuale mm/pollici nel wizard 2D** come rete di sicurezza
  per i rari disegni che non dichiarano l'unità di misura (`$INSUNITS = 0`
  "unitless"). Complementare alla conversione automatica di B2-#9 / C5: quando
  l'unità è dichiarata MechQuote la converte da sola; quando non lo è,
  l'utente deve poter scegliere a mano prima del calcolo.
- Audit UX — dopo qualche settimana di uso reale.
- Aggiornare esbuild/vite (rischio solo sul PC di sviluppo, costo alto: per ora
  non conviene).
- **Import CSV per i lookup utensili** (`ToolType` / `ToolBrand` /
  `ToolLocation`), se servirà a popolarli in massa. Motore condiviso
  `app.core.csv_import` già pronto.

---

*Lista basata sulle cinque ricognizioni del 22 maggio 2026. Va aggiornata
spuntando i lavori completati.*
