"""TD-10 — broker SSE: il segnale di push viene emesso AL COMMIT della
notifica (non prima), scartato sul rollback, e solo ai destinatari.

DB SQLite in-memory (fixture db_session). Il subscriber usa un event loop
FINTO (nel test non gira un loop asyncio): registra le chiamate invece di
schedularle, così possiamo asserire quante volte è stato svegliato.
"""
import pytest

import app.services.notification_stream as ns
from app.services.notifications import create_notification


class _FakeLoop:
    """Sostituto dell'event loop: esegue subito invece di schedulare."""
    def __init__(self):
        self.calls = 0

    def call_soon_threadsafe(self, fn, *args):
        self.calls += 1
        fn(*args)


@pytest.fixture
def sub_amm():
    """Un subscriber 'amministrazione' registrato nel broker, rimosso a fine test."""
    s = ns.Subscriber(user_id=1, role="amministrazione", loop=_FakeLoop())
    ns._subscribers.add(s)
    try:
        yield s
    finally:
        ns._subscribers.discard(s)


def test_signal_emitted_on_commit(db_session, sub_amm):
    create_notification(db_session, type="quote_submitted", title="t",
                        target_roles=["amministrazione"])
    assert sub_amm.loop.calls == 1


def test_no_signal_for_other_role(db_session, sub_amm):
    create_notification(db_session, type="quote_submitted", title="t",
                        target_roles=["ufficio_tecnico"])
    assert sub_amm.loop.calls == 0


def test_signal_gated_until_caller_commit(db_session, sub_amm):
    # commit=False: la notifica vive nella transazione del chiamante → il
    # segnale NON parte finché il chiamante non committa.
    create_notification(db_session, type="quote_submitted", title="t",
                        target_roles=["amministrazione"], commit=False)
    assert sub_amm.loop.calls == 0
    db_session.commit()
    assert sub_amm.loop.calls == 1


def test_signal_dropped_on_rollback(db_session, sub_amm):
    create_notification(db_session, type="quote_submitted", title="t",
                        target_roles=["amministrazione"], commit=False)
    db_session.rollback()      # after_soft_rollback svuota i pendenti
    db_session.commit()        # commit senza pendenti → nessun segnale
    assert sub_amm.loop.calls == 0


def test_signal_by_target_user(db_session, sub_amm):
    # Match anche per destinatario diretto (target_user_id), non solo per ruolo.
    create_notification(db_session, type="quote_read", title="t", target_user_id=1)
    assert sub_amm.loop.calls == 1
