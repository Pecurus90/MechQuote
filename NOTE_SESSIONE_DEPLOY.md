# Note sessione deploy — 2026-06-05

> Promemoria di cosa è stato fatto installando MechQuote sul **PC server di
> ufficio** (Windows 10 + XAMPP). Serve a ritrovare il contesto quando si
> riprende lo sviluppo **da casa**. Niente password qui dentro: questo file
> finisce su GitHub (repo pubblico).

---

## 1. Modifiche al CODICE (sono nel repo — le vedi col `git pull`)

- **`backend/app/core/config.py`** — fix di avvio. `pydantic-settings 2.6`
  rifiuta le chiavi del `.env` non mappate su un campo di `Settings`.
  `ALLOWED_ORIGINS` è letta via `os.getenv` (CORS in `main.py`, check
  produzione in `config.py`), non è un campo: con `extra=forbid` il server
  non parte (`extra_forbidden`). Aggiunto `extra = "ignore"` nella `Config`.
  Senza questo fix, il backend non si avvia se il `.env` contiene
  `ALLOWED_ORIGINS`.
- **`.gitignore`** — esclusi gli artefatti operativi locali (vedi §3).

## 2. Setup del SERVER di produzione (solo sul PC ufficio, NON nel repo)

Tutto su Windows, backend dietro Apache di XAMPP.

- **Backend**: servizio Windows `MechQuoteBackend` (NSSM), `uvicorn` su
  `127.0.0.1:8000`, **auto-avvio**. Gira come account **LocalSystem**.
  Argomenti: `--host 127.0.0.1 --port 8000 --proxy-headers
  --forwarded-allow-ips 127.0.0.1`.
- **Apache (XAMPP)**: installato come **servizio Windows** (`Apache2.4`,
  auto-avvio), ascolta sulla **porta 8080**. Vhost in
  `C:\xampp\apache\conf\extra\httpd-vhosts.conf`: serve il frontend da
  `frontend/dist` e fa da reverse proxy `/api` e `/uploads` → `:8000`.
  Accesso LAN: `http://<IP-server>:8080`.
- **Firewall**: regola in ingresso TCP **8080** (profili Dominio+Privato).
- **Backup DB notturno**: Task Scheduler `MechQuote Backup`, ogni giorno
  23:00, esegue `backup.ps1` (WAL-aware via `sqlite3.backup()`), tiene gli
  ultimi 30 in `backups/`.
- **Alert utensili**: Task Scheduler `MechQuote Tools Alert`, ogni martedì
  08:00, esegue `tools_alert.ps1` → `POST /api/tools/notify-low-stock`.
  Usa l'utente di servizio `scheduler` (ruolo `amministrazione`). La password
  è salvata **solo** dentro `tools_alert.ps1` sul server (non nel repo).

### Fix specifici applicati sul server
- **Rate-limit dietro proxy**: aggiunto `--proxy-headers --forwarded-allow-ips
  127.0.0.1` agli argomenti del servizio, così uvicorn vede l'IP reale del
  client (altrimenti tutti arrivavano come `127.0.0.1` e il limite anti-
  bruteforce sul login diventava un unico contatore condiviso).
- **Generazione PDF (Playwright)**: il servizio gira come SYSTEM e non trovava
  Chromium (installato nel profilo utente). I browser sono stati copiati in
  `C:\MechQuote\ms-playwright` e impostata la variabile d'ambiente del
  servizio `PLAYWRIGHT_BROWSERS_PATH=C:\MechQuote\ms-playwright`
  (via `nssm ... AppEnvironmentExtra`). PDF testato e funzionante.
  ⚠️ Se in futuro si aggiorna il pacchetto `playwright` (nuovo build di
  Chromium), va rifatto il download nel percorso neutro:
  `$env:PLAYWRIGHT_BROWSERS_PATH="C:\MechQuote\ms-playwright"; venv\Scripts\playwright install chromium`.

## 3. Cosa NON è nel repo (vive solo sul server)

`mechquote.db`, `backend/.env`, `ms-playwright/`, `logs/`, `backups/` e gli
script operativi (`backup.ps1`, `tools_alert.ps1`, `setup-prod*.ps1`). Da casa
questi non ci sono: il `git pull` porta solo il codice.

## 4. Sviluppo da casa (locale)

- Backend: `cd backend`, crea venv, `pip install -r requirements.txt`,
  `playwright install chromium`, copia `.env.example` → `.env` (genera una
  `SECRET_KEY`), avvia `venv\Scripts\uvicorn app.main:app --reload --port 8000`.
- Frontend: `cd frontend`, `npm install`, `npm run dev` → http://localhost:5173
  (Vite fa da proxy `/api` → :8000).
- Deploy sul server: `update.bat` (da CMD admin) fa backup DB, `git pull
  --ff-only`, rebuild frontend e `nssm restart MechQuoteBackend`.

## 5. Da fare / aperti

- [ ] **Cambiare la password di `admin`** sul server (ora è `admin/admin`,
      falla di sicurezza su un server in rete).
- [ ] Valutare i lavori in `MECHQUOTE_LISTA_LAVORI.md` (es. optimistic locking
      contro il "last write wins" ora che è multi-utente).
