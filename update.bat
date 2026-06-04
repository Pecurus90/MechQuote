@echo off
setlocal

REM ============================================================
REM  MechQuote - script di aggiornamento manuale del server
REM ============================================================
REM
REM  Cosa fa: tira gli ultimi commit dal remoto (solo branch main,
REM  solo fast-forward), ricostruisce il frontend, riavvia il
REM  backend. Prima di tutto fa un backup WAL-aware del database.
REM
REM  Lancio: da CMD COME AMMINISTRATORE
REM    cd C:\MechQuote
REM    update.bat
REM
REM  Niente automatismi a tempo, niente git reset --hard cieco,
REM  niente push automatici. Fail-fast: ogni passo o riesce o si
REM  ferma con un messaggio chiaro. Rilanciabile in sicurezza dopo
REM  qualunque fallimento parziale (passi idempotenti).
REM
REM  Convenzione messaggi: ogni [STOP] dice (a) cosa e' successo,
REM  (b) cosa fare per risolverlo, in italiano per un non-tecnico.
REM ============================================================

REM ─── Variabili di configurazione ────────────────────────────
set "REPO=C:\MechQuote"
set "BACKEND=%REPO%\backend"
set "FRONTEND=%REPO%\frontend"
set "VENV_PY=%BACKEND%\venv\Scripts\python.exe"
set "DB_FILE=%BACKEND%\mechquote.db"
set "BACKUP_DIR=%REPO%\backups"
set "SERVICE=MechQuoteBackend"
set "EXPECTED_BRANCH=main"
set "HEALTH_URL=http://localhost:8000/api/health"
set "HEALTH_MAX_TRIES=15"
set "LOG_FILE=%REPO%\logs\uvicorn.log"
set "WAIT_PROMPT=Leggi il messaggio qui sopra, poi premi un tasto per chiudere."

echo.
echo ============================================================
echo  MechQuote update -- %date% %time%
echo ============================================================
echo.

REM ─── 1) Check admin (serve per nssm restart) ────────────────
net session >nul 2>&1
if errorlevel 1 (
  echo [STOP] Devi lanciare update.bat da una CMD aperta come amministratore.
  echo        Serve per riavviare il servizio backend (nssm restart).
  echo        Come fare: cerca "Prompt dei comandi" nel menu Start, tasto destro
  echo        sull'icona -^> "Esegui come amministratore". Poi:
  echo            cd %REPO%
  echo            update.bat
  goto :end_fail
)
echo [ OK ] CMD come amministratore.

REM ─── 2) Prerequisiti ────────────────────────────────────────
where git >nul 2>&1
if errorlevel 1 (
  echo [STOP] Git non e' disponibile per questo utente (amministratore).
  echo        Probabile che sia installato nel PATH del tuo utente normale ma
  echo        non per l'amministratore. Verifica aprendo una nuova CMD admin e
  echo        provando:  git --version
  echo        Se manca, reinstalla "Git for Windows" scegliendo l'opzione
  echo        "add to PATH per tutti gli utenti".
  goto :end_fail
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [STOP] npm non e' disponibile per questo utente (amministratore).
  echo        Probabile che Node.js sia installato nel PATH del tuo utente
  echo        normale ma non per l'amministratore. Verifica con:  npm --version
  echo        Se manca, reinstalla Node.js scegliendo l'opzione
  echo        "add to PATH per tutti gli utenti".
  goto :end_fail
)
if not exist "%VENV_PY%" (
  echo [STOP] Ambiente Python del backend non trovato in:
  echo        %VENV_PY%
  echo        Significa che il backend non e' installato o e' stato spostato.
  echo        Reinstallalo seguendo INSTALLAZIONE.md, paragrafo 3.1
  echo        (creazione del venv: python -m venv venv, pip install, ecc.).
  goto :end_fail
)
if not exist "%REPO%\.git" (
  echo [STOP] La cartella %REPO% non e' una repository git
  echo        (manca la sottocartella nascosta ".git"). Probabile che la cartella
  echo        sia stata copiata invece di clonata da GitHub.
  echo        Riclonala con:
  echo            git clone https://github.com/Pecurus90/MechQuote.git %REPO%
  echo        (devi prima rimuovere la cartella copiata).
  goto :end_fail
)
if not exist "%DB_FILE%" (
  echo [STOP] Database non trovato in:
  echo        %DB_FILE%
  echo        Vuol dire che il backend non e' mai stato avviato, oppure il file
  echo        e' stato spostato altrove. Avvia il backend almeno una volta
  echo        (es. nssm start %SERVICE%) per crearlo, poi rilancia update.bat.
  goto :end_fail
)

