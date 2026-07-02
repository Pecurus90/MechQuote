"""Helper di protezione per i CRUD delle tabelle catalog.

Pattern: ogni endpoint DELETE su una tabella catalog (Material, Machine,
Treatment, Supplier, Operation, ecc.) DEVE chiamare `block_if_in_use(...)`
prima di `db.delete()`. In caso di voce ancora referenziata, alza HTTP
400 con un messaggio italiano che include il conteggio per ogni tipo di
child — l'utente sa subito quante righe vanno riassegnate prima di
eliminare.

Senza questo check le DELETE silenziose lasciavano orfani (su SQLite le
FK non sono enforced di default) o alzavano `IntegrityError` generici e
opachi lato frontend.
"""
from typing import Optional, Tuple, Type

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.sql import ColumnElement

from app.core.database import Base


# Tupla check: (Model, filter_expr, singolare, plurale).
CatalogCheck = Tuple[Type[Base], ColumnElement, str, str]


def block_if_in_use(db: Session, label: str, *checks: CatalogCheck) -> None:
    """Solleva HTTP 400 se la voce catalog è ancora referenziata.

    Args:
        db: SQLAlchemy session.
        label: descrizione human-readable della voce, es. "Materiale 'C45'".
        *checks: una o più tuple `(Model, filter_expr, singolare, plurale)`.

    Esempio:
        block_if_in_use(
            db, f"Materiale '{m.name}'",
            (Part, Part.material_id == m.id, "parte", "parti"),
        )
    """
    blocks = []
    for model, expr, sing, plur in checks:
        n = db.query(model).filter(expr).count()
        if n > 0:
            blocks.append(f"{n} {sing if n == 1 else plur}")
    if blocks:
        raise HTTPException(
            status_code=400,
            detail=f"{label} in uso da {' e '.join(blocks)} — riassegnali prima",
        )


def find_by_name(db: Session, model: Type[Base], name: str, name_col: str = "name"):
    """Cerca una voce catalog per nome, case-insensitive + trimmed.

    Ritorna la prima riga che matcha `LOWER(TRIM(col)) == LOWER(TRIM(name))`, o
    None. Riusato dall'anti-doppioni (D2) e dal find-or-create dell'import (D3).
    """
    if name is None:
        return None
    col = getattr(model, name_col)
    key = name.strip().lower()
    return db.query(model).filter(func.lower(func.trim(col)) == key).first()


def check_duplicate_name(
    db: Session,
    model: Type[Base],
    name: str,
    *,
    label: str,
    name_col: str = "name",
    exclude_id: Optional[int] = None,
) -> None:
    """Solleva HTTP 400 se esiste già una voce con lo stesso nome (case-insensitive).

    `exclude_id`: id della voce che si sta aggiornando (per non auto-bloccarsi).
    `label`: es. "materiale", "macchina" — usato nel messaggio all'utente.
    """
    existing = find_by_name(db, model, name, name_col)
    if existing is not None and getattr(existing, "id", None) != exclude_id:
        raise HTTPException(
            status_code=400,
            detail=f"Esiste già un/una {label} con questo nome ('{name.strip()}')",
        )
