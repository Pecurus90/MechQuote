# Installazione MechQuote su Windows 11

> Guida passo-passo per installare MechQuote su un PC Windows 11 che farà da **server LAN aziendale**. Pensata per 10-12 utenti che si collegano dai loro PC tramite browser.
>
> **A chi si rivolge**: persone non pratiche di PC. Ogni comando è spiegato in italiano semplice. Quando un passo può andare storto, trovi un box `SE NON FUNZIONA` con la diagnosi più comune.

---

## Cosa stiamo per costruire

Il PC server farà girare 3 programmi:

1. **Apache** — il "centralinista". Riceve le richieste dei dipendenti che aprono il browser, e gli risponde mostrando MechQuote. Apache lavora sulla **porta 80** (la porta standard del web).
2. **Uvicorn (motore Python)** — il "cervello". È il software che calcola i prezzi, salva i preventivi, ecc. Ascolta sulla porta 8000 (interna, non visibile ai dipendenti).
3. **Task Scheduler di Windows** — fa il **backup automatico** del database ogni notte.

Schema visivo:

```
┌────────────────────────────────────────────┐
│  Server Windows 11                          │
│                                             │
│   Apache 2.4 (porta 80, pubblica in LAN)    │
│   ├─ serve il sito web di MechQuote         │
│   └─ inoltra le richieste API → porta 8000  │
│                                             │
│   Uvicorn (porta 8000, solo interna)        │
│   ├─ motore Python FastAPI                  │
│   └─ database SQLite (mechquote.db)         │
│                                             │
│   Task Scheduler: backup notturno DB        │
└────────────────────────────────────────────┘
         ↑
         http://192.168.x.x  ← l'indirizzo del server in LAN
         │
   [PC dipendenti]  →  browser  ×  10-12 utenti
```

I dipendenti **non installano nulla** sul loro PC. Aprono Chrome/Edge/Firefox e digitano l'indirizzo del server.

---

## 1. Prerequisiti — software da installare sul server

Tutti questi vanno installati **sul PC server**, una volta sola.

| Software | Versione | Dove scaricare |
|---|---|---|
| **Python** | 3.11 (qualsiasi 3.9 o superiore) | https://www.python.org/downloads/windows/ |
| **Node.js** | 20 LTS | https://nodejs.org |
| **Git for Windows** | ultima disponibile | https://git-scm.com/download/win |
| **Apache HTTP Server** | 2.4 | https://www.apachelounge.com/download/ |
| **NSSM** | 2.24 | https://nssm.cc/release/nssm-2.24.zip |

> **ATTENZIONE — durante l'installazione di Python**: nella prima schermata dell'installer c'è una casella `Add Python to PATH`. **DEVI metterla spunta**. Se non lo fai, il comando `python` da CMD non funzionerà e dovrai disinstallare e ripetere.

> **SUGGERIMENTO — NSSM**: è un file `.zip`. Dopo averlo scaricato, aprilo, vai nella sottocartella `win64`, copia il file `nssm.exe` e incollalo in `C:\Windows\System32`. Da quel momento il comando `nssm` funziona da qualsiasi cartella.

### 1.1 Verifica che tutto sia installato

Apri il **Prompt dei comandi** (CMD): premi `Win+R`, digita `cmd` e premi Invio.

Esegui questi 5 comandi uno alla volta:

```cmd
python --version
node --version
git --version
httpd -v
nssm --version
```

**COSA FA**: ogni comando chiede al software di dire la sua versione. Se è installato, vedrai un numero (es. `Python 3.11.5`). Se non è installato, vedrai `'python' non è riconosciuto...` e dovrai tornare al passo precedente.

> **SE NON FUNZIONA — Python o Node non riconosciuti**: l'installer non ha aggiunto Python/Node al `PATH`. Reinstalla e ricordati la spunta `Add to PATH`. Oppure riavvia il PC e riprova: a volte serve un riavvio perché il PATH venga aggiornato.

---

## 2. Scaricare il progetto MechQuote

Apri CMD e digita:

```cmd
cd C:\
git clone https://github.com/Pecurus90/MechQuote.git
cd MechQuote
```

