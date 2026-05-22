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

## ░░░ IDEE PER IL FUTURO (non pianificate) ░░░

- IVA opzionale attivabile dalle impostazioni (oggi i preventivi sono al netto;
  questa funzione andrebbe costruita da zero).
- Spostare la cartella `PRV/` (vecchio sito) fuori dal progetto.
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
