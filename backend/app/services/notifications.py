"""Generic in-app notifications.

Add a notification by calling create_notification(...). The frontend's polling
hook will pick it up. Any future feature (tool stock, deadlines, etc.) can use
this without touching the rest of the app — just pass a unique `type`.
"""
from typing import Optional
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Notification
from app.services.notification_stream import queue_publish

# Ruolo sentinella per eventi "solo feed Attività": un broadcast (target_user_id
# NULL) con questo target_roles compare nel feed team (/api/activity + dashboard
# activity, che filtrano solo target_user_id) ma NON nell'inbox personale di
# nessuno (l'inbox filtra `user.role in target_roles`, e nessun ruolo reale ha
# questo slug). Usato per tracciare eventi informativi senza pingare la campanella.
ACTIVITY_FEED_ROLE = "__activity__"


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
    commit: bool = True,
) -> Optional[Notification]:
    """Create and persist a notification.

    Either `target_roles` (broadcast to roles) or `target_user_id` (1-to-1) must be set.
    Both can be set simultaneously to broadcast AND target a specific user.

    Se `data` contiene `quote_id`, viene estratto in `target_quote_id`. Per le notifiche
    `quote_completed` esiste un UNIQUE INDEX parziale (type, target_user_id, target_quote_id):
    in caso di race concorrente lo INSERT duplicato fallisce con IntegrityError, che cattuiamo
    silenziosamente — la notifica esiste già.

    F7 — `commit=False`: NON committa; aggiunge solo alla sessione, così la
    notifica viene persistita nella STESSA transazione (e nello stesso commit)
    del cambio di stato del chiamante → atomicità stato↔notifica (niente notifica
    persa se il processo muore fra i due commit). Il chiamante deve poi fare
    `db.commit()`. NON usare `commit=False` per tipi con UNIQUE dedupe
    (`quote_completed`): un duplicato farebbe fallire il commit del chiamante e
    annullerebbe anche il cambio di stato — quei tipi restano su `commit=True`,
    protetti dal catch IntegrityError qui sotto (su SQLite le FK non sono enforce,
    quindi l'`add` di un target inesistente non solleva).
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
    # TD-10: segnale SSE emesso AL COMMIT (della sessione, propria o del
    # chiamante se commit=False) → push reale solo a notifica persistita.
    queue_publish(db, target_user_id, target_roles)
    if not commit:
        return notification
    try:
        db.commit()
    except IntegrityError:
        # Notifica già esistente (UNIQUE INDEX su quote_completed). Race risolto a livello DB.
        db.rollback()
        return None
    db.refresh(notification)
    return notification


def emit_activity(
    db: Session,
    *,
    type: str,
    title: str,
    body: Optional[str] = None,
    created_by_user_id: Optional[int] = None,
    data: Optional[dict] = None,
    commit: bool = True,
) -> Optional[Notification]:
    """Emette un evento SOLO nel feed Attività del team (broadcast sentinella
    `ACTIVITY_FEED_ROLE`: compare nel feed ma non nell'inbox di nessuno).

    Da AFFIANCARE, non sostituire, alle eventuali notifiche personali dello
    stesso evento (es. quote_confirmed va anche nell'inbox del creatore). Il
    feed scatta sempre; la notifica personale resta condizionale nel chiamante.
    """
    return create_notification(
        db,
        type=type,
        title=title,
        body=body,
        created_by_user_id=created_by_user_id,
        target_roles=[ACTIVITY_FEED_ROLE],
        data=data,
        commit=commit,
    )
