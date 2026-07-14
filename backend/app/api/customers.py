import csv
import io
import logging
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.catalog_protect import block_if_in_use
from app.core.database import get_db
from app.core.security import require_permission
from app.models import Customer, Quote
from app.schemas import CustomerCreate, CustomerUpdate, CustomerOut, normalize_phone_number

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/customers", tags=["customers"])

_can_write = require_permission('customers')


@router.get("", response_model=List[CustomerOut])
def list_customers(db: Session = Depends(get_db), active_only: bool = False):
    query = db.query(Customer)
    if active_only:
        query = query.filter(Customer.active == True)
    return query.order_by(Customer.customer_number).all()


@router.post("", response_model=CustomerOut)
def create_customer(data: CustomerCreate, db: Session = Depends(get_db), _=_can_write):
    payload = data.model_dump()
    # Auto-gen customer_number se non fornito (frontend lo passa, API consumer
    # esterno può ometterlo): prossimo numero libero = max + 1.
    if payload.get("customer_number") is None:
        from sqlalchemy import func
        max_num = db.query(func.max(Customer.customer_number)).scalar() or 0
        payload["customer_number"] = max_num + 1
    customer = Customer(**payload)
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    return customer


@router.put("/{customer_id}", response_model=CustomerOut)
def update_customer(customer_id: int, data: CustomerUpdate, db: Session = Depends(get_db), _=_can_write):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(customer, key, value)
    db.commit()
    return customer


@router.delete("/{customer_id}")
def delete_customer(customer_id: int, db: Session = Depends(get_db), _=_can_write):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    block_if_in_use(
        db, f"Cliente '{customer.name}'",
        (Quote, Quote.customer_id == customer.id, "preventivo", "preventivi"),
    )
    db.delete(customer)
    db.commit()
    return {"ok": True}


# ─── Import CSV ────────────────────────────────────────────────────────────

import re

_SHORT_ACRONYM_LEN = 4  # parole ≤4 lettere tutte maiuscole restano com'è


def _smart_title(s: str) -> str:
    """Title case 'intelligente'.

    Converte stringhe MAIUSCOLE (tipiche dei gestionali aziendali italiani
    e di questo CSV) in Title Case leggibile, ma mantiene in maiuscolo le
    sigle/acronimi brevi (≤4 lettere tutte maiuscole).

    Esempi:
        "ABB POWER GRID ITALY S.P.A." → "ABB Power Grid Italy S.P.A."
        "SR 11, SIGNOLO 22-MONTEBELLO VICENTINO" → "SR 11, Signolo 22-Montebello Vicentino"
        "VIA ROMA, 12"                          → "Via Roma, 12"
    """
    if not s:
        return s
    s = re.sub(r'\s+', ' ', s).strip()

    def fix_word(w: str) -> str:
        letters = ''.join(c for c in w if c.isalpha())
        if letters and letters == letters.upper() and len(letters) <= _SHORT_ACRONYM_LEN:
            return w  # già acronimo breve, keep
        return w.title()

    # Split mantenendo i separatori (spazi, '-', '/')
    parts = re.split(r'(\s+|-|/)', s)
    return ''.join(fix_word(p) for p in parts)


def _normalize_email(s: str) -> str:
    """Email: lowercase + strip. None/vuoto → None."""
    if not s:
        return None
    e = s.strip().lower()
    return e or None


def _normalize_phone_raw(s: str) -> str:
    """AUD-27: usa la STESSA normalizzazione del path API (fonte unica in
    schemas.normalize_phone_number), così i telefoni importati da CSV non
    divergono più dal formato canonico (+39, parentesi, interni, separatori)."""
    return normalize_phone_number(s)


def _compose_address(via: str, cap: str, prov: str) -> str:
    """Indirizzo formattato: 'Via Roma 12, 36054 VI'. Solo le parti popolate."""
    via = _smart_title(via) if via else ''
    cap = (cap or '').strip()
    prov = (prov or '').strip().upper()
    tail = f"{cap} {prov}".strip()
    parts = [p for p in [via, tail] if p]
    return ', '.join(parts) or None


