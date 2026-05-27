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
set "HEALTH_URL=http://localhost:8000/"
set "HEALTH_MAX_TRIES=15"

echo.
echo ============================================================
echo  MechQuote update -- %date% %time%
echo ============================================================
echo.

REM ─── 1) Check admin (serve per nssm restart) ────────────────
net session >nul 2>&1
if errorlevel 1 (
  echo [STOP] Devi lanciare update.bat da CMD COME AMMINISTRATORE.
  echo        Serve per nssm restart. Tasto destro su CMD -^> "Esegui come amministratore".
  pause
  exit /b 1
)
echo [ OK ] CMD come amministratore.

REM ─── 2) Prerequisiti ────────────────────────────────────────
where git >nul 2>&1
if errorlevel 1 (
  echo [STOP] Git non trovato nel PATH. Installa Git o aggiungilo al PATH.
  pause
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [STOP] npm non trovato nel PATH. Installa Node.js o aggiungilo al PATH.
  pause
  exit /b 1
)
if not exist "%VENV_PY%" (
  echo [STOP] Venv Python non trovato in:
  echo        %VENV_PY%
  echo        Verifica che il backend sia installato correttamente.
  pause
  exit /b 1
)
if not exist "%REPO%\.git" (
  echo [STOP] %REPO% non e' una repository git.
  pause
  exit /b 1
)
if not exist "%DB_FILE%" (
  echo [STOP] Database non trovato in:
  echo        %DB_FILE%
  pause
  exit /b 1
)

REM Verifica esistenza servizio NSSM
sc query %SERVICE% >nul 2>&1
if errorlevel 1 (
  echo [STOP] Servizio Windows "%SERVICE%" non trovato.
  echo        Controlla il nome esatto con:  nssm list
  echo        (oppure:  sc query state= all  per vedere tutti i servizi)
  echo        Se il servizio sul tuo server ha un nome diverso, modifica
  echo        la variabile SERVICE in cima a questo script.
  pause
  exit /b 1
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
  echo [STOP] Branch corrente "%CUR_BRANCH%" diverso da quello atteso "%EXPECTED_BRANCH%".
  echo        Lo script aggiorna solo dalla branch %EXPECTED_BRANCH%.
  echo        Per cambiare branch:  git checkout %EXPECTED_BRANCH%
  echo        ^(se hai modifiche locali, gestiscile prima a mano^)
  pause
  exit /b 1
)
echo [ OK ] Branch atteso (%EXPECTED_BRANCH%).

REM ─── 5) Backup DB PRIMA di toccare qualunque cosa ──────────
REM Timestamp YYYYMMDD-HHMMSS (assume locale dd/mm/yyyy, HH:MM:SS)
set "TS=%date:~6,4%%date:~3,2%%date:~0,2%-%time:~0,2%%time:~3,2%%time:~6,2%"
set "TS=%TS: =0%"
set "BKP_PATH=%BACKUP_DIR%\mechquote.db.bak-%TS%"
echo [ .. ] Backup DB WAL-aware -^> %BKP_PATH%
"%VENV_PY%" -c "import sqlite3,sys; s=sqlite3.connect(sys.argv[1]); d=sqlite3.connect(sys.argv[2]); s.backup(d); d.close(); s.close()" "%DB_FILE%" "%BKP_PATH%"
if errorlevel 1 (
  echo [STOP] Backup DB FALLITO. Niente viene applicato.
  echo        Controlla spazio disco e permessi su %BACKUP_DIR%.
  pause
  exit /b 1
)
echo [ OK ] Backup DB completato.

REM ─── 6) Working tree pulito (ignora untracked: db, logs, .env) ─
set "DIRTY="
for /f "tokens=*" %%i in ('git status --porcelain --untracked-files=no') do set "DIRTY=1"
if defined DIRTY (
  echo.
  echo [STOP] Working tree sporco: ci sono modifiche locali a file tracciati.
  echo        Elenco:
  git status --short --untracked-files=no
  echo.
  echo        Lo script NON sovrascrive. Controlla manualmente:
  echo          - se le modifiche servono, committale o stashale
  echo          - se sono accidentali, scartale con: git checkout -- ^<file^>
  echo        Poi rilancia update.bat.
  pause
  exit /b 1
)
echo [ OK ] Working tree pulito.