**COSA FA**:
- `cd C:\` — si sposta nella radice del disco C.
- `git clone ...` — scarica tutto il codice del progetto da GitHub e lo mette nella cartella `C:\MechQuote`.
- `cd MechQuote` — entra dentro alla cartella appena creata.

> **ATTENZIONE — il percorso `C:\MechQuote` è importante**: tutta la guida assume che il progetto si trovi lì. Se lo metti altrove, dovrai sostituire `C:\MechQuote` con il tuo percorso in tutti i comandi successivi.

> **SE NON FUNZIONA — "Authentication required"**: il repository è pubblico, non serve login. Se Git ti chiede username/password, vuol dire che hai un'altra configurazione di credenziali. Chiudi il prompt e riapri da capo, oppure copia il link dalla guida con `Ctrl+C`/`Ctrl+V`.

---

## 3. Setup del motore Python (backend)

### 3.1 Installazione dipendenze

Da CMD:

```cmd
cd C:\MechQuote\backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
```

**COSA FA**:
- `python -m venv venv` — crea un "ambiente Python isolato" dedicato a MechQuote, dentro la cartella `venv`. Serve per non mischiare le librerie di questo progetto con quelle di altri programmi sul PC.
- `venv\Scripts\activate` — attiva quell'ambiente. Vedrai il prompt cambiare aggiungendo `(venv)` all'inizio.
- `pip install -r requirements.txt` — scarica tutte le librerie Python di cui MechQuote ha bisogno (~30 pacchetti). Impiega 2-5 minuti la prima volta.
- `playwright install chromium` — scarica un browser Chromium dedicato (~150 MB) che il backend userà per generare i PDF dei preventivi. Impiega qualche minuto.

> **ATTENZIONE — il prompt cambia**: quando l'ambiente è attivo vedrai `(venv) C:\MechQuote\backend>`. Se non vedi `(venv)`, l'ambiente NON è attivo: ridigita `venv\Scripts\activate`.

### 3.2 Configurare il file `.env`

Il file `.env` contiene le impostazioni segrete (chiave di sicurezza, indirizzo del server).

Copia il modello:

```cmd
copy .env.example .env
```

Apri il file con Blocco Note:

```cmd
notepad .env
```

Modifica due campi:

**(a) SECRET_KEY** — è una chiave casuale lunga che serve a cifrare i token di login. Se lasci quella di esempio, MechQuote si rifiuta di avviarsi.

Genera una nuova chiave con questo comando (sempre con venv attivo):

```cmd
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Il comando stampa una stringa lunga di lettere e numeri. **Selezionala col mouse, clic destro, copia**, e incollala in `.env` al posto della SECRET_KEY di esempio. Risultato:

```
SECRET_KEY=v_3jK9-pZx2QmH8wRtNbY1cFsLeUiOaPdGhM5kVxJnC
```

**(b) ALLOWED_ORIGINS** — l'indirizzo IP del server in LAN. Per scoprirlo, da un nuovo CMD digita:

```cmd
ipconfig
```

**COSA FA**: stampa la configurazione di rete del PC. Cerca la sezione della tua scheda Ethernet o Wi-Fi e la riga `Indirizzo IPv4 . . . . : 192.168.x.x`. Quel numero è l'indirizzo del server.

> **SUGGERIMENTO — quale IP scegliere**: ignora gli IP che iniziano per `169.254.` (sono di emergenza), e quelli relativi a Hyper-V/VPN. L'IP buono è quello del tipo `192.168.1.x` o `10.x.x.x` (rete aziendale).

Modifica `.env`:

```
ALLOWED_ORIGINS=http://192.168.1.50
```

Salva e chiudi Blocco Note.

> **SUGGERIMENTO — IP fisso**: chiedi a chi gestisce la rete di **assegnare un IP fisso al server** (DHCP reservation sul router). Altrimenti se il server viene spento per giorni, l'IP potrebbe cambiare e i client non lo troveranno più.

### 3.3 Creare il primo utente amministratore

Sempre con venv attivo, esegui:

```cmd
python -c "from app.models import User; from app.core.security import get_password_hash; from app.core.database import SessionLocal; db = SessionLocal(); existing = db.query(User).filter(User.username == 'admin').first(); existing.hashed_password = get_password_hash('admin') if existing else None; db.add(User(username='admin', hashed_password=get_password_hash('admin'), full_name='Admin', role='admin', is_active=True)) if not existing else None; db.commit(); print('admin OK')"
```

**COSA FA**: crea (o resetta) l'utente `admin` con password `admin`. Da MechQuote, al primo login, **devi cambiare subito questa password**.

Se vedi stampato `admin OK`, è andato bene.

### 3.4 Test rapido — il motore Python si avvia?

Sempre da CMD con venv attivo:

```cmd
venv\Scripts\uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**COSA FA**: avvia il motore Python sulla porta 8000. Vedrai delle righe scorrere fino a `Application startup complete.`

Apri **un secondo CMD** (lascia il primo aperto con uvicorn in esecuzione) e prova:

```cmd
curl http://localhost:8000/api/health
```

Devi vedere `{"status":"ok","app":"MechQuote"}`. Se sì, il motore Python funziona.

Torna sul primo CMD e premi `Ctrl+C` per fermarlo. Più avanti lo trasformiamo in un servizio automatico.

> **SE NON FUNZIONA — errore "SECRET_KEY"**: il file `.env` non è stato modificato correttamente. Riapri `notepad .env` e verifica che la `SECRET_KEY` sia una stringa lunga e non il valore di esempio.

> **SE NON FUNZIONA — errore "playwright"**: hai saltato `playwright install chromium`. Eseguilo ora con venv attivo.

---

## 4. Setup del sito web (frontend)

Il frontend è la parte visibile di MechQuote (pulsanti, tabelle, schermate). Va "compilato" in file statici che Apache servirà.

Da CMD:

```cmd
cd C:\MechQuote\frontend
npm install
npm run build
```

**COSA FA**:
- `npm install` — scarica le librerie JavaScript necessarie. Impiega 1-3 minuti.
- `npm run build` — compila il sito in file HTML/CSS/JS ottimizzati. Il risultato finisce in `C:\MechQuote\frontend\dist\`.

> **ATTENZIONE — la build crea file nuovi**: ogni volta che aggiorni MechQuote in futuro, dovrai rilanciare `npm run build` per aggiornare i file che Apache serve.

Verifica che la build sia andata bene:

```cmd
dir dist
```

Devi vedere un file `index.html` e una sotto-cartella `assets`. Se sì, il frontend è pronto.

---

## 5. Trasformare il motore Python in servizio Windows (NSSM)

Vogliamo che Uvicorn (il motore Python) parta **automaticamente** quando si accende il server e si riavvii in caso di crash. Lo facciamo con NSSM.

### 5.1 Crea la cartella dei log

Da Esplora risorse, vai in `C:\MechQuote` e crea una sotto-cartella chiamata `logs`. Servirà a NSSM per scriverci dentro i messaggi del motore.

### 5.2 Installa il servizio

Apri CMD **come amministratore**: cerca "cmd" nel menu Start, **tasto destro → Esegui come amministratore**.

```cmd
nssm install MechQuoteBackend "C:\MechQuote\backend\venv\Scripts\uvicorn.exe"
```

Si apre una **finestra grafica** con varie tab in alto. Compila come segue.

**Tab "Application":**
- **Path**: già compilato → `C:\MechQuote\backend\venv\Scripts\uvicorn.exe`
- **Startup directory**: digita `C:\MechQuote\backend`
- **Arguments**: digita `app.main:app --host 127.0.0.1 --port 8000`

**Tab "Details":**
- **Display name**: `MechQuote Backend`
- **Description**: `MechQuote API server (FastAPI)`
- **Startup type**: dal menu a tendina scegli `Automatic`

**Tab "I/O":**
- **Output (stdout)**: `C:\MechQuote\logs\uvicorn.log`
- **Error (stderr)**: `C:\MechQuote\logs\uvicorn.log`

Clicca **Install service** in basso a destra. La finestra si chiude.

### 5.3 Avvia il servizio e verifica

Sempre da CMD amministratore:

```cmd
nssm start MechQuoteBackend
nssm status MechQuoteBackend
```

Lo stato atteso è `SERVICE_RUNNING`. Verifica con:

```cmd
curl http://localhost:8000/api/health
```

Devi vedere `{"status":"ok","app":"MechQuote"}`.

> **SE NON FUNZIONA — il servizio non parte**: apri `C:\MechQuote\logs\uvicorn.log` con Blocco Note e leggi le ultime righe. Errori tipici:
> - `SECRET_KEY` non valida → torna a §3.2
> - Modulo Python mancante → `cd C:\MechQuote\backend && venv\Scripts\activate && pip install -r requirements.txt`
> - Porta 8000 occupata da un altro programma → spegnilo o cambia porta nella riga `Arguments` (es. 8001)

> **SUGGERIMENTO — come riavviare il servizio in futuro**:
> ```cmd
> nssm restart MechQuoteBackend
> ```

---

## 6. Apache: serve il sito + inoltra le richieste al motore Python

### 6.0 Cosa stiamo per fare

Apache è il "centralinista". Quando un dipendente apre il browser e scrive `http://192.168.1.50`, la sua richiesta arriva ad Apache che decide cosa fare:

- Se la richiesta è per un **file del sito** (HTML, CSS, JS, immagini) → Apache la serve direttamente da `C:\MechQuote\frontend\dist\`.
- Se la richiesta è per un'**API** (es. "salvami questo preventivo", indirizzo che inizia con `/api/`) → Apache la inoltra al motore Python sulla porta 8000.

Tutto questo è invisibile per il dipendente: lui vede solo un sito che funziona.

### 6.1 Backup di sicurezza del file di configurazione

**PRIMA di toccare qualsiasi cosa**, facciamo una copia di salvataggio del file di configurazione di Apache. Se sbagliamo qualcosa, possiamo tornare indietro.

Da Esplora risorse:
1. Vai in `C:\Apache24\conf`
2. Trova il file `httpd.conf`
3. Tasto destro → Copia
4. Tasto destro nella stessa cartella → Incolla
5. Rinomina la copia in `httpd.conf.backup-originale`

> **ATTENZIONE**: se hai installato Apache in un percorso diverso da `C:\Apache24`, sostituisci sempre il percorso nelle istruzioni che seguono.

### 6.2 Aprire il file di configurazione

`httpd.conf` va modificato con **Blocco Note aperto come amministratore** (altrimenti Windows blocca il salvataggio).

1. Cerca "Blocco note" nel menu Start
2. **Tasto destro** sull'icona → **Esegui come amministratore**
3. Click su "Sì" alla domanda di Windows
4. Nel Blocco Note: menu **File → Apri**
5. In basso a destra, cambia il filtro da "Documenti di testo (*.txt)" a "Tutti i file"
6. Naviga fino a `C:\Apache24\conf\httpd.conf` e clicca Apri

> **SUGGERIMENTO — per trovare velocemente un testo** dentro un file lungo: premi `Ctrl+F`, digita le parole che cerchi, premi Invio. Blocco Note evidenzia la prima occorrenza.

### 6.3 Abilitare i moduli necessari ad Apache

I "moduli" sono funzionalità di Apache che vanno accese una per una. Servono questi 4:

1. `proxy_module` — per inoltrare le richieste API al motore Python
2. `proxy_http_module` — variante HTTP del modulo proxy
3. `rewrite_module` — per gestire correttamente le URL di MechQuote
4. `vhost_alias_module` — per la configurazione del sito virtuale

Per ciascuno: usa `Ctrl+F` per cercare la riga corrispondente nel file. Vedrai una delle due forme:

```apache
#LoadModule proxy_module modules/mod_proxy.so
```

oppure (senza il `#`):