@router.post("/import-csv")
async def import_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=_can_write,
):
    """Importa un CSV clienti del gestionale aziendale.

    Schema atteso (separatore `;`, header italiano):
      Codice;Ragione Sociale;Ragione Sociale2;Indirizzo;Cap;Prov.;
      ...;Cellulare;Telefono Cli For;...;Email Cli For;...

    Comportamento:
    - Upsert per `customer_number` (Codice): se esiste aggiorna, altrimenti crea
    - Riga senza Codice numerico o senza Ragione Sociale → skip
    - Formattazione coerente: smart-title case su nome/indirizzo, email lowercase
    - Phone: Cellulare preferito, fallback su Telefono Cli For
    """
    if not file.filename.lower().endswith('.csv'):
        raise HTTPException(status_code=400, detail="Il file deve essere un .csv")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File vuoto")

    # Decode: prova UTF-8 BOM, poi UTF-8, poi latin1 (gestionali italiani)
    text = None
    for enc in ('utf-8-sig', 'utf-8', 'cp1252', 'latin1'):
        try:
            text = content.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise HTTPException(status_code=400, detail="Impossibile decodificare il file (encoding sconosciuto)")

    # Sniff il separatore (probabile `;` per CSV italiano)
    reader = csv.reader(io.StringIO(text), delimiter=';', quotechar='"')
    rows = list(reader)
    if len(rows) < 2:
        raise HTTPException(status_code=400, detail="CSV troppo corto (header + dati richiesti)")

    # Trova la riga header: cerca quella che contiene "Codice" e "Ragione Sociale"
    header_idx = None
    header = None
    for i, r in enumerate(rows[:5]):  # primi 5 a sufficienza
        if any('Codice' in (c or '') for c in r) and any('Ragione Sociale' in (c or '') for c in r):
            header_idx = i
            header = [c.strip() for c in r]
            break
    if header_idx is None:
        raise HTTPException(
            status_code=400,
            detail="Header non riconosciuto. Atteso CSV con colonne 'Codice', 'Ragione Sociale', ecc.",
        )

    # Indici colonne (1-based diventa 0-based)
    def col(name: str) -> int:
        try:
            return header.index(name)
        except ValueError:
            return -1

    idx_codice = col('Codice')
    idx_ragione = col('Ragione Sociale')
    idx_ragione2 = col('Ragione Sociale2')
    idx_indirizzo = col('Indirizzo')
    idx_cap = col('Cap')
    idx_prov = col('Prov.')
    idx_cell = col('Cellulare')
    idx_tel = col('Telefono Cli For')
    idx_email = col('Email Cli For')

    if idx_codice < 0 or idx_ragione < 0:
        raise HTTPException(status_code=400, detail="Colonne obbligatorie mancanti (Codice, Ragione Sociale)")

    def safe(row, i):
        if i < 0 or i >= len(row):
            return ''
        return (row[i] or '').strip()

    created, updated, skipped = 0, 0, 0
    skipped_reasons: list[str] = []

    for raw in rows[header_idx + 1:]:
        if not raw or all(not (c or '').strip() for c in raw):
            continue  # riga vuota
        codice_str = safe(raw, idx_codice).lstrip('0') or safe(raw, idx_codice)
        try:
            codice = int(codice_str)
        except (ValueError, TypeError):
            skipped += 1
            skipped_reasons.append(f"Codice non numerico: {safe(raw, idx_codice)!r}")
            continue

        name_main = safe(raw, idx_ragione)
        name_sec = safe(raw, idx_ragione2)
        if not name_main:
            skipped += 1
            continue
        full_name = _smart_title(f"{name_main} {name_sec}".strip())

        address = _compose_address(
            safe(raw, idx_indirizzo),
            safe(raw, idx_cap),
            safe(raw, idx_prov),
        )

        cell = _normalize_phone_raw(safe(raw, idx_cell))
        tel = _normalize_phone_raw(safe(raw, idx_tel))
        phone = cell or tel  # cellulare preferito

        email = _normalize_email(safe(raw, idx_email))

        # Upsert
        existing = db.query(Customer).filter(Customer.customer_number == codice).first()
        if existing:
            existing.name = full_name
            if address is not None:
                existing.address = address
            if phone is not None:
                existing.phone = phone
            if email is not None:
                existing.email = email
            updated += 1
        else:
            db.add(Customer(
                customer_number=codice,
                name=full_name,
                address=address,
                phone=phone,
                email=email,
                active=True,
            ))
            created += 1

    db.commit()
    logger.info(
        "CSV clienti importato: created=%d updated=%d skipped=%d",
        created, updated, skipped,
    )
    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "total_processed": created + updated + skipped,
        "skipped_examples": skipped_reasons[:5],
    }
