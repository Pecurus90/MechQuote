from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
import os

from app.core.database import engine, Base
from app.models import *

Base.metadata.create_all(bind=engine)

app = FastAPI(title="MechQuote API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api import auth, quotes, parts, phases, settings, dashboard, pdf, backup, customers, quotes_archive
app.include_router(auth.router)
app.include_router(quotes_archive.router)
app.include_router(quotes.router)
app.include_router(parts.router)
app.include_router(phases.router)
app.include_router(settings.router)
app.include_router(dashboard.router)
app.include_router(pdf.router)
app.include_router(backup.router)
app.include_router(customers.router)


def _run_migrations():
    """Add new columns to existing tables without losing data."""
    migrations = [
        "ALTER TABLE quotes ADD COLUMN quote_type VARCHAR(20) DEFAULT 'single'",
        "ALTER TABLE quotes ADD COLUMN global_discount_percent FLOAT DEFAULT 0.0",
        "ALTER TABLE quotes ADD COLUMN transport_cost FLOAT DEFAULT 0.0",
        "ALTER TABLE quotes ADD COLUMN packaging_cost FLOAT DEFAULT 0.0",
        "ALTER TABLE parts ADD COLUMN rounding_rule VARCHAR(20) DEFAULT 'none'",
        "ALTER TABLE parts ADD COLUMN minimum_price FLOAT",
        "ALTER TABLE parts ADD COLUMN raw_diameter_mm FLOAT",
        "ALTER TABLE parts ADD COLUMN finished_weight_kg FLOAT",
        "ALTER TABLE parts ADD COLUMN raw_weight_kg FLOAT",
        "ALTER TABLE parts ADD COLUMN confidence_level VARCHAR(20) DEFAULT 'high'",
        "ALTER TABLE parts ADD COLUMN customer_notes TEXT",
        "ALTER TABLE parts ADD COLUMN internal_notes TEXT",
        "ALTER TABLE quotes ADD COLUMN currency VARCHAR(10) DEFAULT 'EUR'",
        "ALTER TABLE quotes ADD COLUMN validity_days INTEGER DEFAULT 30",
        "ALTER TABLE quotes ADD COLUMN delivery_text VARCHAR(200)",
        "ALTER TABLE quotes ADD COLUMN customer_reference VARCHAR(200)",
        "ALTER TABLE manufacturing_phases ADD COLUMN treatment_id INTEGER REFERENCES treatments(id)",
        "ALTER TABLE manufacturing_phases ADD COLUMN is_shared INTEGER DEFAULT 0",
        "ALTER TABLE phase_templates ADD COLUMN is_shared INTEGER DEFAULT 0",
        "ALTER TABLE parts ADD COLUMN material_delivery_cost FLOAT DEFAULT 0.0",
        "ALTER TABLE materials ADD COLUMN supplier_id INTEGER REFERENCES material_suppliers(id)",
        "ALTER TABLE treatments ADD COLUMN treatment_supplier_id INTEGER REFERENCES treatment_suppliers(id)",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass  # column already exists


def _seed_categories():
    """Insert default quote categories if the table is empty."""
    from sqlalchemy.orm import Session
    from app.models import QuoteCategory

    with Session(engine) as db:
        if db.query(QuoteCategory).count() == 0:
            defaults = [
                QuoteCategory(code="A", name="Componenti meccanici", sort_order=1),
                QuoteCategory(code="B", name="Trance", sort_order=2),
                QuoteCategory(code="C", name="Blocco stampi", sort_order=3),
                QuoteCategory(code="D", name="Stampi progressivi", sort_order=4),
                QuoteCategory(code="E", name="Elettroerosione", sort_order=5),
                QuoteCategory(code="F", name="Attrezzature", sort_order=6),
                QuoteCategory(code="G", name="Altro", sort_order=7),
            ]
            db.add_all(defaults)
            db.commit()


_run_migrations()
_seed_categories()


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "MechQuote"}


os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
