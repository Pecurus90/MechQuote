<#
.SYNOPSIS
  MechQuote - script di aggiornamento manuale del server.

.DESCRIPTION
  Tira gli ultimi commit dal remoto (solo branch main, solo fast-forward),
  ricostruisce il frontend, riavvia il backend. Prima di tutto fa un backup
  WAL-aware del database.

  Lancio: da CMD COME AMMINISTRATORE
      cd C:\MechQuote
      update.bat
  (update.bat e' un lanciatore di una riga verso questo script.)

  Niente automatismi a tempo, niente git reset --hard cieco, niente push
  automatici. Fail-fast: ogni passo o riesce o si ferma con un messaggio
  chiaro. Rilanciabile in sicurezza dopo qualunque fallimento parziale
  (passi idempotenti).

  Convenzione messaggi: ogni [STOP] dice (a) cosa e' successo, (b) cosa
  fare per risolverlo, in italiano per un non-tecnico.
#>

# === Variabili di configurazione ====================================
$Repo           = 'C:\MechQuote'
$Backend        = Join-Path $Repo 'backend'
$Frontend       = Join-Path $Repo 'frontend'
$VenvPy         = Join-Path $Backend 'venv\Scripts\python.exe'
$DbFile         = Join-Path $Backend 'mechquote.db'
$BackupDir      = Join-Path $Repo 'backups'
$Service        = 'MechQuoteBackend'
$ExpectedBranch = 'main'
$HealthUrl      = 'http://localhost:8000/api/health'
$HealthMaxTries = 15
$LogFile        = Join-Path $Repo 'logs\uvicorn.log'

# Stato disponibile ai messaggi di rollback (popolato al passo 4).
$Script:PrevSha = $null


# === Helper di uscita ===============================================
# Stampa il messaggio, opzionalmente aggiunge il comando di rollback,
# attende Invio (cosi' la finestra resta leggibile anche al doppio-clic),
# poi esce con codice 1.
function Fail {
    param(
        [Parameter(Mandatory)][string]$Message,
        [switch]$ShowRollback
    )
    Write-Host ''
    Write-Host $Message
    if ($ShowRollback -and $Script:PrevSha) {
        Write-Host ''
        Write-Host '        Per tornare allo stato di prima di update.bat:'
        Write-Host "            cd $Repo"
        Write-Host "            git reset --hard $($Script:PrevSha)"
        Write-Host "            nssm restart $Service"
    }
    Write-Host ''
    [void](Read-Host 'Leggi il messaggio qui sopra, poi premi Invio per chiudere')
    exit 1
}

# Rete di sicurezza: se per qualche motivo un'eccezione non gestita
# arriva fin qui (es. cmdlet che lancia, IO error inatteso), la
# trasformiamo in un Fail leggibile invece di crashare la console.
trap {
    Write-Host ''
    Write-Host "[STOP] Errore inatteso non gestito: $($_.Exception.Message)"
    if ($_.InvocationInfo) {
        Write-Host ''
        Write-Host "        Punto: $($_.InvocationInfo.PositionMessage)"
    }
    Write-Host ''
    [void](Read-Host 'Leggi il messaggio qui sopra, poi premi Invio per chiudere')
    exit 1
}


# === Header =========================================================
Write-Host ''
Write-Host '============================================================'
Write-Host "  MechQuote update -- $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host '============================================================'
Write-Host ''


# === 1) Privilegi amministratore ====================================
$principal = New-Object Security.Principal.WindowsPrincipal(
    [Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Fail @"
[STOP] Devi lanciare update.bat da una CMD aperta come amministratore.
       Serve per riavviare il servizio backend (nssm restart).
       Come fare: cerca "Prompt dei comandi" nel menu Start, tasto destro
       sull'icona -> "Esegui come amministratore". Poi:
           cd $Repo
           update.bat
"@
}
Write-Host '[ OK ] CMD come amministratore.'


# === 2) Prerequisiti ================================================
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Fail @"
[STOP] Git non e' disponibile per questo utente (amministratore).
       Probabile che sia installato nel PATH del tuo utente normale ma
       non per l'amministratore. Verifica aprendo una nuova CMD admin
       e provando:  git --version
       Se manca, reinstalla "Git for Windows" scegliendo l'opzione
       "add to PATH per tutti gli utenti".
"@
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Fail @"
[STOP] npm non e' disponibile per questo utente (amministratore).
       Probabile che Node.js sia installato nel PATH del tuo utente
       normale ma non per l'amministratore. Verifica con:  npm --version
       Se manca, reinstalla Node.js scegliendo l'opzione
       "add to PATH per tutti gli utenti".
"@
}
if (-not (Test-Path -LiteralPath $VenvPy)) {
    Fail @"
[STOP] Ambiente Python del backend non trovato in:
       $VenvPy
       Significa che il backend non e' installato o e' stato spostato.
       Reinstallalo seguendo INSTALLAZIONE.md, paragrafo 3.1
       (creazione del venv: python -m venv venv, pip install, ecc.).
"@
}
if (-not (Test-Path -LiteralPath (Join-Path $Repo '.git'))) {
    Fail @"
[STOP] La cartella $Repo non e' una repository git
       (manca la sottocartella nascosta ".git"). Probabile che la
       cartella sia stata copiata invece di clonata da GitHub.
       Riclonala con:
           git clone https://github.com/Pecurus90/MechQuote.git $Repo
       (devi prima rimuovere la cartella copiata).
"@
}
if (-not (Test-Path -LiteralPath $DbFile)) {
    Fail @"
[STOP] Database non trovato in:
       $DbFile
       Vuol dire che il backend non e' mai stato avviato, oppure il
       file e' stato spostato altrove. Avvia il backend almeno una
       volta (es. nssm start $Service) per crearlo, poi rilancia
       update.bat.
"@
}
if (-not (Get-Service -Name $Service -ErrorAction SilentlyContinue)) {
    Fail @"
[STOP] Servizio Windows "$Service" non trovato.
       Controlla con:  nssm status $Service
       Se sul server il servizio ha un nome diverso (probabile se
       l'installazione e' stata personalizzata), modifica la variabile
       `$Service in cima a questo script col nome corretto.
       Per vedere tutti i servizi installati con NSSM:
           nssm list
       Oppure tutti i servizi Windows:
           sc query state= all
"@
}
Write-Host "[ OK ] Prerequisiti (git, npm, venv, repo, db, servizio `"$Service`")."


# === 3) Cartella backups ===========================================
if (-not (Test-Path -LiteralPath $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
    Write-Host "[ OK ] Cartella backup creata: $BackupDir"
}


# === 4) Stato attuale del repo =====================================
Set-Location -LiteralPath $Repo
$CurBranch      = (git rev-parse --abbrev-ref HEAD).Trim()
$Script:PrevSha = (git rev-parse --short HEAD).Trim()
Write-Host ''
Write-Host "Branch corrente:   $CurBranch"
Write-Host "Commit corrente:   $($Script:PrevSha)"
Write-Host ''


# === 5) Branch deve essere main ====================================
if ($CurBranch -ne $ExpectedBranch) {
    Fail @"
[STOP] Il server e' su un branch diverso da "$ExpectedBranch":
       attualmente e' su "$CurBranch".
       update.bat aggiorna solo dal branch "$ExpectedBranch".
       Per tornare su "$ExpectedBranch":
           git checkout $ExpectedBranch
       (se ci sono modifiche locali, gestiscile prima a mano:
       git status per vederle, poi committale o scartale).
"@
}
Write-Host "[ OK ] Branch atteso ($ExpectedBranch)."


# === 6) Backup DB WAL-aware ========================================
# Get-Date con formato esplicito: indipendente dal locale Windows.
# sqlite3.backup() del Python venv = WAL-aware (include il file -wal).
$ts      = Get-Date -Format 'yyyyMMdd-HHmmss'
$BkpPath = Join-Path $BackupDir "mechquote.db.bak-$ts"
Write-Host "[ .. ] Backup DB WAL-aware -> $BkpPath"

& $VenvPy -c "import sqlite3,sys; s=sqlite3.connect(sys.argv[1]); d=sqlite3.connect(sys.argv[2]); s.backup(d); d.close(); s.close()" $DbFile $BkpPath

if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $BkpPath)) {
    Fail @"
[STOP] Backup del database FALLITO. Niente viene aggiornato, il sistema
       resta com'e'. Cause probabili:
         - la cartella di backup non e' scrivibile dall'amministratore;
         - disco C: pieno (controlla spazio libero in Esplora risorse);
         - il file del database e' bloccato da un altro processo.
       Cartella di destinazione del backup:  $BackupDir
"@
}
Write-Host "[ OK ] Backup DB completato: $BkpPath"


