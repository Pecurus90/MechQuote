"""Regressione audit M1: gli endpoint di transizione stato applicano l'ACL
per-id (ensure_quote_visible). Un utente con il permesso dell'azione ma senza
'quotes.view_all' e NON creatore non può agire su un preventivo altrui, nemmeno
per id (prima era un IDOR: confermare/riaprire/annullare/ecc. per id).
"""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.quotes import (
    confirm_quote, reopen_quote, unconfirm_quote,
    await_client_quote, mark_not_ordered_quote, restore_quote,
)
from app.models import Quote


def _user(uid, perms):
    return SimpleNamespace(id=uid, full_name='U', username=f'u{uid}', _permissions=list(perms))


def _quote(db, **kw):
    data = dict(quote_number='Q-1', quote_type='single', status='inviato', created_by_user_id=1)
    data.update(kw)
    q = Quote(**data)
    db.add(q); db.commit(); db.refresh(q)
    return q


# Endpoint con dependency _can_confirm (4° arg posizionale ignorato nella chiamata diretta).
_CONFIRM_DEP = [confirm_quote, reopen_quote, await_client_quote, mark_not_ordered_quote, restore_quote]


@pytest.mark.parametrize('endpoint', _CONFIRM_DEP)
def test_transizione_su_preventivo_non_visibile_403(db_session, endpoint):
    q = _quote(db_session)
    stranger = _user(2, ['quotes.confirm'])   # ha il permesso, ma non vede il preventivo
    with pytest.raises(HTTPException) as ei:
        endpoint(q.id, db_session, stranger, None)
    assert ei.value.status_code == 403


def test_unconfirm_su_preventivo_non_visibile_403(db_session):
    q = _quote(db_session, status='confermato')
    stranger = _user(2, ['quotes.edit_locked'])  # passa il check permesso, ma non è visibile
    with pytest.raises(HTTPException) as ei:
        unconfirm_quote(q.id, db_session, stranger)
    assert ei.value.status_code == 403


def test_creatore_non_e_bloccato_dallacl(db_session):
    # Il creatore (senza view_all) resta autorizzato: reopen deve procedere.
    q = _quote(db_session)
    creator = _user(1, ['quotes.confirm'])   # id == created_by_user_id
    reopen_quote(q.id, db_session, creator, None)
    db_session.refresh(q)
    assert q.status == 'bozza'
