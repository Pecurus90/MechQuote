---
name: backup-db
description: Backup WAL-aware del database SQLite di MechQuote prima di operazioni distruttive (import backup, DELETE batch, suite integration). Usala PRIMA di qualsiasi test/endpoint che tocca il DB di sviluppo (CLAUDE.md §2.E).
---

# Backup DB (WAL-aware)

⚠️ SQLite di MechQuote gira in **modalità WAL**: le ultime scritture vivono nel
file `mechquote.db-wal`, non ancora nel `.db`. Una copia semplice del solo `.db`
produce un backup **incompleto**. Serve un backup atomico WAL-aware.

## Metodo (portabile — stesso di update.ps1)

Su questa macchina il CLI `sqlite3` **non è installato**, quindi usa il metodo
Python stdlib `sqlite3.backup()` (atomico e WAL-aware). Il DB reale è
`backend/mechquote.db`.

```bash
cd backend && venv/Scripts/python -c "
import sqlite3, datetime
ts = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
src = sqlite3.connect('mechquote.db')
dst = sqlite3.connect(f'mechquote.db.bak-{ts}')
with dst:
    src.backup(dst)
dst.close(); src.close()
print(f'backup OK -> backend/mechquote.db.bak-{ts}')
"
```

## Quando è obbligatorio (§2.E)
- `POST /api/backup/import` (svuota tutte le tabelle prima di reimportare)
- DELETE batch su Quote/Part/Phase senza filtro mirato
- qualsiasi `db.query(Model).delete()` da script ad-hoc
- suite `tests/integration/*` (fanno DELETE+INSERT)

## Workflow
1. Esegui il backup qui sopra (un secondo, costo zero).
2. Esegui il test/operazione.
3. Se è andato male, ripristina il `.bak` **a servizio fermo** (copia il file
   `.bak` su `mechquote.db` e rimuovi `-wal`/`-shm` stantii) e riparti.

> Il commit git NON protegge il DB (non è versionato). Fai sempre il backup
> anche se "hai appena committato".