# === 7) Working tree pulito ========================================
$dirty = git status --porcelain --untracked-files=no
if ($dirty) {
    Write-Host ''
    Write-Host '[STOP] Ci sono modifiche locali non committate sul server:'
    Write-Host '       qualcuno ha toccato dei file a mano. Elenco:'
    git status --short --untracked-files=no
    Fail @"

       Vanno annullate prima di aggiornare. Opzioni:
         - se le modifiche sono accidentali, scartale UNA per UNA con:
               git checkout -- <nome-file>
         - se invece sembrano importanti, NON cancellarle: chiama lo
           sviluppatore prima di proseguire.
       Poi rilancia update.bat.
"@
}
Write-Host '[ OK ] Working tree pulito.'


# === 8) git fetch ==================================================
Write-Host '[ .. ] git fetch ...'
git fetch
if ($LASTEXITCODE -ne 0) {
    Fail @"
[STOP] git fetch fallito: non riesco a contattare GitHub.
       Verifica nell'ordine:
         - la connessione internet del server funziona (es. apri Edge
           e prova a raggiungere github.com);
         - il firewall aziendale non blocca le connessioni in uscita
           verso github.com:443;
         - se il repo richiede credenziali, sono ancora valide.
"@
}
Write-Host '[ OK ] git fetch completato.'


