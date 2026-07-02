"""Generic in-app notifications.

Add a notification by calling create_notification(...). The frontend's polling
hook will pick it up. Any future feature (tool stock, deadlines, etc.) can use
this without touching the rest of the app — just pass a unique `type`.
"""
from typing import Optional
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Notification


def create_notification(
    db: Session,
    *,
    type: str,
    title: str,
    body: Optional[str] = None,
    created_by_user_id: Optional[int] = None,
    target_roles: Optional[list[str]] = None,
    target_user_id: Optional[int] = None,
    data: Optional[dict] = None,
) -> Optional[Notification]:
    """Create and persist a notification.

    Either `target_roles` (broadcast to roles) or `target_user_id` (1-to-1) must be set.
    Both can be set simultaneously to broadcast AND target a specific user.

    Se `data` contiene `quote_id`, viene estratto in `target_quote_id`. Per le notifiche
    `quote_completed` esiste un UNIQUE INDEX parziale (type, target_user_id, target_quote_id):
    in caso di race concorrente lo INSERT duplicato fallisce con IntegrityError, che cattuiamo
    silenziosamente — la notifica esiste già.
    """
    if not target_roles and target_user_id is None:
        raise ValueError("create_notification requires target_roles or target_user_id")

    quote_id_from_data = (data or {}).get("quote_id")
    target_quote_id = quote_id_from_data if isinstance(quote_id_from_data, int) else None

    notification = Notification(
        type=type,
        title=title,
        body=body,
        data_json=data or {},
        created_by_user_id=created_by_user_id,
        target_roles=target_roles or [],
        target_user_id=target_user_id,
        target_quote_id=target_quote_id,
    )
    db.add(notification)
    try:
        db.commit()
    except IntegrityError:
        # Notifica già esistente (UNIQUE INDEX su quote_completed). Race risolto a livello DB.
        db.rollback()
        return None
    db.refresh(notification)
    return notification
