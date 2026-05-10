from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from app.core.database import get_db, utc_now
from app.core.security import require_permission, get_current_user
from app.models import Notification, NotificationRead, User

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

_can_view = require_permission('notifications')


def _is_target(n: Notification, user: User) -> bool:
    """Check whether a user is a recipient of a given notification."""
    if n.target_user_id == user.id:
        return True
    if n.target_roles and user.role in n.target_roles:
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


def serialize_notification(n: Notification, read: Optional[NotificationRead]) -> dict:
    return {
        "id": n.id,
        "type": n.type,
        "title": n.title,
        "body": n.body,
        "data": n.data_json or {},
        "requires_action": bool(n.requires_action),
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "read_at": read.read_at.isoformat() if read and read.read_at else None,
        "confirmed_at": read.confirmed_at.isoformat() if read and read.confirmed_at else None,
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
    return [serialize_notification(n, reads.get(n.id)) for n in visible]


@router.get("")
def list_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
    limit: int = 50,
):
    return _user_notifications(db, current_user, limit=limit)


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
        raise HTTPException(status_code=404, detail="Notification not found")
    if not _is_target(notification, current_user):
        raise HTTPException(status_code=403, detail="Not a recipient")
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


@router.post("/{notification_id}/confirm")
def mark_confirmed(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
):
    notification = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    if not notification.requires_action:
        raise HTTPException(status_code=400, detail="Notification does not require action")
    if not _is_target(notification, current_user):
        raise HTTPException(status_code=403, detail="Not a recipient")
    read = db.query(NotificationRead).filter(
        NotificationRead.notification_id == notification_id,
        NotificationRead.user_id == current_user.id,
    ).first()
    if not read:
        read = NotificationRead(notification_id=notification_id, user_id=current_user.id)
        db.add(read)
    now = utc_now()
    if not read.read_at:
        read.read_at = now
    read.confirmed_at = now
    db.commit()
    return {"ok": True}