# === 9) git pull --ff-only =========================================
Write-Host '[ .. ] git pull --ff-only ...'
git pull --ff-only
if ($LASTEXITCODE -ne 0) {
    Fail -ShowRollback @"
[STOP] Aggiornamento del codice rifiutato: sul server c'e' qualcosa che
       non sta su GitHub (qualcuno ha committato a mano, oppure c'e'
       stato un reset locale). Non e' un problema risolvibile da
       update.bat: contatta lo sviluppatore.
"@
}
$NewSha = (git rev-parse --short HEAD).Trim()
Write-Host "[ OK ] Pull completato: $($Script:PrevSha) -> $NewSha"
if ($NewSha -eq $Script:PrevSha) {
    Write-Host '       Nessun nuovo commit. Ricostruisco e riavvio comunque (per sicurezza).'
}


# === 10) Detect dipendenze cambiate ================================
$frontDeps = $false
$backDeps  = $false
if ($NewSha -ne $Script:PrevSha) {
    $changed = git diff --name-only $Script:PrevSha $NewSha
    foreach ($f in $changed) {
        switch ($f) {
            'frontend/package.json'      { $frontDeps = $true }
            'frontend/package-lock.json' { $frontDeps = $true }
            'backend/requirements.txt'   { $backDeps  = $true }
        }
    }
}


# === 11) pip install se requirements.txt cambiato ==================
if ($backDeps) {
    Write-Host '[ .. ] requirements.txt cambiato -> pip install ...'
    & $VenvPy -m pip install -r (Join-Path $Backend 'requirements.txt')
    if ($LASTEXITCODE -ne 0) {
        Fail -ShowRollback @"
[STOP] Installazione delle nuove librerie Python FALLITA.
       Leggi le righe rosse qui sopra: di solito dicono qual e' il
       pacchetto che da problema (rete, versione incompatibile,
       compilazione che richiede strumenti mancanti).
       Il backend NON e' stato riavviato, sta ancora girando con il
       codice precedente.
"@
    }
    Write-Host '[ OK ] Dipendenze backend aggiornate.'
} else {
    Write-Host '[ OK ] requirements.txt invariato (pip install saltato).'
}