REM Verifica esistenza servizio NSSM
sc query %SERVICE% >nul 2>&1
if errorlevel 1 (
  echo [STOP] Servizio Windows "%SERVICE%" non trovato.
  echo        Controlla con:  nssm status %SERVICE%
  echo        Se sul server il servizio ha un nome diverso (probabile se
  echo        l'installazione e' stata personalizzata), modifica la variabile
  echo        SERVICE in cima a questo script col nome corretto.
  echo        Per vedere tutti i servizi installati con NSSM:
  echo            nssm list
  echo        Oppure tutti i servizi Windows:
  echo            sc query state= all
  goto :end_fail
)
echo [ OK ] Prerequisiti (git, npm, venv, repo, db, servizio "%SERVICE%").

REM Crea cartella backup se mancante
if not exist "%BACKUP_DIR%" (
  mkdir "%BACKUP_DIR%"
  echo [ OK ] Cartella backup creata: %BACKUP_DIR%
)

REM ─── 3) Stato attuale del repo ──────────────────────────────
cd /d "%REPO%"
for /f "tokens=*" %%i in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "CUR_BRANCH=%%i"
for /f "tokens=*" %%i in ('git rev-parse --short HEAD 2^>nul')   do set "PREV_SHA=%%i"
echo.
echo Branch corrente:   %CUR_BRANCH%
echo Commit corrente:   %PREV_SHA%
echo.

REM ─── 4) Branch deve essere main ─────────────────────────────
if not "%CUR_BRANCH%"=="%EXPECTED_BRANCH%" (
  echo [STOP] Il server e' su un branch diverso da "%EXPECTED_BRANCH%":
  echo        attualmente e' su "%CUR_BRANCH%".
  echo        update.bat aggiorna solo dal branch "%EXPECTED_BRANCH%".
  echo        Per tornare su "%EXPECTED_BRANCH%":
  echo            git checkout %EXPECTED_BRANCH%
  echo        (se ci sono modifiche locali, gestiscile prima a mano:
  echo        git status per vederle, poi committale o scartale).
  goto :end_fail
)
echo [ OK ] Branch atteso (%EXPECTED_BRANCH%).

REM ─── 5) Backup DB PRIMA di toccare qualunque cosa ──────────
REM Timestamp e path costruiti da Python (datetime.now() + sqlite3.backup()):
REM evita lo slicing fragile di %date%/%time% (che assume locale italiano).
REM Python stampa il path del file creato, lo catturiamo con for /f.
REM Nota: %%Y/%%m/%%d/%%H/%%M/%%S sono literal % per strftime in un .bat.
echo [ .. ] Backup DB WAL-aware in %BACKUP_DIR% ...
set "BKP_PATH="
for /f "usebackq delims=" %%i in (`"%VENV_PY%" -c "import sqlite3,sys,datetime,os; ts=datetime.datetime.now().strftime('%%Y%%m%%d-%%H%%M%%S'); dst=os.path.join(sys.argv[2], f'mechquote.db.bak-{ts}'); s=sqlite3.connect(sys.argv[1]); d=sqlite3.connect(dst); s.backup(d); d.close(); s.close(); print(dst)" "%DB_FILE%" "%BACKUP_DIR%"`) do set "BKP_PATH=%%i"
if not defined BKP_PATH (
  echo [STOP] Backup del database FALLITO. Niente viene aggiornato, il sistema
  echo        resta com'e'. Cause probabili:
  echo          - la cartella di backup non e' scrivibile dall'amministratore;
  echo          - disco C: pieno (controlla spazio libero in Esplora risorse);
  echo          - il file del database e' bloccato da un altro processo.
  echo        Cartella di destinazione del backup:  %BACKUP_DIR%
  goto :end_fail
)
echo [ OK ] Backup DB completato: %BKP_PATH%

REM ─── 6) Working tree pulito (ignora untracked: db, logs, .env) ─
set "DIRTY="
for /f "tokens=*" %%i in ('git status --porcelain --untracked-files=no') do set "DIRTY=1"
if defined DIRTY (
  echo.
  echo [STOP] Ci sono modifiche locali non committate sul server: qualcuno ha
  echo        toccato dei file a mano. Elenco:
  git status --short --untracked-files=no
  echo.
  echo        Vanno annullate prima di aggiornare. Opzioni:
  echo          - se le modifiche sono accidentali, scartale UNA per UNA con:
  echo                git checkout -- ^<nome-file^>
  echo          - se invece sembrano importanti, NON cancellarle: chiama lo
  echo            sviluppatore prima di proseguire.
  echo        Poi rilancia update.bat.
  goto :end_fail
)
echo [ OK ] Working tree pulito.