```apache
LoadModule proxy_module modules/mod_proxy.so
```

**Se ha il `#` davanti**: significa che il modulo è disattivato. **Togli il `#`** (cancella solo quel carattere, lascia il resto della riga intatto).

**Se non ha il `#` davanti**: già OK, vai avanti.

Cerca e abilita queste **4 righe**:

```apache
LoadModule proxy_module modules/mod_proxy.so
LoadModule proxy_http_module modules/mod_proxy_http.so
LoadModule rewrite_module modules/mod_rewrite.so
LoadModule vhost_alias_module modules/mod_vhost_alias.so
```

Poi cerca questa riga e togli il `#` se presente:

```apache
Include conf/extra/httpd-vhosts.conf
```

**COSA FA**: dice ad Apache di leggere anche un secondo file di configurazione, quello dove metteremo le impostazioni di MechQuote.

Salva con `Ctrl+S` e chiudi Blocco Note.

> **SE NON FUNZIONA — non trovi una delle righe**: Apache è stato installato con una configurazione diversa. Aggiungi tu la riga in fondo al blocco dei `LoadModule` (cerca con `Ctrl+F` la prima `LoadModule` e scorri fino alla fine della lista).

### 6.4 Creare la configurazione del sito MechQuote

Apri un nuovo file con Blocco Note (sempre **come amministratore**): `C:\Apache24\conf\extra\httpd-vhosts.conf`.

Se il file esiste già, scorri fino in fondo e aggiungi questo blocco. Se non esiste, crealo nuovo con questo contenuto:

```apache
<VirtualHost *:80>
    ServerName mechquote.local
    DocumentRoot "C:/MechQuote/frontend/dist"

    <Directory "C:/MechQuote/frontend/dist">
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    # Quando l'utente clicca un link interno (es. /quotes/5), il file fisico
    # non esiste sul disco — è React Router a gestire la navigazione.
    # Queste regole dicono: se non è un file reale e non è una chiamata API,
    # servi index.html così React può fare il suo lavoro.
    RewriteEngine On
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteCond %{REQUEST_URI} !^/api/
    RewriteCond %{REQUEST_URI} !^/uploads/
    RewriteRule . /index.html [L]

    # Inoltra le chiamate API e i file caricati al motore Python
    ProxyPreserveHost On
    ProxyPass /api http://localhost:8000/api
    ProxyPassReverse /api http://localhost:8000/api
    ProxyPass /uploads http://localhost:8000/uploads
    ProxyPassReverse /uploads http://localhost:8000/uploads

    # File di log per diagnosticare problemi
    ErrorLog "logs/mechquote-error.log"
    CustomLog "logs/mechquote-access.log" common
</VirtualHost>
```

**COSA FA**, riga per riga:
- `<VirtualHost *:80>` — questa è la definizione del sito MechQuote, in ascolto su porta 80.
- `DocumentRoot` — dove stanno i file del sito (la cartella `dist` creata al §4).
- `<Directory ...>` — dà ad Apache il permesso di leggere quella cartella.
- `RewriteEngine On` + le righe seguenti — fanno funzionare le URL interne tipo `/quotes/5`.
- `ProxyPass /api ...` — quando l'utente fa una richiesta API, Apache la passa al motore Python.
- `ProxyPass /uploads ...` — idem per i file allegati (PDF, scansioni, ecc.).
- `ErrorLog` / `CustomLog` — Apache scrive cosa succede in 2 file dentro `C:\Apache24\logs`.

Salva con `Ctrl+S` e chiudi.

### 6.5 Verificare che la configurazione sia corretta

Da CMD **come amministratore**:

```cmd
httpd -t
```

**COSA FA**: Apache legge i file di configurazione e dice se sono validi, senza partire davvero. Risposta attesa: `Syntax OK`.

> **SE NON FUNZIONA — vedi "Syntax error on line X of httpd.conf"**: hai sbagliato qualcosa nella modifica del §6.3 o §6.4. Il messaggio dice il numero di riga e il file. Apri quel file con Blocco Note, vai alla riga indicata, controlla.
>
> Errori tipici:
> - `Cannot load mod_proxy.so` → il modulo non c'è. Controlla in `C:\Apache24\modules\` se il file `.so` esiste; se manca, hai una versione di Apache senza quel modulo.
> - `AH00526: Syntax error on line ...` con dentro `ProxyPass`: hai abilitato i moduli? Torna a §6.3.