# === 12) npm install se package.json/lock cambiati =================
Set-Location -LiteralPath $Frontend
if ($frontDeps) {
    Write-Host '[ .. ] package.json/lock cambiato -> npm install ...'
    npm install
    if ($LASTEXITCODE -ne 0) {
        Fail -ShowRollback @"
[STOP] Installazione delle nuove librerie JavaScript FALLITA.
       Leggi le righe qui sopra: di solito dicono il pacchetto che
       da' problema o un errore di rete.
       Il frontend NON e' stato ancora ricostruito: la dist/ vecchia
       e' ancora a posto, Apache continua a servire la versione
       precedente del sito.
"@
    }
    Write-Host '[ OK ] Dipendenze frontend aggiornate.'
} else {
    Write-Host '[ OK ] package.json invariato (npm install saltato).'
}


# === 13) npm run build =============================================
Write-Host '[ .. ] npm run build ...'
npm run build
if ($LASTEXITCODE -ne 0) {
    Fail -ShowRollback @"
[STOP] Costruzione del frontend FALLITA (npm run build).
       La cartella dist/ precedente e' ancora a posto: Apache continua
       a servire la versione vecchia del sito, gli utenti non vedono
       differenze. Leggi le righe qui sopra per capire l'errore di
       compilazione.
"@
}
Write-Host "[ OK ] Frontend ricostruito ($Frontend\dist)."


# === 14) Restart backend via NSSM ==================================
Write-Host "[ .. ] nssm restart $Service ..."
nssm restart $Service
if ($LASTEXITCODE -ne 0) {
    Fail -ShowRollback @"
[STOP] Riavvio del servizio backend FALLITO.
       Controlla subito:
           nssm status $Service
       I log del backend sono in:
           $LogFile
       Apri il file e guarda le ultime righe: di solito dicono perche'
       non e' partito.
"@
}
Write-Host '[ OK ] Comando di restart inviato. Attendo che il backend risponda...'


# === 15) Health check ==============================================
# Invoke-WebRequest -ErrorAction Stop: 4xx/5xx e connection refused
# lanciano eccezione -> catch -> retry. 200 sul corpo => ok.
$healthy = $false
for ($i = 1; $i -le $HealthMaxTries; $i++) {
    try {
        $resp = Invoke-WebRequest -UseBasicParsing -Uri $HealthUrl `
                                  -TimeoutSec 2 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            $healthy = $true
            break
        }
    } catch {
        # 4xx / 5xx / connection refused / timeout: backend non ancora
        # pronto. Aspetto e ritento.
    }
    Start-Sleep -Seconds 2
}
if (-not $healthy) {
    Fail -ShowRollback @"
[STOP] Il backend non risponde su $HealthUrl dopo ~60 secondi:
       il riavvio non e' andato a buon fine.
       Cosa controllare nell'ordine:
         1) i log del backend: apri il file
                $LogFile
            e guarda le ULTIME righe (di solito dicono l'errore);
         2) lo stato del servizio:
                nssm status $Service
"@
}
Write-Host "[ OK ] Backend risponde correttamente su $HealthUrl."


# === 16) Esito finale ==============================================
Write-Host ''
Write-Host '============================================================'
Write-Host '  AGGIORNAMENTO COMPLETATO'
Write-Host '============================================================'
Write-Host "  Backup DB:      $BkpPath"
Write-Host "  Aggiornato:     $($Script:PrevSha)  ->  $NewSha"
Write-Host "  Frontend dist:  $Frontend\dist"
Write-Host "  Servizio:       $Service riavviato e risponde"
Write-Host '============================================================'
Write-Host ''
Write-Host 'Se qualcosa non va in futuro, per tornare a questo commit precedente:'
Write-Host ''
Write-Host "  cd $Repo"
Write-Host "  git reset --hard $($Script:PrevSha)"
Write-Host '  cd frontend'
Write-Host '  npm run build'
Write-Host "  nssm restart $Service"
Write-Host ''
Write-Host "Backup DB pre-aggiornamento: $BkpPath"
Write-Host '(per ripristinarlo: arresta il servizio, copia il .bak su mechquote.db, riavvia)'
Write-Host ''
[void](Read-Host 'Leggi il messaggio qui sopra, poi premi Invio per chiudere')
exit 0
