from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List

from app.core.database import get_db
from app.core.security import require_permission, get_current_user
from app.models import Quote, Part, ManufacturingPhase, User
from app.schemas import QuoteCreate, QuoteUpdate, QuoteOut, QuoteStatusUpdate
from app.services.calculation import recalculate_part
from app.services.notifications import create_notification

_can_write = require_permission('quotes.create')
_can_send = require_permission('quotes.send')

router = APIRouter(prefix="/api/quotes", tags=["quotes"])


def _load_quote(quote_id: int, db: Session) -> Quote:
    return db.query(Quote).options(
        joinedload(Quote.parts).options(
            joinedload(Part.phases),
            joinedload(Part.material),
            joinedload(Part.files),
        ),
        joinedload(Quote.customer),
        joinedload(Quote.submitted_by),
        joinedload(Quote.completed_by),
    ).filter(Quote.id == quote_id).first()


def ensure_editable(quote: Quote, current_user: User) -> None:
    """Solo le bozze sono modificabili; admin è sempre l'eccezione (safety net).

    Esportata per uso da parts.py / phases.py — qualsiasi mutazione sulle parti
    o sulle fasi di un preventivo è in effetti una modifica del preventivo stesso.
    """
    if quote.status == 'bozza':
        return
    if current_user.role == 'admin':
        return
    raise HTTPException(
        status_code=403,
        detail=f"Preventivo non più modificabile (stato: {quote.status})",
    )


@router.get("", response_model=List[QuoteOut])
def list_quotes(db: Session = Depends(get_db), skip: int = 0, limit: int = 100):
    quotes = db.query(Quote).options(
        joinedload(Quote.parts).options(
            joinedload(Part.phases),
            joinedload(Part.material),
        )
    ).offset(skip).limit(limit).all()
    return quotes


@router.post("", response_model=QuoteOut)
def create_quote(
    data: QuoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    from datetime import date as date_type

    num_components = data.num_components
    default_quantity = data.default_quantity or 1
    quote_data = data.model_dump(exclude={"num_components", "default_quantity"}, exclude_unset=True)

    quote = Quote(**quote_data)
    if not quote.quote_date:
        quote.quote_date = date_type.today()
    quote.created_by_user_id = current_user.id

    db.add(quote)
    db.commit()
    db.refresh(quote)

    # Auto-create parts based on quote type
    if quote.quote_type == "commessa" and num_components and num_components > 0:
        for i in range(1, num_components + 1):
            part = Part(
                quote_id=quote.id,
                part_code=f"{quote.quote_number}_{i:02d}",
                quantity=default_quantity,
                quote_mode="manual",
            )
            db.add(part)
    else:
        # Single part — code matches the quote number
        part = Part(
            quote_id=quote.id,
            part_code=quote.quote_number or "P01",
            quantity=default_quantity,
            quote_mode="manual",
        )
        db.add(part)

    db.commit()

    result = _load_quote(quote.id, db)
    return result


@router.get("/{quote_id}", response_model=QuoteOut)
def get_quote(quote_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    quote = _load_quote(quote_id, db)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")

    # Auto-mark "completato" when a user with quotes.complete reads a quote in 'inviato' state.
    # The creator (ufficio_tecnico) doesn't have this permission, so opening their own quote
    # never advances the workflow — this is the intended invariant.
    perms = getattr(current_user, '_permissions', [])
    if quote.status == 'inviato' and 'quotes.complete' in perms:
        quote.status = 'completato'
        quote.completed_by_user_id = current_user.id
        quote.completed_at = datetime.utcnow()
        db.commit()
        db.refresh(quote)
        # Notifica al creatore (1-a-1)
        if quote.submitted_by_user_id:
            reviewer_name = current_user.full_name or current_user.username
            create_notification(
                db,
                type='quote_completed',
                title=f"Preventivo {quote.quote_number} completato",
                body=f"Letto da {reviewer_name}",
                created_by_user_id=current_user.id,
                target_user_id=quote.submitted_by_user_id,
                data={'quote_id': quote.id, 'quote_number': quote.quote_number},
            )

    return quote


@router.patch("/{quote_id}/status", response_model=QuoteOut)
def update_quote_status(
    quote_id: int,
    data: QuoteStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_send,
):
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")

    # Only one explicit transition is allowed via this endpoint: bozza → inviato.
    # The reverse path (inviato → completato) is handled automatically in GET when an
    # admin/amministrazione user opens it. 'completato' is terminal.
    if data.status != 'inviato':
        raise HTTPException(status_code=400, detail="Solo la transizione a 'inviato' è permessa qui")
    if quote.status != 'bozza':
        raise HTTPException(status_code=400, detail=f"Impossibile inviare: stato corrente '{quote.status}'")

    quote.status = 'inviato'
    quote.submitted_by_user_id = current_user.id
    quote.submitted_at = datetime.utcnow()
    db.commit()
    # Notifica chi può completare (admin + amministrazione)
    sender_name = current_user.full_name or current_user.username
    create_notification(
        db,
        type='quote_submitted',
        title=f"Preventivo {quote.quote_number} da revisionare",
        body=f"Inviato da {sender_name}",
        created_by_user_id=current_user.id,
        target_roles=['admin', 'amministrazione'],
        data={'quote_id': quote.id, 'quote_number': quote.quote_number},
    )

    return _load_quote(quote_id, db)


@router.put("/{quote_id}", response_model=QuoteOut)
def update_quote(
    quote_id: int,
    data: QuoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    ensure_editable(quote, current_user)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(quote, key, value)
    db.commit()
    return _load_quote(quote_id, db)


@router.post("/{quote_id}/recalculate", response_model=QuoteOut)
def recalculate_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    ensure_editable(quote, current_user)
    for part in db.query(Part).filter(Part.quote_id == quote_id).all():
        recalculate_part(part.id, db)
    return _load_quote(quote_id, db)


@router.delete("/{quote_id}")
def delete_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    is_admin = current_user.role == 'admin'
    is_creator = (
        quote.created_by_user_id is not None
        and quote.created_by_user_id == current_user.id
    )
    if not (is_admin or is_creator):
        raise HTTPException(
            status_code=403,
            detail="Solo il creatore del preventivo o un admin possono eliminarlo",
        )
    db.delete(quote)
    db.commit()
    return {"ok": True}


