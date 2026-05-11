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
from typing import Tuple, Type

from fastapi import HTTPException
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
