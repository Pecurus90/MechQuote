# Installazione MechQuote su Windows 11 server

> Guida passo-passo per installare MechQuote su un PC Windows 11 che farà da **server LAN aziendale**. Pensata per 10-12 utenti che si collegano dai loro PC tramite browser.

**Schema finale:**

```
┌────────────────────────────────────────────┐
│  Server Windows 11                          │
│                                             │
│   Apache 2.4 (porta 80)                     │
│   ├─ serve i file statici del frontend      │
│   └─ inoltra /api/* → backend porta 8000    │
│                                             │
│   Uvicorn (porta 8000) come servizio        │
│   ├─ FastAPI + SQLAlchemy                   │
│   └─ SQLite (mechquote.db)                  │
│                                             │
│   Task Scheduler: backup automatico DB      │
└────────────────────────────────────────────┘
         ↑
         http://192.168.x.x
         │
   [Client LAN]  browser  ×  10-12 utenti
```

Tutti i client si collegano tramite browser a `http://IP-DEL-SERVER`. Nessuna installazione lato client.

---

## 1. Prerequisiti

Sul server devi installare (una sola volta):

| Software | Versione | Download |
|---|---|---|
| **Python** | 3.11 (qualsiasi 3.9+) | https://www.python.org/downloads/windows/ — **spunta "Add Python to PATH"** durante l'installazione |
| **Node.js** | 20 LTS | https://nodejs.org — installer Windows MSI |
| **Git for Windows** | ultima | https://git-scm.com/download/win |
| **Apache HTTP Server** | 2.4 | Già presente (verifica con `httpd -v` da CMD). Se manca: https://www.apachelounge.com/download/ |
| **NSSM** | 2.24 | https://nssm.cc/release/nssm-2.24.zip — estrai `nssm.exe` da `win64\` e copialo in `C:\Windows\System32` |

Verifica al termine in **CMD**:

```cmd
python --version
node --version
git --version
httpd -v
nssm --version
```

Devi vedere il numero di versione di ciascuno.

---

## 2. Clone del progetto

```cmd
cd C:\
git clone https://github.com/Pecurus90/MechQuote.git
cd MechQuote
```

Tutto il resto della guida assume che il progetto sia in `C:\MechQuote`.

---

## 3. Setup backend (FastAPI + Python)

```cmd
cd C:\MechQuote\backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
```

Il comando `playwright install chromium` scarica un browser Chromium dedicato per generare i PDF (~150 MB). È normale che impieghi qualche minuto.

### 3.1 Configurazione `.env`

```cmd
copy .env.example .env
```

Apri `C:\MechQuote\backend\.env` con un editor di testo (Notepad va bene) e modifica:

