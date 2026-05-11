"""Feed attività globale del team.

Diverso da /api/notifications (inbox personale): qui ogni utente con permesso
'dashboard' vede TUTTE le attività generate dal sistema, paginate, in ordine
cronologico desc.
"""
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.security import require_permission, get_current_user
from app.models import Notification, NotificationRead, User

router = APIRouter(prefix="/api", tags=["activity"])

_can_view = require_permission('dashboard')


def _serialize_with_actor(n: Notification, read: Optional[NotificationRead]) -> dict:
    """Come serialize_notification ma include 'created_by' (chi ha causato l'evento)."""
    actor = None
    if n.created_by:
        actor = {
            "id": n.created_by.id,
            "username": n.created_by.username,
            "full_name": n.created_by.full_name,
        }
    return {
        "id": n.id,
        "type": n.type,
        "title": n.title,
        "body": n.body,
        "data": n.data_json or {},
        "requires_action": bool(n.requires_action),
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "created_by": actor,
        "read_at": read.read_at.isoformat() if read and read.read_at else None,
        "confirmed_at": read.confirmed_at.isoformat() if read and read.confirmed_at else None,
    }


@router.get("/activity")
def list_activity(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
    page: int = 1,
    page_size: int = 20,
    type: Optional[str] = None,
    q: Optional[str] = None,
):
    """Lista paginata attività globali.

    Filtri opzionali:
    - `type` (es. 'quote_completed', 'materials_ordered')
    - `q` ricerca testuale su titolo, body, username/full_name del creatore
    """
    if page_size > 100:
        page_size = 100
    query = db.query(Notification).options(joinedload(Notification.created_by))
    if type:
        query = query.filter(Notification.type == type)
    if q and q.strip():
        from sqlalchemy import or_
        like = f"%{q.strip()}%"
        query = (
            query
            .outerjoin(User, User.id == Notification.created_by_user_id)
            .filter(or_(
                Notification.title.ilike(like),
                Notification.body.ilike(like),
                User.username.ilike(like),
                User.full_name.ilike(like),
            ))
            .distinct()
        )
    query = query.order_by(Notification.created_at.desc())
    offset = (page - 1) * page_size
    notifications = query.offset(offset).limit(page_size).all()

    if not notifications:
        return []

    reads = {
        r.notification_id: r
        for r in db.query(NotificationRead)
        .filter(NotificationRead.user_id == current_user.id)
        .filter(NotificationRead.notification_id.in_([n.id for n in notifications]))
        .all()
    }
    return [_serialize_with_actor(n, reads.get(n.id)) for n in notifications]
