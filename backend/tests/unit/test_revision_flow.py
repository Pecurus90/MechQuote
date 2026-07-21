"""TD-16 — percorso 'in revisione': rimando indietro → in_revisione con
snapshot prezzo, poi reinvio → inviato. DB in-memory isolato.
"""
from types import SimpleNamespace

from app.api.quotes import reopen_quote, update_quote_status
from app.models import Quote
from app.schemas import QuoteStatusUpdate


def _user(uid=1):
    return SimpleNamespace(id=uid, full_name='U', username='u', _permissions=['quotes.confirm', 'quotes.send'])


def _quote(db, **kw):
    data = dict(quote_number='Q-9', quote_type='single', status='letto',
                created_by_user_id=1, final_total=1234.5)
    data.update(kw)
    q = Quote(**data)
    db.add(q); db.commit(); db.refresh(q)
    return q


def test_reopen_va_in_revisione_con_snapshot_prezzo(db_session):
    q = _quote(db_session)
    reopen_quote(q.id, db_session, _user(), None)
    db_session.refresh(q)
    assert q.status == 'in_revisione'
    assert q.revision_baseline_total == 1234.5     # prezzo congelato
    assert q.revision_baseline_at is not None
    assert q.submitted_at is None and q.read_at is None   # ciclo azzerato


def test_invio_consentito_da_in_revisione(db_session):
    q = _quote(db_session, status='in_revisione')
    update_quote_status(q.id, QuoteStatusUpdate(status='inviato'), db_session, _user(), None)
    db_session.refresh(q)
    assert q.status == 'inviato'


def test_notifica_reopen_va_a_chi_ha_inviato(db_session):
    from app.models import Notification
    # creato da 1, inviato da 2; rimandato indietro dall'admin 3 → notifica a 2.
    q = _quote(db_session, status='letto', submitted_by_user_id=2)
    admin = SimpleNamespace(id=3, full_name='Laura', username='laura',
                            _permissions=['quotes.confirm', 'quotes.view_all'])
    reopen_quote(q.id, db_session, admin, None)
    n = db_session.query(Notification).filter(
        Notification.type == 'quote_reopened',
        Notification.target_quote_id == q.id,
    ).first()
    assert n is not None and n.target_user_id == 2   # chi ha inviato, non il creatore


def test_invio_bloccato_da_stati_non_ammessi(db_session):
    import pytest
    from fastapi import HTTPException
    q = _quote(db_session, status='letto')
    with pytest.raises(HTTPException) as ei:
        update_quote_status(q.id, QuoteStatusUpdate(status='inviato'), db_session, _user(), None)
    assert ei.value.status_code == 400
