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

Then open http://localhost:3000 — the API is proxied to :8000.

## First User

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin","full_name":"Admin"}'
```

Then login at http://localhost:3000/login

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
