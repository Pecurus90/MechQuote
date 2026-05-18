import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload
from typing import List

from app.core.database import get_db, utc_now
from app.core.security import require_permission, get_current_user
from app.models import Quote, Part, ManufacturingPhase, User, CompanySettings, DieNormalizedItem
from app.schemas import QuoteCreate, QuoteUpdate, QuoteOut, QuoteStatusUpdate
from app.services.calculation import recalculate_part
from app.services.notifications import create_notification

logger = logging.getLogger(__name__)
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
        joinedload(Quote.die_spec),
        joinedload(Quote.die_normalized_items).joinedload(DieNormalizedItem.supplier),
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
def list_quotes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100,
):
    # ACL: chi non ha 'quotes.view_all' (default: admin + amministrazione)
    # vede solo i preventivi che ha creato lui. Allineato a dashboard.my-quotes
    # filter (created_by_user_id).
    query = db.query(Quote).options(
        joinedload(Quote.parts).options(
            joinedload(Part.phases),
            joinedload(Part.material),
        )
    )
    if 'quotes.view_all' not in getattr(current_user, '_permissions', []):
        query = query.filter(Quote.created_by_user_id == current_user.id)
    return query.offset(skip).limit(limit).all()


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

    # Pre-check duplicato: meglio 400 esplicito di un IntegrityError 500
    if db.query(Quote).filter(Quote.quote_number == quote_data["quote_number"]).first():
        raise HTTPException(status_code=400, detail=f"Numero preventivo '{quote_data['quote_number']}' già esistente")

    quote = Quote(**quote_data)
    if not quote.quote_date:
        quote.quote_date = date_type.today()
    quote.created_by_user_id = current_user.id

    # Applica i default da CompanySettings dove l'utente non ha specificato un valore.
    # `exclude_unset=True` su quote_data permette di distinguere "non passato" da "passato a 0".
    cs = db.query(CompanySettings).filter(CompanySettings.id == 1).first()
    if cs:
        if "global_margin_percent" not in quote_data:
            quote.global_margin_percent = cs.default_margin_percent
        if "transport_cost" not in quote_data:
            quote.transport_cost = cs.default_transport_cost
        if "packaging_cost" not in quote_data:
            quote.packaging_cost = cs.default_packaging_cost

    db.add(quote)
    try:
        db.commit()
    except IntegrityError:
        # Race: due POST simultanei con stesso quote_number passano entrambi
        # il pre-check (riga sopra) e poi una commit fallisce per UNIQUE
        # constraint violato. Senza catch, l'utente vedeva 500 generico.
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Numero preventivo '{quote_data['quote_number']}' già esistente",
        )
    db.refresh(quote)

    # Auto-create parts based on quote type
    default_min_price = cs.default_minimum_part_price if cs else 0.0
    if quote.quote_type == "commessa" and num_components and num_components > 0:
        for i in range(1, num_components + 1):
            part = Part(
                quote_id=quote.id,
                part_code=f"{quote.quote_number}_{i:02d}",
                quantity=default_quantity,
                quote_mode="manual",
                minimum_price=default_min_price,
            )
            db.add(part)
    else:
        # Single part — code matches the quote number
        part = Part(
            quote_id=quote.id,
            part_code=quote.quote_number or "P01",
            quantity=default_quantity,
            quote_mode="manual",
            minimum_price=default_min_price,
        )
        db.add(part)

    db.commit()

    logger.info("Quote creato: id=%s number=%r by=%s parts=%d",
                quote.id, quote.quote_number, current_user.username,
                num_components if num_components else 1)
    result = _load_quote(quote.id, db)
    return result


