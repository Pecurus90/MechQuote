"""TD-10 — push in tempo reale delle notifiche via SSE (Server-Sent Events).

Broker in-process: gli endpoint SSE (`/api/notifications/stream`) si iscrivono
con `subscribe()`; `create_notification` accoda un segnale con `queue_publish()`
che viene emesso **al commit** della transazione (listener `after_commit`), così
il client rifà il fetch solo quando la notifica è davvero persistita. Nessun
payload: il segnale dice "aggiorna", il client richiama /unread-count che applica
il filtro destinatari corretto → over-signaling innocuo, mai notifiche perse.

Limiti (documentati): funziona con **un solo worker** uvicorn (broker in
memoria di processo). Con più worker servirebbe un bus esterno (Redis pub/sub).
Per uso interno a worker singolo è la soluzione giusta (meno è meglio).
"""
import asyncio
import logging
from typing import Optional

from sqlalchemy import event
from sqlalchemy.orm import Session as SASession

logger = logging.getLogger("mechquote.notifications")

_INFO_KEY = "notif_publish"


class Subscriber:
    """Una connessione SSE aperta: coda + identità per il match dei destinatari."""
    def __init__(self, user_id: int, role: Optional[str], loop: asyncio.AbstractEventLoop):
        self.user_id = user_id
        self.role = role
        self.loop = loop
        self.queue: asyncio.Queue = asyncio.Queue()


_subscribers: set[Subscriber] = set()


def subscribe(user_id: int, role: Optional[str]) -> Subscriber:
    """Registra una connessione SSE (chiamata dentro l'event loop)."""
    sub = Subscriber(user_id, role, asyncio.get_running_loop())
    _subscribers.add(sub)
    return sub


def unsubscribe(sub: Subscriber) -> None:
    _subscribers.discard(sub)


def _emit(target_user_id: Optional[int], target_roles: list[str]) -> None:
    """Sveglia i subscriber destinatari (thread-safe: chiamato da thread sync)."""
    roles = set(target_roles or [])
    for sub in list(_subscribers):
        if (target_user_id is not None and sub.user_id == target_user_id) or (sub.role in roles):
            try:
                sub.loop.call_soon_threadsafe(sub.queue.put_nowait, 1)
            except RuntimeError:
                # Event loop chiuso (shutdown): il subscriber verrà rimosso.
                pass


def queue_publish(db: SASession, target_user_id: Optional[int], target_roles: Optional[list[str]]) -> None:
    """Accoda un segnale da emettere al commit della sessione `db`.

    Se il commit non avviene (rollback), il segnale viene scartato. Così una
    notifica creata con `commit=False` viene notificata solo se il commit del
    chiamante va a buon fine (atomicità stato↔notifica↔push)."""
    db.info.setdefault(_INFO_KEY, []).append((target_user_id, list(target_roles or [])))


@event.listens_for(SASession, "after_commit")
def _flush_on_commit(session: SASession) -> None:
    pending = session.info.pop(_INFO_KEY, None)
    if not pending:
        return
    for target_user_id, target_roles in pending:
        _emit(target_user_id, target_roles)


@event.listens_for(SASession, "after_soft_rollback")
def _drop_on_rollback(session: SASession, previous_transaction) -> None:
    session.info.pop(_INFO_KEY, None)
