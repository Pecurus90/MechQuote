from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
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

from app.api import auth, quotes, parts, phases, settings, dashboard, pdf, backup, customers
app.include_router(auth.router)
app.include_router(quotes.router)
app.include_router(parts.router)
app.include_router(phases.router)
app.include_router(settings.router)
app.include_router(dashboard.router)
app.include_router(pdf.router)
app.include_router(backup.router)
app.include_router(customers.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "MechQuote"}


os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