REM ─── 7) Fetch dal remoto ────────────────────────────────────
echo [ .. ] git fetch ...
git fetch
if errorlevel 1 (
  echo [STOP] git fetch fallito: non riesco a contattare GitHub.
  echo        Verifica nell'ordine:
  echo          - la connessione internet del server funziona ^(es. apri Edge
  echo            e prova a raggiungere github.com^);
  echo          - il firewall aziendale non blocca le connessioni in uscita
  echo            verso github.com:443;
  echo          - se il repo richiede credenziali, sono ancora valide.
  goto :end_fail
)
echo [ OK ] git fetch completato.

REM ─── 8) Pull --ff-only ──────────────────────────────────────
echo [ .. ] git pull --ff-only ...
git pull --ff-only
if errorlevel 1 (
  echo [STOP] Aggiornamento del codice rifiutato: sul server c'e' qualcosa che
  echo        non sta su GitHub ^(qualcuno ha committato a mano, oppure c'e'
  echo        stato un reset locale^). Non e' un problema risolvibile da
  echo        update.bat: contatta lo sviluppatore.
  echo.
  echo        Per tornare allo stato di prima di update.bat:
  echo            cd %REPO%
  echo            git reset --hard %PREV_SHA%
  echo            nssm restart %SERVICE%
  goto :end_fail
)
for /f "tokens=*" %%i in ('git rev-parse --short HEAD') do set "NEW_SHA=%%i"
echo [ OK ] Pull completato: %PREV_SHA% -^> %NEW_SHA%
if "%NEW_SHA%"=="%PREV_SHA%" (
  echo        Nessun nuovo commit. Ricostruisco e riavvio comunque ^(per sicurezza^).
)

REM ─── 9) Detect dipendenze cambiate ──────────────────────────
set "FRONT_DEPS=0"
set "BACK_DEPS=0"
if not "%NEW_SHA%"=="%PREV_SHA%" (
  for /f "tokens=*" %%i in ('git diff --name-only %PREV_SHA% %NEW_SHA%') do (
    if "%%i"=="frontend/package.json"      set "FRONT_DEPS=1"
    if "%%i"=="frontend/package-lock.json" set "FRONT_DEPS=1"
    if "%%i"=="backend/requirements.txt"   set "BACK_DEPS=1"
  )
)

REM ─── 10) pip install se requirements.txt cambiato ──────────
if "%BACK_DEPS%"=="1" (
  echo [ .. ] requirements.txt cambiato -^> pip install ...
  "%VENV_PY%" -m pip install -r "%BACKEND%\requirements.txt"
  if errorlevel 1 (
    echo [STOP] Installazione delle nuove librerie Python FALLITA.
    echo        Leggi le righe rosse qui sopra: di solito dicono qual e' il
    echo        pacchetto che da problema ^(rete, versione incompatibile,
    echo        compilazione che richiede strumenti mancanti^).
    echo        Il backend NON e' stato riavviato, sta ancora girando con il
    echo        codice precedente. Per tornare al commit di partenza:
    echo            cd %REPO%
    echo            git reset --hard %PREV_SHA%
    goto :end_fail
  )
  echo [ OK ] Dipendenze backend aggiornate.
) else (
  echo [ OK ] requirements.txt invariato ^(pip install saltato^).
)

REM ─── 11) npm install se package.json/lock cambiati ─────────
cd /d "%FRONTEND%"
if "%FRONT_DEPS%"=="1" (
  echo [ .. ] package.json/lock cambiato -^> npm install ...
  call npm install
  if errorlevel 1 (
    echo [STOP] Installazione delle nuove librerie JavaScript FALLITA.
    echo        Leggi le righe qui sopra: di solito dicono il pacchetto che
    echo        da' problema o un errore di rete.
    echo        Il frontend NON e' stato ancora ricostruito: la dist/ vecchia
    echo        e' ancora a posto, Apache continua a servire la versione
    echo        precedente del sito. Per tornare anche al commit di partenza:
    echo            cd %REPO%
    echo            git reset --hard %PREV_SHA%
    goto :end_fail
  )
  echo [ OK ] Dipendenze frontend aggiornate.
) else (
  echo [ OK ] package.json invariato ^(npm install saltato^).
)

