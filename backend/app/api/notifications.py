import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.database import get_db, utc_now, SessionLocal
from app.core.security import require_permission, get_current_user, get_user_from_token
from app.models import Notification, NotificationRead, Quote, User
from app.services import notification_stream

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

_can_view = require_permission('notifications')


def _is_target(n: Notification, user: User) -> bool:
    """Check whether a user is a recipient of a given notification."""
    if n.target_user_id == user.id:
        return True
    if n.target_roles and user.role in n.target_roles:
        # F6: niente auto-notifica sui broadcast di ruolo. Chi ha generato
        # l'evento (invio preventivo, ordine materiali/utensili) fa parte del
        # ruolo destinatario ma non deve vedere la notifica del proprio gesto.
        # Resta destinatario se la notifica lo targetta esplicitamente (ramo
        # target_user_id sopra).
        if n.created_by_user_id is not None and n.created_by_user_id == user.id:
            return False
        return True
    return False


def _query_for_user(db: Session, user: User):
    """Notifications visible to this user (escluso dismissed).

    Cap a 200 righe candidate: il filtro fine `target_roles in user.role`
    avviene in Python (vedi `_is_target`). Senza cap, una notifica con
    target_roles popolato genererebbe N row caricate per ogni polling.
    L'inbox UI mostra max 50 — 200 candidate sono un margine confortevole.
    """
    dismissed_subq = db.query(NotificationRead.notification_id).filter(
        NotificationRead.user_id == user.id,
        NotificationRead.dismissed_at.isnot(None),
    ).subquery()
    return db.query(Notification).filter(
        ~Notification.id.in_(dismissed_subq),
        or_(
            Notification.target_user_id == user.id,
            # SQLite: target_roles is JSON; we filter in Python for simplicity & portability.
            # For Postgres later, switch to a JSONB containment operator.
            Notification.target_roles.isnot(None),
        )
    ).order_by(Notification.created_at.desc()).limit(200)


def serialize_notification(
    n: Notification, read: Optional[NotificationRead], customer_name: Optional[str] = None
) -> dict:
    return {
        "id": n.id,
        "type": n.type,
        "title": n.title,
        "body": n.body,
        "data": n.data_json or {},
        # Cliente del preventivo collegato (se la notifica riguarda un quote):
        # arricchito qui invece che in ogni create_notification (DRY).
        "customer_name": customer_name,
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "read_at": read.read_at.isoformat() if read and read.read_at else None,
    }


def _user_notifications(db: Session, user: User, *, limit: Optional[int] = None) -> list[dict]:
    """Return serialized notifications for the current user, with read state."""
    candidates = _query_for_user(db, user).all()
    visible = [n for n in candidates if _is_target(n, user)]
    if limit:
        visible = visible[:limit]
    if not visible:
        return []
    reads = {
        r.notification_id: r
        for r in db.query(NotificationRead)
        .filter(NotificationRead.user_id == user.id)
        .filter(NotificationRead.notification_id.in_([n.id for n in visible]))
        .all()
    }
    # Nome cliente per le notifiche legate a un preventivo (una sola query).
    quote_ids = {n.target_quote_id for n in visible if n.target_quote_id}
    customers: dict[int, str] = {}
    if quote_ids:
        customers = {
            qid: cname
            for qid, cname in db.query(Quote.id, Quote.customer_name)
            .filter(Quote.id.in_(quote_ids)).all()
        }
    return [
        serialize_notification(n, reads.get(n.id), customers.get(n.target_quote_id))
        for n in visible
    ]


@router.get("")
def list_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
    limit: int = 50,
):
    return _user_notifications(db, current_user, limit=limit)


@router.get("/stream")
async def stream(request: Request, token: str):
    """TD-10 — stream SSE: push in tempo reale quando arriva una notifica.

    `EventSource` non può inviare header Authorization → il token viaggia in
    query param e viene validato qui. Emette `event: notify` a ogni notifica
    destinata all'utente (il client rifà /unread-count) e un keepalive ogni 20s
    per tenere viva la connessione dietro i proxy. La sessione DB si usa solo
    per autenticare e si chiude subito: lo stream NON tiene aperta una
    connessione al database."""
    db = SessionLocal()
    try:
        user = get_user_from_token(token, db)
        perms = list(getattr(user, "_permissions", []))
        uid, role = user.id, user.role
    finally:
        db.close()
    if "notifications" not in perms:
        raise HTTPException(status_code=403, detail="Permesso negato")

    sub = notification_stream.subscribe(uid, role)

    async def gen():
        try:
            yield ": connected\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    await asyncio.wait_for(sub.queue.get(), timeout=20)
                    yield "event: notify\ndata: 1\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            notification_stream.unsubscribe(sub)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",   # disabilita il buffering su proxy (nginx)
        },
    )


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
):
    items = _user_notifications(db, current_user)
    count = sum(1 for it in items if not it["read_at"])
    return {"count": count}


@router.post("/{notification_id}/read")
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
):
    notification = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notifica non trovata")
    if not _is_target(notification, current_user):
        raise HTTPException(status_code=403, detail="Non sei destinatario di questa notifica")
    read = db.query(NotificationRead).filter(
        NotificationRead.notification_id == notification_id,
        NotificationRead.user_id == current_user.id,
    ).first()
    if not read:
        read = NotificationRead(notification_id=notification_id, user_id=current_user.id)
        db.add(read)
    if not read.read_at:
        read.read_at = utc_now()
    db.commit()
    return {"ok": True}


@router.post("/clear-read")
def clear_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
):
    """Nasconde dal pannello dell'utente corrente tutte le notifiche già lette.

    Non elimina la notifica globalmente — gli altri destinatari continuano a vederla.
    Imposta dismissed_at su NotificationRead per ogni notifica letta.
    """
    items = _user_notifications(db, current_user)
    read_ids = [it["id"] for it in items if it["read_at"]]
    if not read_ids:
        return {"cleared": 0}
    now = utc_now()
    reads = db.query(NotificationRead).filter(
        NotificationRead.user_id == current_user.id,
        NotificationRead.notification_id.in_(read_ids),
    ).all()
    for r in reads:
        if not r.dismissed_at:
            r.dismissed_at = now
    db.commit()
    return {"cleared": len(read_ids)}


@router.post("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
):
    """Segna lette tutte le notifiche visibili non ancora lette per l'utente."""
    items = _user_notifications(db, current_user)
    unread_ids = [it["id"] for it in items if not it["read_at"]]
    if not unread_ids:
        return {"marked": 0}
    existing = {
        r.notification_id: r for r in db.query(NotificationRead).filter(
            NotificationRead.user_id == current_user.id,
            NotificationRead.notification_id.in_(unread_ids),
        ).all()
    }
    now = utc_now()
    for nid in unread_ids:
        r = existing.get(nid)
        if not r:
            r = NotificationRead(notification_id=nid, user_id=current_user.id)
            db.add(r)
        if not r.read_at:
            r.read_at = now
    db.commit()
    return {"marked": len(unread_ids)}