@router.get("/{quote_id}", response_model=QuoteOut)
def get_quote(quote_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    quote = _load_quote(quote_id, db)
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")

    # Auto-mark "completato" quando un utente con quotes.complete apre un quote 'inviato'.
    # Il creator (ufficio_tecnico) non ha questo permesso, quindi aprire la propria bozza
    # non altera mai il workflow — invariante by-design.
    #
    # Atomicità sotto carico concorrente:
    # 1. L'UPDATE filtra `WHERE status='inviato'`: SQLite serializza le scritture, quindi
    #    solo UN thread effettivamente cambia status da 'inviato' a 'completato' e scrive
    #    il proprio user.id come completed_by_user_id. Gli altri thread vedono già
    #    'completato' nel WHERE → 0 righe modificate → completed_by_user_id resta del primo.
    # 2. Dopo il commit, ricarica e crea la notifica solo se completed_by_user_id == me:
    #    questo è il "vincitore" della race. Niente notifiche duplicate al creatore.
    perms = getattr(current_user, '_permissions', [])
    if quote.status == 'inviato' and 'quotes.complete' in perms:
        now = utc_now()
        db.execute(
            text("UPDATE quotes SET status='completato', "
                 "completed_by_user_id=:uid, completed_at=:ts "
                 "WHERE id=:qid AND status='inviato'"),
            {"uid": current_user.id, "ts": now, "qid": quote_id},
        )
        db.commit()
        db.refresh(quote)
        if quote.status == 'completato' and quote.submitted_by_user_id:
            # La notifica al creatore è dedupata via UNIQUE INDEX su DB
            # (type, target_user_id, target_quote_id WHERE type='quote_completed').
            # Race concorrenti producono al massimo 1 notifica.
            reviewer_name = current_user.full_name or current_user.username
            type_label = 'stampo ' if quote.quote_type == 'die' else ''
            create_notification(
                db,
                type='quote_completed',
                title=f"Preventivo {type_label}{quote.quote_number} completato",
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
        raise HTTPException(status_code=404, detail="Preventivo non trovato")

    # Only one explicit transition is allowed via this endpoint: bozza → inviato.
    # The reverse path (inviato → completato) is handled automatically in GET when an
    # admin/amministrazione user opens it. 'completato' is terminal.
    if data.status != 'inviato':
        raise HTTPException(status_code=400, detail="Solo la transizione a 'inviato' è permessa qui")
    if quote.status != 'bozza':
        raise HTTPException(status_code=400, detail=f"Impossibile inviare: stato corrente '{quote.status}'")

    quote.status = 'inviato'
    quote.submitted_by_user_id = current_user.id
    quote.submitted_at = utc_now()
    db.commit()
    # Notifica chi può completare (admin + amministrazione)
    sender_name = current_user.full_name or current_user.username
    type_label = 'stampo ' if quote.quote_type == 'die' else ''
    create_notification(
        db,
        type='quote_submitted',
        title=f"Preventivo {type_label}{quote.quote_number} da revisionare",
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
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    ensure_editable(quote, current_user)
    payload = data.model_dump(exclude_unset=True)
    # quote_type immutabile post-create: cambiare il tipo dopo la creazione
    # corromperebbe le tabelle satellite (DieSpec orphan se die → single,
    # o spec mancante se single → die). Rifiuta esplicitamente.
    if 'quote_type' in payload and payload['quote_type'] != quote.quote_type:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo preventivo non modificabile (attuale: '{quote.quote_type}')",
        )
    for key, value in payload.items():
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
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
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
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
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
    # Cancella prima le notifiche legate al quote (FK target_quote_id non ha CASCADE su SQLite).
    # SQLite ricicla gli id, quindi notifiche orfane causerebbero IntegrityError sul UNIQUE INDEX
    # quando si crea un nuovo quote che riusa lo stesso id.
    # Cancella anche le NotificationRead associate (altrimenti restano "dismissed" per id riciclati).
    db.execute(text(
        "DELETE FROM notification_reads WHERE notification_id IN "
        "(SELECT id FROM notifications WHERE target_quote_id = :qid)"
    ), {"qid": quote_id})
    db.execute(text("DELETE FROM notifications WHERE target_quote_id = :qid"), {"qid": quote_id})
    db.delete(quote)
    db.commit()
    logger.info("Quote eliminato: id=%s number=%r by=%s",
                quote_id, quote.quote_number, current_user.username)
    return {"ok": True}