**SECRET_KEY** — genera una chiave random (NON lasciare il default, l'app si rifiuta di partire altrimenti). Dal prompt CMD con il venv attivo:

```cmd
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Copia l'output e incollalo come `SECRET_KEY=...`.

**ALLOWED_ORIGINS** — l'IP del server in LAN. Trovalo con:

```cmd
ipconfig
```

Cerca la riga "IPv4 Address" della tua scheda di rete (es. `192.168.1.50`). Modifica il file:

```
ALLOWED_ORIGINS=http://192.168.1.50
```

Se il server ha un hostname interno (es. `mechquote.azienda.local`), puoi metterlo come secondo valore separato da virgola:

```
ALLOWED_ORIGINS=http://192.168.1.50,http://mechquote.azienda.local
```

### 3.2 Bootstrap del primo utente admin

Con il venv ancora attivo:

```cmd
python -c "from app.models import User; from app.core.security import get_password_hash; from app.core.database import SessionLocal; db = SessionLocal(); existing = db.query(User).filter(User.username == 'admin').first(); existing.hashed_password = get_password_hash('admin') if existing else None; db.add(User(username='admin', hashed_password=get_password_hash('admin'), full_name='Admin', role='admin', is_active=True)) if not existing else None; db.commit(); print('admin OK')"
```

Crea (o resetta) l'utente `admin` con password `admin`. **Cambia la password subito dopo il primo login** da Settings → Utenti.

### 3.3 Test rapido del backend

Sempre dal venv attivo:

```cmd
venv\Scripts\uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Apri un nuovo CMD e prova:

```cmd
curl http://localhost:8000/api/health
```

Devi vedere `{"status":"ok","app":"MechQuote"}`. Se sì, ferma uvicorn con `Ctrl+C` — più avanti lo trasformiamo in servizio Windows.

---

## 4. Setup frontend (build statico)

```cmd
cd C:\MechQuote\frontend
npm install
npm run build
```

Output finale: `C:\MechQuote\frontend\dist\` contiene HTML/CSS/JS pronti per essere serviti da Apache.

---

## 5. Uvicorn come servizio Windows (via NSSM)

Vogliamo che il backend parta automaticamente all'accensione del server e si riavvii in caso di crash. NSSM (Non-Sucking Service Manager) lo fa.

Da CMD **come amministratore**:

```cmd
nssm install MechQuoteBackend "C:\MechQuote\backend\venv\Scripts\uvicorn.exe"
```

Si apre una finestra grafica. Compila i campi:

**Tab "Application":**
- **Path**: già compilato → `C:\MechQuote\backend\venv\Scripts\uvicorn.exe`
- **Startup directory**: `C:\MechQuote\backend`
- **Arguments**: `app.main:app --host 127.0.0.1 --port 8000`

**Tab "Details":**
- **Display name**: `MechQuote Backend`
- **Description**: `MechQuote API server (FastAPI)`
- **Startup type**: `Automatic`

**Tab "I/O":**
- **Output (stdout)**: `C:\MechQuote\logs\uvicorn.log` (crea prima la cartella `C:\MechQuote\logs` da Esplora risorse)
- **Error (stderr)**: stesso file

Clicca **Install service**. Poi:

```cmd
nssm start MechQuoteBackend
nssm status MechQuoteBackend
```

Status atteso: `SERVICE_RUNNING`. Test:

```cmd
curl http://localhost:8000/api/health
```

Se non va, controlla il log: `C:\MechQuote\logs\uvicorn.log`.

---

## 6. Apache: serve frontend + reverse proxy verso backend

### 6.1 Abilita i moduli necessari

Apri `httpd.conf` (di solito `C:\Apache24\conf\httpd.conf`) e assicurati che queste righe NON siano commentate (togli il `#` se c'è):

```apache
LoadModule proxy_module modules/mod_proxy.so
LoadModule proxy_http_module modules/mod_proxy_http.so
LoadModule rewrite_module modules/mod_rewrite.so
LoadModule vhost_alias_module modules/mod_vhost_alias.so
```

Cerca anche:

```apache
Include conf/extra/httpd-vhosts.conf
```

e togli il `#` se presente.

### 6.2 Configura il VirtualHost MechQuote

Apri (o crea) `C:\Apache24\conf\extra\httpd-vhosts.conf` e aggiungi in fondo:

```apache
<VirtualHost *:80>
    ServerName mechquote.local
    DocumentRoot "C:/MechQuote/frontend/dist"

    <Directory "C:/MechQuote/frontend/dist">
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    # SPA fallback: per qualsiasi URL che non sia un file vero (es. /quotes/5),
    # Apache serve index.html, e React Router gestisce la navigazione
    RewriteEngine On
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteCond %{REQUEST_URI} !^/api/
    RewriteCond %{REQUEST_URI} !^/uploads/
    RewriteRule . /index.html [L]

    # Proxy delle chiamate API e dei file caricati verso uvicorn
    ProxyPreserveHost On
    ProxyPass /api http://localhost:8000/api
    ProxyPassReverse /api http://localhost:8000/api
    ProxyPass /uploads http://localhost:8000/uploads
    ProxyPassReverse /uploads http://localhost:8000/uploads

    ErrorLog "logs/mechquote-error.log"
    CustomLog "logs/mechquote-access.log" common
</VirtualHost>
```

### 6.3 Riavvia Apache

Da CMD **come amministratore**:

```cmd
httpd -t
```

Deve stampare `Syntax OK`. Se segnala errori sistema prima di andare avanti.

```cmd
httpd -k restart
```

Oppure, se Apache è installato come servizio:

```cmd
net stop Apache2.4
net start Apache2.4
```

### 6.4 Test locale

Sul server stesso, browser → `http://localhost`. Devi vedere la pagina di login MechQuote. Se sì, sei pronto per i client.

---

## 7. Firewall Windows (apri porta 80 in entrata)

Pannello di controllo → **Windows Defender Firewall** → **Impostazioni avanzate** → **Regole connessioni in entrata** → **Nuova regola**:

- Tipo: **Porta**
- Protocollo: **TCP**, **Porte locali specifiche**: `80`
- Azione: **Consenti la connessione**
- Profilo: **Dominio**, **Privata** (deseleziona "Pubblica" se sei in LAN aziendale)
- Nome: **MechQuote HTTP**

Verifica da un PC client: apri il browser → `http://192.168.x.x` (IP del server). Devi vedere il login.

---

## 8. Primo accesso

1. Da qualsiasi PC della LAN: browser → `http://IP-SERVER`
2. Login: `admin` / `admin`
3. **Cambia subito la password admin**: Settings → Utenti → modifica admin
4. Crea gli altri utenti aziendali (con ruoli appropriati): Settings → Utenti
5. Verifica i dati azienda: Settings → Dati Azienda
6. Popola Centri di costo, Materiali, Trattamenti, Lavorazioni nel Catalogo

---

## 9. Backup automatico del database

Il database SQLite è un singolo file in `C:\MechQuote\backend\mechquote.db`. **Vai a perderlo se non fai backup**.

### 9.1 Script di backup

Crea `C:\MechQuote\backup.ps1` (PowerShell) con questo contenuto:

```powershell
$src = "C:\MechQuote\backend\mechquote.db"
$backupDir = "C:\MechQuote\backups"

# Crea cartella se non esiste
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

# Copia con timestamp
$dst = Join-Path $backupDir ("mechquote_" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".db")
Copy-Item $src $dst

# Tieni solo gli ultimi 30 backup
Get-ChildItem "$backupDir\*.db" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 30 |
  Remove-Item -Force
```

### 9.2 Schedula con Task Scheduler

- Apri **Utilità di pianificazione** (Task Scheduler)
- Crea attività di base → Nome: `MechQuote Backup`
- Trigger: **Ogni giorno** alle **23:00**
- Azione: **Avvia un programma**
  - Programma: `powershell.exe`
  - Argomenti: `-ExecutionPolicy Bypass -File "C:\MechQuote\backup.ps1"`
- Finalizza

I backup si accumuleranno in `C:\MechQuote\backups\` (ultimi 30 conservati). Considera anche di copiare questa cartella su disco esterno / NAS aziendale periodicamente.

---

## 10. Aggiornamenti futuri di MechQuote

Quando ci sono nuove versioni sul repo GitHub:

```cmd
cd C:\MechQuote
git pull

cd backend
venv\Scripts\activate
pip install -r requirements.txt

cd ..\frontend
npm install
npm run build

nssm restart MechQuoteBackend
```

Apache di solito non va riavviato (i file statici vengono ri-letti, il proxy non cambia). Se aggiungi nuove migrazioni DB, queste si applicano automaticamente al riavvio di MechQuoteBackend.

**Prima di un aggiornamento importante**: copia manualmente il file `mechquote.db` da parte (snapshot).

---

## 11. Troubleshooting

| Sintomo | Possibile causa / soluzione |
|---|---|
| Client non raggiunge il server | Firewall Windows: regola porta 80 in entrata aperta? |
| `502 Bad Gateway` da Apache | Uvicorn non è in esecuzione → `nssm status MechQuoteBackend` |
| Login fallisce con `admin`/`admin` | Password è stata cambiata. Reset via snippet bootstrap in §3.2 |
| PDF non si genera (errore generico) | Chromium di Playwright non installato → `playwright install chromium` con venv attivo |
| `503 Service Unavailable` | Apache sì, ma il backend non risponde su :8000. Vedi log uvicorn |
| Il server è lento sotto carico | Mantieni `--workers 1` come da configurazione: per 10-12 utenti basta abbondantemente. Multi-worker richiederebbe Redis per il rate limit (oggi NON serve) |
| Errori dopo restore di un backup `.db` | Ferma il servizio prima del restore: `nssm stop MechQuoteBackend`, copia il file, `nssm start MechQuoteBackend` |

**Log da consultare**:
- Backend uvicorn: `C:\MechQuote\logs\uvicorn.log`
- Apache errors: `C:\Apache24\logs\mechquote-error.log`
- Apache access: `C:\Apache24\logs\mechquote-access.log`

---

## 12. Sicurezza — note importanti

- **SECRET_KEY** in `.env` deve essere random (vedi §3.1). Se rimane il default, il backend si rifiuta di partire quando rileva un dominio non-localhost in `ALLOWED_ORIGINS`.
- **Password admin di default (`admin`)** va cambiata al primo login. Crea utenti dedicati per ogni dipendente, niente login condiviso.
- **Rate limit login** attivo: 5 tentativi falliti/minuto/IP. Protegge da brute-force.
- **Backup**: oltre allo schedule automatico, fai snapshot manuali prima di interventi importanti (CLAUDE.md §2.E descrive perché).

---

## 13. HTTPS (opzionale, da fare in futuro)

La guida qui sopra usa HTTP in chiaro, accettabile per LAN aziendale isolata. Se vuoi cifrare il traffico (consigliato se la LAN è ampia, ha postazioni Wi-Fi non protette, o si pensa di accedere da VPN):

1. Genera un certificato SSL (self-signed con OpenSSL o richiedi alla CA aziendale)
2. Abilita `mod_ssl` in Apache (`LoadModule ssl_module modules/mod_ssl.so`)
3. Crea un VirtualHost `*:443` parallelo al `:80`, con `SSLEngine On` + cert/key
4. Apri porta 443 nel firewall Windows
5. Aggiorna `ALLOWED_ORIGINS` in `.env` con `https://...`

Per i certificati self-signed, i browser dei client mostreranno un avviso al primo accesso; va accettato una volta. Con certificato CA aziendale niente avvisi.

---

## Contatti

Repo: https://github.com/Pecurus90/MechQuote.git
Manuale dev: `CLAUDE.md` nella root del repo (per chi deve modificare il codice).
