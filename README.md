# MechQuote — Fratelli Dalla Via

Sistema di preventivazione tecnica per lavorazioni meccaniche di precisione.

## Tech Stack

**Frontend:** React + TypeScript + Vite + Tailwind CSS  
**Backend:** Python + FastAPI + SQLAlchemy + SQLite  
**CAD:** ezdxf (DXF), OCP/OpenCascade (STEP)  
**PDF:** WeasyPrint

## Quick Start

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -c "from app.main import app; from app.core.database import engine; from app.models import Base; Base.metadata.create_all(bind=engine)"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Then open http://localhost:5173 — the API is proxied to :8000.

## First User

L'endpoint `POST /api/auth/register` richiede il permesso `users` (admin only).
Per il bootstrap iniziale, creare il primo utente admin direttamente in DB con uno script Python o via SQLite:

```bash
cd backend
venv/bin/python -c "
from app.models import User
from app.core.security import get_password_hash
from app.core.database import SessionLocal
db = SessionLocal()
db.add(User(username='admin', hashed_password=get_password_hash('admin'), full_name='Admin', role='admin'))
db.commit()
"
```

Then login at http://localhost:5173/login

## Environment variables

Da impostare in `backend/.env` prima del deploy:

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `SECRET_KEY` | _placeholder_ | JWT signing key — **obbligatorio in produzione** |
| `DATABASE_URL` | `sqlite:///./mechquote.db` | Connection string SQLAlchemy |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | CORS, comma-separated |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Validità JWT (default 24h) |

## Project Structure

```
dallavia/
├── backend/
│   └── app/
│       ├── api/       # API routes
│       ├── models.py  # SQLAlchemy models
│       ├── schemas.py # Pydantic schemas
│       ├── services/  # Business logic
│       └── core/      # Config, security, database
├── frontend/
│   └── src/
│       ├── components/  # UI components
│       ├── pages/       # Page components
│       └── lib/         # Utilities & API client
└── docs/  # Documentation
```
