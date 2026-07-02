import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload
from typing import List

from app.core.database import get_db, utc_now
from app.core.security import require_permission, get_current_user
from app.models import (
    Quote, Part, ManufacturingPhase, QuoteSupplierOrder, User,
    CompanySettings, DieNormalizedItem,
)
from app.schemas import QuoteCreate, QuoteUpdate, QuoteOut, QuoteStatusUpdate
from app.services import quote_workflow as wf
from app.services.calculation import recalculate_part
from app.services.notifications import create_notification

logger = logging.getLogger(__name__)
_can_write = require_permission('quotes.create')
_can_send = require_permission('quotes.send')
_can_confirm = require_permission('quotes.confirm')

router = APIRouter(prefix="/api/quotes", tags=["quotes"])


def _load_quote(quote_id: int, db: Session) -> Quote:
    return db.query(Quote).options(
        joinedload(Quote.parts).options(
            joinedload(Part.phases).options(
                # CAT-1 Fase 2: PhaseOut espone le voci di catalogo agganciate
                # (machine/operation/treatment/supplier) per costruire l'option
                # "ritirato" nelle dropdown del preventivatore quando il GET
                # di lista è filtrato `?active=true`. Joinedload mirato per
                # evitare N+1 in serializzazione.
                joinedload(ManufacturingPhase.machine),
                joinedload(ManufacturingPhase.operation),
                joinedload(ManufacturingPhase.treatment),
                joinedload(ManufacturingPhase.supplier),
            ),
            joinedload(Part.material),
            joinedload(Part.files),
        ),
        joinedload(Quote.customer),
        joinedload(Quote.submitted_by),
        joinedload(Quote.read_by),
        joinedload(Quote.confirmed_by),
        joinedload(Quote.completed_by),
        joinedload(Quote.die_spec),
        joinedload(Quote.die_normalized_items).joinedload(DieNormalizedItem.supplier),
    ).filter(Quote.id == quote_id).first()


def ensure_editable(quote: Quote, current_user: User) -> None:
    """Modificabile fino a 'letto'; bloccato dalla Conferma.

    Spec 18: si modifica in bozza/inviato/letto, poi la Conferma manuale di
    amministrazione blocca (confermato/completo). Chi ha 'quotes.edit_locked'
    (default: solo admin) può modificare anche i preventivi bloccati.
    Esportata per parts.py / phases.py — mutare parti o fasi è modificare il
    preventivo.
    """
    if wf.is_editable(quote.status):
        return
    if 'quotes.edit_locked' in getattr(current_user, '_permissions', []):
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

    # Auto-mark "letto" quando amministrazione (quotes.confirm) apre un 'inviato'
    # (spec 18). Leggere NON completa più nulla: la conferma è manuale. Il
    # creator (ufficio_tecnico) non ha quotes.confirm → aprire la propria bozza
    # non altera il workflow. UPDATE atomico con WHERE status='inviato': sotto
    # concorrenza solo un thread scrive read_by/read_at.
    perms = getattr(current_user, '_permissions', [])
    if quote.status == 'inviato' and 'quotes.confirm' in perms:
        db.execute(
            text("UPDATE quotes SET status='letto', "
                 "read_by_user_id=:uid, read_at=:ts "
                 "WHERE id=:qid AND status='inviato'"),
            {"uid": current_user.id, "ts": utc_now(), "qid": quote_id},
        )
        db.commit()
        db.refresh(quote)

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

    # Questa route gestisce solo bozza → inviato. Il resto del ciclo (spec 18):
    # inviato → letto (auto in GET all'apertura di amministrazione),
    # letto → confermato (POST /confirm), confermato → completo (auto).
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


def notify_quote_completed(db: Session, quote: Quote, actor_user: User) -> None:
    """Notifica al creatore che il preventivo è passato a 'completo'.

    Riusata da confirm_quote e da api/orders.py (ultimo ordine materiale che
    porta il preventivo a completo). Dedupata via UNIQUE INDEX su DB
    (type='quote_completed', target_user_id, target_quote_id).
    """
    target = quote.submitted_by_user_id or quote.created_by_user_id
    if not target:
        return
    actor = actor_user.full_name or actor_user.username
    type_label = 'stampo ' if quote.quote_type == 'die' else ''
    create_notification(
        db,
        type='quote_completed',
        title=f"Preventivo {type_label}{quote.quote_number} completato",
        body=f"Completato ({actor})",
        created_by_user_id=actor_user.id,
        target_user_id=target,
        data={'quote_id': quote.id, 'quote_number': quote.quote_number},
    )