### 6.6 Riavviare Apache

Se Apache **non è ancora un servizio Windows**, da CMD amministratore avvialo per la prima volta:

```cmd
httpd -k install
httpd -k start
```

**COSA FA**: `-k install` registra Apache come servizio Windows (parte automaticamente all'accensione del PC). `-k start` lo avvia subito.

Se Apache è **già un servizio Windows** (perché era già installato), riavvialo per applicare le modifiche:

```cmd
httpd -k restart
```

Oppure equivalentemente:

```cmd
net stop Apache2.4
net start Apache2.4
```

> **SE NON FUNZIONA — "Service Apache2.4 not found"**: Apache è installato ma non come servizio. Usa la versione `httpd -k install` qui sopra.

### 6.7 Test sul server stesso

Apri Chrome/Edge **sul PC server** e visita:

```
http://localhost
```

Devi vedere la pagina di **login MechQuote**. Se sì, Apache funziona e il setup tecnico è completo.

> **SE NON FUNZIONA — pagina bianca o "Cannot GET /"**: Apache non trova `index.html`. Verifica:
> 1. Esiste `C:\MechQuote\frontend\dist\index.html`?
> 2. Hai messo `DocumentRoot "C:/MechQuote/frontend/dist"` (con slash `/` non backslash `\`)?
>
> **SE NON FUNZIONA — "502 Bad Gateway"**: Apache va, ma il motore Python no. Verifica con `nssm status MechQuoteBackend` (deve essere `SERVICE_RUNNING`).

---

## 7. Aprire la porta 80 nel firewall di Windows

Affinché i dipendenti possano raggiungere il server dai loro PC, il firewall di Windows deve permettere il traffico in ingresso sulla porta 80.

### 7.1 Aprire l'editor del firewall

Premi `Win+R` (la combinazione apre la finestra "Esegui"), digita:

```
wf.msc
```

Premi Invio. Si apre **Windows Defender Firewall con sicurezza avanzata**.

> **SUGGERIMENTO**: su Windows 11 il vecchio Pannello di Controllo è nascosto. `Win+R` → `wf.msc` è il modo più affidabile per arrivare qui.

### 7.2 Creare la regola in entrata

1. Nel pannello a sinistra, clicca su **Regole connessioni in entrata**.
2. Nel pannello a destra, clicca su **Nuova regola...**
3. Si apre un wizard a 5 schermate:

**Schermata 1 — Tipo di regola**:
- Scegli **Porta** → Avanti

**Schermata 2 — Protocollo e porte**:
- Scegli **TCP**
- Sotto, scegli **Porte locali specifiche** e digita `80` → Avanti

**Schermata 3 — Azione**:
- Scegli **Consenti la connessione** → Avanti

**Schermata 4 — Profilo**:
- Lascia spuntato **Dominio** e **Privato**
- **Togli la spunta** da **Pubblico** (per sicurezza: non vogliamo esporre il server su reti pubbliche)
- → Avanti

**Schermata 5 — Nome**:
- Nome: `MechQuote HTTP`
- Descrizione: `Accesso MechQuote da LAN aziendale` (opzionale)
- → Fine

La regola appare nell'elenco delle regole in entrata.

### 7.3 Verifica dal PC di un dipendente

Vai su un altro PC della rete aziendale (o sullo stesso server come prova). Apri il browser e digita:

```
http://192.168.1.50
```

(sostituisci con l'IP del server scoperto al §3.2).

Devi vedere la pagina di login MechQuote.

> **SE NON FUNZIONA — il browser dice "impossibile raggiungere il sito"**:
> 1. Verifica che il server sia raggiungibile col ping. Da CMD del PC client: `ping 192.168.1.50`. Se il ping risponde, la rete c'è.
> 2. Se il ping risponde ma il browser no, hai un **altro firewall** in mezzo: antivirus aziendale (Norton, McAfee, Kaspersky), politiche di gruppo, o un firewall di rete. Chiedi al gestore di rete.
> 3. Se il ping NON risponde, problema di rete: il server è acceso? È sulla stessa subnet del client?

---

## 8. Primo accesso a MechQuote

### 8.1 Come trovare l'indirizzo del server (se ti sei dimenticato)

Sul PC server, apri CMD e digita:

```cmd
ipconfig
```

Cerca la sezione corrispondente alla tua scheda di rete (Ethernet o Wi-Fi aziendale) e la riga:

```
Indirizzo IPv4 . . . . . . . . . . : 192.168.1.50
```

Quell'IP è l'indirizzo del server.

> **SUGGERIMENTO — IGNORA**: gli IP che iniziano per `169.254.` (sono di emergenza), gli IP IPv6 (quelli con i due punti), e le righe relative a `Hyper-V`, `vEthernet`, `VirtualBox`, `VPN`.

### 8.2 Login

Da qualsiasi PC della LAN:

1. Apri il browser (Chrome, Edge, Firefox vanno tutti bene)
2. Digita nella barra degli indirizzi: `http://192.168.1.50` (l'IP del server)
3. Premi Invio

Vedi la pagina di login MechQuote.

Credenziali iniziali:

- **Utente**: `admin`
- **Password**: `admin`

### 8.3 Sicurezza iniziale (subito dopo il primo login)

1. **Cambia la password di admin**: in alto a destra → menu utente → o vai in `Impostazioni → Sistema → Utenti`, modifica `admin`, imposta una password robusta.
2. **Crea gli utenti aziendali**: stesso pannello, un utente per ogni dipendente, con il ruolo appropriato (`ufficio_tecnico`, `amministrazione`, `officina`).
3. **Compila i dati aziendali**: `Impostazioni → Azienda → Dati Azienda`. Servono per il PDF dei preventivi.
4. **Popola il catalogo**: `Impostazioni → Catalogo → Materiali / Lavorazioni & Macchine / Categorie`.

> **ATTENZIONE**: lasciare `admin` / `admin` è un grosso rischio di sicurezza. Cambia la password al primo login, sempre.

---

## 9. Backup automatico del database

Tutti i dati di MechQuote stanno in un singolo file: `C:\MechQuote\backend\mechquote.db`. Se quel file viene corrotto o cancellato, perdi tutto. Quindi automatizziamo un backup notturno.

### 9.1 Creare lo script di backup

Apri Blocco Note (non serve "come amministratore" qui) e incolla questo testo:

```powershell
$py = "C:\MechQuote\backend\venv\Scripts\python.exe"
$src = "C:\MechQuote\backend\mechquote.db"
$backupDir = "C:\MechQuote\backups"

# Crea la cartella backups se non esiste
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

# Backup WAL-aware del DB con timestamp nel nome file (es. mechquote_20260517-230000.db).
# Usa sqlite3.backup() del modulo standard Python (atomico, include le scritture
# ancora nel file .db-wal). Stesso identico metodo di update.bat — un solo modo
# di fare backup in tutto il progetto.
$dst = Join-Path $backupDir ("mechquote_" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".db")
& $py -c "import sqlite3,sys; s=sqlite3.connect(sys.argv[1]); d=sqlite3.connect(sys.argv[2]); s.backup(d); d.close(); s.close()" $src $dst
if ($LASTEXITCODE -ne 0) { throw "Backup FALLITO: sqlite3.backup() ha restituito errore." }

# Conserva solo gli ultimi 30 backup
Get-ChildItem "$backupDir\*.db" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 30 |
  Remove-Item -Force
```

Salva con nome `backup.ps1` (attenzione all'estensione `.ps1`, non `.txt`) in `C:\MechQuote\`.

> **COSA FA**: è uno script **PowerShell** (l'alternativa più moderna a CMD). Ogni volta che viene eseguito fa un **backup WAL-aware** del database in `C:\MechQuote\backups\` aggiungendo data+ora al nome, e tiene solo gli ultimi 30 backup. "WAL-aware" significa che include anche le ultime scritture che vivono ancora nel file `mechquote.db-wal` e non sono ancora confluite nel `.db`: una copia semplice del solo `.db` (`copy` / `Copy-Item`) le perderebbe. Il backup viene fatto chiamando `sqlite3.backup()` del modulo standard Python tramite il Python del venv del backend — non serve installare `sqlite3.exe` sul server.

### 9.2 Schedulare l'esecuzione ogni notte

Apri **Utilità di pianificazione** di Windows: premi `Win+R`, digita `taskschd.msc`, Invio.

1. Nel pannello destro clicca **Crea attività di base...**

**Schermata 1 — Nome**:
- Nome: `MechQuote Backup`
- Descrizione: `Backup giornaliero del database`
- → Avanti

**Schermata 2 — Trigger (quando)**:
- Scegli **Ogni giorno** → Avanti
- Ora di inizio: `23:00:00` → Avanti

**Schermata 3 — Azione**:
- Scegli **Avvia programma** → Avanti

**Schermata 4 — Programma**:
- Programma/script: `powershell.exe`
- Aggiungi argomenti: `-ExecutionPolicy Bypass -File "C:\MechQuote\backup.ps1"`
- → Avanti → Fine

> **COSA FA `-ExecutionPolicy Bypass`**: per impostazione predefinita, Windows blocca l'esecuzione di script PowerShell per sicurezza. Questo flag dice "fidati, esegui comunque". È sicuro perché lo script l'hai scritto tu e fa solo una copia di file.

### 9.3 Test del backup

Per verificare che funzioni senza aspettare le 23:00:

1. Nell'Utilità di pianificazione, trova l'attività `MechQuote Backup`
2. **Tasto destro → Esegui**
3. Apri Esplora risorse, vai in `C:\MechQuote\backups\` — deve esserci un file con nome tipo `mechquote_20260517-153022.db`

> **SUGGERIMENTO — copia anche su NAS / disco esterno**: i backup in `C:\MechQuote\backups\` proteggono da errori software, ma se il disco del server muore perdi tutto comunque. Configura una copia periodica della cartella `backups\` su NAS aziendale o disco esterno (settimanale o mensile).

---

## 9bis. Notifica settimanale "ordina utensili"

MechQuote tiene traccia degli utensili sotto la quantità minima. Possiamo schedulare una notifica automatica ogni martedì mattina che avvisi l'ufficio tecnico e amministrazione di generare l'ordine.

L'endpoint da chiamare è `POST /api/tools/notify-low-stock`. È idempotente: se viene chiamato più volte nello stesso giorno, non duplica la notifica.

### 9bis.1 Utente di servizio per lo scheduler

Dal CMD con venv attivo (vedi §3.1 per come riattivarlo):

```cmd
cd C:\MechQuote\backend
venv\Scripts\activate
python -c "from app.models import User; from app.core.security import get_password_hash; from app.core.database import SessionLocal; db = SessionLocal(); db.add(User(username='scheduler', hashed_password=get_password_hash('CAMBIA-QUESTA-PASSWORD'), full_name='Task Scheduler', role='amministrazione', is_active=True)); db.commit(); print('scheduler OK')"
```

**ATTENZIONE**: sostituisci `CAMBIA-QUESTA-PASSWORD` con una password lunga e casuale (es. generala con `python -c "import secrets; print(secrets.token_urlsafe(16))"`). Devi tenerla a portata di mano per il passo successivo.

### 9bis.2 Script PowerShell

Crea `C:\MechQuote\tools_alert.ps1` con questo contenuto (sostituisci `LA-PASSWORD-CHE-HAI-USATO` con la password dell'utente scheduler):

```powershell
$body = "username=scheduler&password=LA-PASSWORD-CHE-HAI-USATO"
$loginRes = Invoke-RestMethod -Uri "http://localhost:8000/api/auth/login" `
    -Method Post -Body $body `
    -ContentType "application/x-www-form-urlencoded"
$token = $loginRes.access_token

$headers = @{ "Authorization" = "Bearer $token" }
$res = Invoke-RestMethod -Uri "http://localhost:8000/api/tools/notify-low-stock" `
    -Method Post -Headers $headers

# Log della esecuzione
$logLine = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | low_stock=$($res.low_stock_count) created=$($res.notification_created) reason=$($res.reason)"
Add-Content -Path "C:\MechQuote\logs\tools_alert.log" -Value $logLine
```

### 9bis.3 Schedulare ogni martedì mattina

Apri Utilità di pianificazione (`Win+R` → `taskschd.msc`):

1. **Crea attività di base...**
2. Nome: `MechQuote Tools Alert` → Avanti
3. Trigger: **Settimanale** → Avanti
4. Giorno: spunta solo **Martedì**, ora `08:00:00` → Avanti
5. Azione: **Avvia un programma** → Avanti
6. Programma: `powershell.exe`
7. Argomenti: `-ExecutionPolicy Bypass -File "C:\MechQuote\tools_alert.ps1"`
8. → Fine

Risultato: ogni martedì alle 8:00, se ci sono utensili sotto la soglia, gli utenti `ufficio_tecnico` e `amministrazione` vedono nel pannello notifiche la voce "Ordinare utensili". Click → si apre la pagina utensili dove possono generare il PDF aggregato per fornitore.

> **SUGGERIMENTO**: in qualsiasi momento, dalla pagina **Utensili**, il bottone "Esporta PDF ordine" genera lo stesso PDF on-demand (stato attuale del magazzino).

---

## 10. Aggiornamenti futuri di MechQuote

Quando esce una nuova versione su GitHub, per applicarla sul server usa lo script `update.bat` già presente nella radice del progetto. **Non eseguire i comandi a mano**: lo script li mette in ordine, si ferma al primo errore e fa il backup del DB col metodo giusto.

Da CMD **come amministratore**:

```cmd
cd C:\MechQuote
update.bat
```

**COSA FA**, in ordine:

1. **Backup WAL-aware del database** in `C:\MechQuote\backups\` (stesso identico metodo del backup notturno del §9.1 — niente copia semplice del `.db`).
2. `git pull --ff-only` dal branch `main`: scarica i nuovi commit, ma rifiuta di procedere se la cronologia diverge (niente merge automatici).
3. Reinstalla le dipendenze (`pip install` / `npm install`) **solo se** `requirements.txt` o `package.json`/`package-lock.json` sono cambiati.
4. Ricostruisce il frontend (`npm run build`) e riavvia il servizio `MechQuoteBackend` via `nssm restart`.
5. Health check su `http://localhost:8000/`: se il backend non risponde entro ~30s, lo script si ferma con un messaggio chiaro indicando dove leggere i log.

Se un passo fallisce, lo script si ferma con `[STOP]` e un messaggio mirato: il sistema resta nello stato precedente (la build vecchia continua a girare), e `update.bat` è rilanciabile in sicurezza dopo il fix.

Apache **NON** va riavviato: serve solo file statici dalla cartella `dist`, che `npm run build` aggiorna automaticamente.

---

## 11. Troubleshooting — cosa fare se non funziona

| Sintomo | Possibile causa / soluzione |
|---|---|
| I PC client non raggiungono il server | Firewall: hai aperto la porta 80 (§7)? Ping da client risponde? |
| Browser mostra `502 Bad Gateway` | Il motore Python è spento. `nssm status MechQuoteBackend` → deve dire `SERVICE_RUNNING`. Avvialo con `nssm start MechQuoteBackend` |
| Login fallisce con `admin` / `admin` | Hai già cambiato la password. Se l'hai persa, ripeti il bootstrap del §3.3 (resetta admin a `admin`) |
| Pagina si carica ma click nei menu danno errore | Modulo `rewrite_module` non abilitato in Apache. Vedi §6.3 |
| Errore "PDF generation failed" cliccando "Scarica PDF" | Hai saltato `playwright install chromium` al §3.1. Da venv attivo: `playwright install chromium` poi `nssm restart MechQuoteBackend` |
| Browser dice `503 Service Unavailable` | Apache risponde ma il motore Python no. Controlla i log: `C:\MechQuote\logs\uvicorn.log` |
| Il server è lento sotto carico (5+ utenti contemporanei) | Per 10-12 utenti la configurazione standard basta. Non aumentare i `--workers` di uvicorn: con SQLite non serve. |
| File `.db` corrotto / errori SQL improvvisi | Ferma il servizio (`nssm stop MechQuoteBackend`), ripristina da `C:\MechQuote\backups\` l'ultimo backup buono, riavvia |
| Apache non parte dopo aver modificato la configurazione | `httpd -t` dice dove e perché. In caso ripristina la copia `httpd.conf.backup-originale` fatta al §6.1 |
| Notifiche utensili non arrivano il martedì | Apri `C:\MechQuote\logs\tools_alert.log`: l'ultima riga dice perché. Verifica anche dall'Utilità di pianificazione che il task `MechQuote Tools Alert` sia abilitato |
| Spazio disco quasi pieno sul C: | I backup in `C:\MechQuote\backups\` sono limitati a 30, ma ogni `.db` può essere grosso. Verifica anche `C:\MechQuote\logs\` (cresce nel tempo) |

**Log da consultare** quando qualcosa non va:
- Motore Python: `C:\MechQuote\logs\uvicorn.log`
- Apache errori: `C:\Apache24\logs\mechquote-error.log`
- Apache accessi: `C:\Apache24\logs\mechquote-access.log`
- Backup automatici: Utilità di pianificazione → cronologia attività
- Notifiche utensili: `C:\MechQuote\logs\tools_alert.log`

---

## 12. Note di sicurezza importanti

Anche per una rete aziendale, alcuni accorgimenti minimi:

- **SECRET_KEY** in `.env` (§3.2) deve essere una stringa casuale lunga. Se ti sei dimenticato di cambiarla, MechQuote si rifiuta di avviarsi con un dominio diverso da `localhost`.
- **Password di `admin`** va cambiata al primo login. Non lasciare `admin`/`admin` in produzione. Crea un utente per ogni dipendente, niente login condivisi.
- **Rate limit sui login**: MechQuote blocca dopo 5 tentativi falliti al minuto per IP. Protegge da chi prova a indovinare le password.
- **Backup periodici** non solo automatici sul server: copia la cartella `C:\MechQuote\backups\` su NAS o disco esterno almeno settimanalmente.
- **Aggiornamenti**: applica gli aggiornamenti di MechQuote (§10) periodicamente. Vengono inclusi fix di sicurezza.

---

## 13. HTTPS (opzionale, da fare quando serve)

La guida sopra usa HTTP in chiaro. Va bene per una **rete aziendale interna isolata**. Se vuoi cifrare il traffico (consigliato se la LAN è ampia, ha postazioni Wi-Fi non protette, o si pensa di esporre MechQuote via VPN):

1. **Procurati un certificato SSL**: o self-signed con OpenSSL, o richiedi alla CA aziendale (se ne avete una).
2. **Abilita `mod_ssl` in Apache** (procedura simile al §6.3): togli il `#` davanti a `LoadModule ssl_module modules/mod_ssl.so` in `httpd.conf`.
3. **Crea un secondo VirtualHost `*:443`** parallelo al `:80` nel file `httpd-vhosts.conf`, con le direttive `SSLEngine On`, `SSLCertificateFile`, `SSLCertificateKeyFile`.
4. **Apri la porta 443** nel firewall Windows (stessa procedura del §7).
5. **Aggiorna `ALLOWED_ORIGINS`** in `.env` cambiando `http://` in `https://`.

Con certificato self-signed i browser dei client mostrano un avviso al primo accesso, va accettato una volta. Con certificato della CA aziendale niente avvisi.

> **SUGGERIMENTO**: per una rete locale di 10-12 utenti, HTTP è quasi sempre sufficiente. Pensa a HTTPS solo se hai accessi da fuori ufficio (VPN, smart working) o reti Wi-Fi non controllate.

---

## Contatti

- **Repository**: https://github.com/Pecurus90/MechQuote.git
- **Manuale per sviluppatori**: `CLAUDE.md` nella cartella del progetto (serve solo a chi modifica il codice).

Per problemi di installazione o domande, consulta prima il §11 Troubleshooting. Se il problema persiste, controlla i log indicati e annota la riga di errore esatta — sarà la prima cosa che lo sviluppatore ti chiederà.