REM ─── 7) Fetch dal remoto ────────────────────────────────────
echo [ .. ] git fetch ...
git fetch
if errorlevel 1 (
  echo [STOP] git fetch fallito. Verifica connessione di rete e credenziali git.
  pause
  exit /b 1
)
echo [ OK ] git fetch completato.

REM ─── 8) Pull --ff-only ──────────────────────────────────────
echo [ .. ] git pull --ff-only ...
git pull --ff-only
if errorlevel 1 (
  echo [STOP] git pull fallito: serve un merge ^(la cronologia diverge^).
  echo        Sul server c'e' qualcosa di committato che non sta nel remoto.
  echo        Risolvi a mano (git log, git merge, ...) e rilancia update.bat.
  pause
  exit /b 1
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
    echo [STOP] pip install fallito. Controlla l'output qui sopra.
    pause
    exit /b 1
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
    echo [STOP] npm install fallito. Controlla l'output qui sopra.
    pause
    exit /b 1
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
  echo [STOP] npm run build fallito.
  echo        La cartella dist/ precedente e' ancora a posto: Apache continua
  echo        a servire la versione vecchia del sito. Diagnosi messaggio sopra.
  pause
  exit /b 1
)
echo [ OK ] Frontend ricostruito ^(%FRONTEND%\dist^).

REM ─── 13) Restart backend via NSSM ───────────────────────────
echo [ .. ] nssm restart %SERVICE% ...
nssm restart %SERVICE%
if errorlevel 1 (
  echo [STOP] nssm restart fallito. Controlla con: nssm status %SERVICE%
  echo        e i log in %REPO%\logs\uvicorn.log
  pause
  exit /b 1
)
echo [ OK ] Comando di restart inviato. Attendo che il backend risponda...

REM ─── 14) Health check: il backend risponde su :8000 ? ──────
REM Usa curl (incluso in Windows 10/11). Senza -f, curl ritorna 0 per
REM qualsiasi risposta HTTP arrivata (incluso 401/404): l'importante
REM e' che il server risponda, non che la richiesta sia autorizzata.
REM curl ritorna non-zero solo per connection refused / timeout (server
REM giu'). Verifica iniziale che curl sia disponibile:
where curl >nul 2>&1
if errorlevel 1 (
  echo [STOP] curl non trovato nel PATH ^(serve per health check^).
  echo        E' incluso in Windows 10/11 di default; se manca, aggiorna il sistema.
  pause
  exit /b 1
)
set /a TRIES=0
:health_loop
set /a TRIES+=1
curl -sS -o nul --max-time 2 "%HEALTH_URL%" >nul 2>&1
if not errorlevel 1 goto health_ok
if %TRIES% GEQ %HEALTH_MAX_TRIES% (
  echo.
  echo [STOP] Backend non risponde su %HEALTH_URL% dopo ~30s.
  echo        Controlla i log: %REPO%\logs\uvicorn.log
  echo        e lo stato del servizio: nssm status %SERVICE%
  pause
  exit /b 1
)
timeout /t 2 /nobreak >nul
goto health_loop
:health_ok
echo [ OK ] Backend risponde su %HEALTH_URL%.

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
echo Se qualcosa non va, per tornare al commit precedente:
echo.
echo   cd %REPO%
echo   git reset --hard %PREV_SHA%
echo   cd frontend
echo   call npm run build
echo   nssm restart %SERVICE%
echo.
echo Backup DB del giro precedente: %BKP_PATH%
echo ^(per ripristinarlo: arresta il servizio, copia il .bak su mechquote.db, riavvia^)
echo.
pause
exit /b 0