@router.post("/{quote_id}/confirm", response_model=QuoteOut)
def confirm_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_confirm,
):
    """Conferma manuale (amministrazione): letto/inviato → confermato.

    Da qui il preventivo è bloccato in modifica. Se il materiale è già
    risolto (non necessario, tutto evaso, o preventivo stampo) passa subito a
    'completo'.
    """
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    if quote.status not in (wf.STATUS_INVIATO, wf.STATUS_LETTO):
        raise HTTPException(
            status_code=400,
            detail=f"Conferma non possibile dallo stato '{quote.status}'",
        )
    quote.status = wf.STATUS_CONFERMATO
    quote.confirmed_by_user_id = current_user.id
    quote.confirmed_at = utc_now()
    completed = wf.maybe_complete(db, quote, current_user.id)
    db.commit()
    db.refresh(quote)

    actor = current_user.full_name or current_user.username
    if quote.submitted_by_user_id:
        create_notification(
            db,
            type='quote_confirmed',
            title=f"Preventivo {quote.quote_number} confermato",
            body=f"Confermato da {actor}",
            created_by_user_id=current_user.id,
            target_user_id=quote.submitted_by_user_id,
            data={'quote_id': quote.id, 'quote_number': quote.quote_number},
        )
    if completed:
        notify_quote_completed(db, quote, current_user)
    return _load_quote(quote_id, db)


@router.post("/{quote_id}/reopen", response_model=QuoteOut)
def reopen_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_confirm,
):
    """Rimanda in bozza (amministrazione): inviato/letto → bozza + notifica creatore."""
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    if quote.status not in (wf.STATUS_INVIATO, wf.STATUS_LETTO):
        raise HTTPException(
            status_code=400,
            detail=f"Rimando in bozza non possibile dallo stato '{quote.status}'",
        )
    creator_id = quote.created_by_user_id
    quote.status = wf.STATUS_BOZZA
    quote.submitted_at = None
    quote.submitted_by_user_id = None
    quote.read_at = None
    quote.read_by_user_id = None
    db.commit()
    db.refresh(quote)

    if creator_id:
        actor = current_user.full_name or current_user.username
        create_notification(
            db,
            type='quote_reopened',
            title=f"Preventivo {quote.quote_number} rimandato in bozza",
            body=f"Rimandato da {actor} — serve una revisione",
            created_by_user_id=current_user.id,
            target_user_id=creator_id,
            data={'quote_id': quote.id, 'quote_number': quote.quote_number},
        )
    return _load_quote(quote_id, db)


@router.post("/{quote_id}/unconfirm", response_model=QuoteOut)
def unconfirm_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Annulla la conferma (confermato/completo → letto).

    Riservato a chi ha 'quotes.edit_locked' (default: solo admin): è la stessa
    capacità di intervenire su un preventivo bloccato. Azzera le coppie
    (preventivo, fornitore) ordinate — l'ordine resta nello storico ma il
    materiale va riordinato — e sblocca la modifica.
    """
    if 'quotes.edit_locked' not in getattr(current_user, '_permissions', []):
        raise HTTPException(status_code=403, detail="Permesso negato: serve 'Modifica preventivi bloccati'")
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    if quote.status not in (wf.STATUS_CONFERMATO, wf.STATUS_COMPLETO):
        raise HTTPException(
            status_code=400,
            detail=f"Nessuna conferma da annullare (stato '{quote.status}')",
        )
    db.query(QuoteSupplierOrder).filter(QuoteSupplierOrder.quote_id == quote_id).delete()
    quote.material_ordered_at = None
    quote.material_ordered_by_user_id = None
    quote.status = wf.STATUS_LETTO
    quote.confirmed_at = None
    quote.confirmed_by_user_id = None
    quote.completed_at = None
    quote.completed_by_user_id = None
    db.commit()
    logger.info("Conferma annullata: quote_id=%s by=%s", quote_id, current_user.username)
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
    payload = data.model_dump(exclude_unset=True)

    # Sprint G — `sold_price` e `actual_cost` sono dati di chiusura commessa
    # (post-completamento): possono essere settati anche su preventivi non
    # editabili (status != bozza) purché lo stato sia `completato`. Devono
    # essere richiesti CON status=completato.
    closeout_fields = {'sold_price', 'actual_cost'}
    closeout_only = payload and set(payload.keys()).issubset(closeout_fields)
    has_closeout = any(k in payload for k in closeout_fields)
    if has_closeout and quote.status != wf.STATUS_COMPLETO:
        raise HTTPException(
            status_code=400,
            detail="sold_price / actual_cost compilabili solo su preventivi completi",
        )
    if not closeout_only:
        ensure_editable(quote, current_user)

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
    can_delete = 'quotes.delete' in getattr(current_user, '_permissions', [])
    is_creator = (
        quote.created_by_user_id is not None
        and quote.created_by_user_id == current_user.id
    )
    if not (can_delete or is_creator):
        raise HTTPException(
            status_code=403,
            detail="Solo il creatore del preventivo o chi ha il permesso di eliminazione possono eliminarlo",
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


