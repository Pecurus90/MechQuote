"""CRUD catalogo voci normalizzate (Step 2 cantiere catalogo normalizzati).

Catalogo globale di viti/cuscinetti/molle/colonne/boccole/spine — vive a sé
rispetto a `DieTemplateNormalized` (BoM dei template stampo) e
`DieNormalizedItem` (righe dentro un preventivo stampo). Gli agganci FK
opzionali da quelle due tabelle al catalogo arriveranno negli Step 4-5
(strategia snapshot: al collegamento i valori vengono copiati nella riga,
poi indipendenti — preventivi storici restano congelati).

Pattern coerente con `api/tools.py`: GET lista con filtri opzionali e
ricerca testuale, GET singolo, POST con pre-check del codice univoco,
PUT con stesso check incrociato, DELETE (per ora cancellazione semplice,
predisposto per `block_if_in_use` quando le FK Step 4-5 saranno in piedi).
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.security import require_permission
from app.core.catalog_protect import block_if_in_use
from app.core.csv_import import normalize_alias
from app.models import NormalizedItem, NormalizedAlias, DieNormalizedItem, DieTemplateNormalized
from app.schemas import (
    NormalizedItemCreate, NormalizedItemOut, NormalizedItemUpdate, NormalizedAliasAdd,
)

router = APIRouter(prefix="/api/normalized-items", tags=["normalized-items"])

_can_settings = require_permission('settings')


@router.get("", response_model=List[NormalizedItemOut])
def list_items(
    supplier_id: Optional[int] = None,
    category: Optional[str] = None,
    active: Optional[bool] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    _=_can_settings,
):
    """Elenco voci normalizzate con filtri opzionali.

    - `supplier_id`: solo voci del fornitore indicato.
    - `category`: match esatto sulla categoria (stringa libera).
    - `active`: True/False per filtrare attive/ritirate.
    - `q`: ricerca case-insensitive su `code` e `description`.
    """
    query = db.query(NormalizedItem).options(
        joinedload(NormalizedItem.supplier), joinedload(NormalizedItem.aliases),
    )
    if supplier_id is not None:
        query = query.filter(NormalizedItem.supplier_id == supplier_id)
    if category:
        query = query.filter(NormalizedItem.category == category)
    if active is not None:
        query = query.filter(NormalizedItem.active == active)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(
            NormalizedItem.code.ilike(like),
            NormalizedItem.description.ilike(like),
        ))
    return query.order_by(NormalizedItem.code).limit(500).all()


@router.get("/{item_id}", response_model=NormalizedItemOut)
def get_item(item_id: int, db: Session = Depends(get_db), _=_can_settings):
    item = (
        db.query(NormalizedItem)
        .options(joinedload(NormalizedItem.supplier))
        .filter(NormalizedItem.id == item_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Normalizzato non trovato")
    return item


@router.post("", response_model=NormalizedItemOut)
def create_item(data: NormalizedItemCreate, db: Session = Depends(get_db), _=_can_settings):
    existing = db.query(NormalizedItem).filter(NormalizedItem.code == data.code).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Codice normalizzato '{data.code}' già esistente",
        )
    item = NormalizedItem(**data.model_dump())
    db.add(item)
    db.commit()
    return (
        db.query(NormalizedItem)
        .options(joinedload(NormalizedItem.supplier))
        .filter(NormalizedItem.id == item.id)
        .first()
    )


@router.put("/{item_id}", response_model=NormalizedItemOut)
def update_item(
    item_id: int,
    data: NormalizedItemUpdate,
    db: Session = Depends(get_db),
    _=_can_settings,
):
    item = db.query(NormalizedItem).filter(NormalizedItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Normalizzato non trovato")
    payload = data.model_dump(exclude_unset=True)
    # Se l'utente sta cambiando il code, verifica che non collida con un altro.
    new_code = payload.get('code')
    if new_code is not None and new_code != item.code:
        collision = (
            db.query(NormalizedItem)
            .filter(NormalizedItem.code == new_code, NormalizedItem.id != item_id)
            .first()
        )
        if collision:
            raise HTTPException(
                status_code=400,
                detail=f"Codice normalizzato '{new_code}' già esistente",
            )
    for k, v in payload.items():
        setattr(item, k, v)
    db.commit()
    return (
        db.query(NormalizedItem)
        .options(joinedload(NormalizedItem.supplier))
        .filter(NormalizedItem.id == item_id)
        .first()
    )


@router.delete("/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db), _=_can_settings):
    item = db.query(NormalizedItem).filter(NormalizedItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Normalizzato non trovato")
    # D1: ora le FK opzionali esistono → blocca la cancellazione se la voce è
    # referenziata (da righe preventivo o template). Anche se i valori sono
    # snapshot (copiati), evita FK orfane e avvisa l'utente. Per ritirare una
    # voce ancora in uso si usa il flag `active`.
    block_if_in_use(
        db, f"Voce normalizzata '{item.code}'",
        (DieNormalizedItem, DieNormalizedItem.normalized_item_id == item.id,
         "riga di preventivo", "righe di preventivo"),
        (DieTemplateNormalized, DieTemplateNormalized.normalized_item_id == item.id,
         "riga di template", "righe di template"),
    )
    db.delete(item)
    db.commit()
    return {"ok": True}


# --- Alias (nomi grezzi distinta → questa voce, per l'import da file) --------

def _item_out(item_id: int, db: Session) -> NormalizedItem:
    return db.query(NormalizedItem).options(
        joinedload(NormalizedItem.supplier), joinedload(NormalizedItem.aliases),
    ).filter(NormalizedItem.id == item_id).first()


@router.post("/{item_id}/aliases", response_model=NormalizedItemOut)
def add_alias(item_id: int, data: NormalizedAliasAdd, db: Session = Depends(get_db), _=_can_settings):
    """Aggiunge un alias (nome grezzo distinta) alla voce normalizzata. csv_name
    normalizzato (trim+lower) e globalmente unico: se già usato da un'altra voce
    → 400. Stessa tabella/normalizzazione del flusso ordini-normalizzati-da-file."""
    item = db.query(NormalizedItem).filter(NormalizedItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Normalizzato non trovato")
    key = normalize_alias(data.csv_name)
    if not key:
        raise HTTPException(400, "Alias vuoto")
    existing = db.query(NormalizedAlias).filter(NormalizedAlias.csv_name == key).first()
    if existing:
        if existing.normalized_item_id == item_id:
            raise HTTPException(400, f"Alias «{key}» già presente su questa voce")
        other = db.query(NormalizedItem).filter(NormalizedItem.id == existing.normalized_item_id).first()
        other_name = other.code if other else f"id {existing.normalized_item_id}"
        raise HTTPException(400, f"Alias «{key}» già usato dalla voce «{other_name}»: rimuovilo prima da lì")
    db.add(NormalizedAlias(csv_name=key, normalized_item_id=item_id))
    db.commit()
    return _item_out(item_id, db)


@router.delete("/{item_id}/aliases/{alias_id}", response_model=NormalizedItemOut)
def delete_alias(item_id: int, alias_id: int, db: Session = Depends(get_db), _=_can_settings):
    """Rimuove un alias dalla voce normalizzata."""
    alias = db.query(NormalizedAlias).filter(
        NormalizedAlias.id == alias_id, NormalizedAlias.normalized_item_id == item_id,
    ).first()
    if not alias:
        raise HTTPException(404, "Alias non trovato")
    db.delete(alias)
    db.commit()
    return _item_out(item_id, db)