REM ─── 12) Build frontend ─────────────────────────────────────
echo [ .. ] npm run build ...
call npm run build
if errorlevel 1 (
  echo.
  echo [STOP] Costruzione del frontend FALLITA ^(npm run build^).
  echo        La cartella dist/ precedente e' ancora a posto: Apache continua
  echo        a servire la versione vecchia del sito, gli utenti non vedono
  echo        differenze. Leggi le righe qui sopra per capire l'errore di
  echo        compilazione. Per tornare anche al commit di partenza:
  echo            cd %REPO%
  echo            git reset --hard %PREV_SHA%
  goto :end_fail
)
echo [ OK ] Frontend ricostruito ^(%FRONTEND%\dist^).

REM ─── 13) Restart backend via NSSM ───────────────────────────
echo [ .. ] nssm restart %SERVICE% ...
nssm restart %SERVICE%
if errorlevel 1 (
  echo [STOP] Riavvio del servizio backend FALLITO.
  echo        Controlla subito:
  echo            nssm status %SERVICE%
  echo        I log del backend sono in:
  echo            %LOG_FILE%
  echo        Apri il file e guarda le ultime righe: di solito dicono perche'
  echo        non e' partito.
  echo        Per tornare allo stato di prima di update.bat:
  echo            cd %REPO%
  echo            git reset --hard %PREV_SHA%
  echo            nssm restart %SERVICE%
  goto :end_fail
)
echo [ OK ] Comando di restart inviato. Attendo che il backend risponda...

REM ─── 14) Health check: il backend risponde su :8000 ? ──────
REM Usa curl con -f: in questo modo qualsiasi risposta != 2xx (404/401/500)
REM viene considerata "non sano". L'endpoint /api/health risponde 200 con un
REM payload di stato quando il backend e' davvero su.
where curl >nul 2>&1
if errorlevel 1 (
  echo [STOP] curl non disponibile sul sistema. Serve per controllare che il
  echo        backend sia ripartito davvero. E' incluso in Windows 10/11 di
  echo        default; se manca, aggiorna Windows.
  goto :end_fail
)
set /a TRIES=0
:health_loop
set /a TRIES+=1
curl -fsS -o nul --max-time 2 "%HEALTH_URL%" >nul 2>&1
if not errorlevel 1 goto health_ok
if %TRIES% GEQ %HEALTH_MAX_TRIES% (
  echo.
  echo [STOP] Il backend non risponde su %HEALTH_URL% dopo ~60 secondi:
  echo        il riavvio non e' andato a buon fine.
  echo        Cosa controllare nell'ordine:
  echo          1) i log del backend: apri il file
  echo                 %LOG_FILE%
  echo             e guarda le ULTIME righe ^(di solito dicono l'errore^);
  echo          2) lo stato del servizio:
  echo                 nssm status %SERVICE%
  echo        Per tornare allo stato di prima di update.bat:
  echo            cd %REPO%
  echo            git reset --hard %PREV_SHA%
  echo            nssm restart %SERVICE%
  goto :end_fail
)
timeout /t 2 /nobreak >nul
goto health_loop
:health_ok
echo [ OK ] Backend risponde correttamente su %HEALTH_URL%.

REM ─── 15) Esito finale ───────────────────────────────────────
echo.
echo ============================================================
echo   AGGIORNAMENTO COMPLETATO
echo ============================================================
echo   Backup DB:      %BKP_PATH%
echo   Aggiornato:     %PREV_SHA%  -^>  %NEW_SHA%
echo   Frontend dist:  %FRONTEND%\dist
echo   Servizio:       %SERVICE% riavviato e risponde
echo ============================================================
echo.
echo Se qualcosa non va in futuro, per tornare a questo commit precedente:
echo.
echo   cd %REPO%
echo   git reset --hard %PREV_SHA%
echo   cd frontend
echo   call npm run build
echo   nssm restart %SERVICE%
echo.
echo Backup DB pre-aggiornamento: %BKP_PATH%
echo ^(per ripristinarlo: arresta il servizio, copia il .bak su mechquote.db, riavvia^)
echo.
echo %WAIT_PROMPT%
pause >nul
exit /b 0

:end_fail
echo.
echo %WAIT_PROMPT%
pause >nul
exit /b 1
