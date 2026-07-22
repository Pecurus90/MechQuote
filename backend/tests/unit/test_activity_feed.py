"""§28 — il feed Attività (team) esclude le notifiche personali 1-a-1.

Le broadcast per ruolo (target_user_id NULL) restano visibili; quelle dirette a
un singolo utente (target_user_id valorizzato) no.
"""
from types import SimpleNamespace

from app.api.activity import list_activity
from app.api.dashboard import get_activity
from app.models import Notification


def _user():
    return SimpleNamespace(id=1, username='u', full_name='U', role='admin',
                           _permissions=['dashboard'])


def _seed(db):
    db.add(Notification(type='quote_submitted', title='team-broadcast', body='',
                        target_roles=['admin', 'amministrazione'], created_by_user_id=2))
    db.add(Notification(type='quote_reopened', title='personale', body='',
                        target_user_id=5, created_by_user_id=2))
    db.commit()


def test_list_activity_esclude_personali(db_session):
    _seed(db_session)
    rows = list_activity(db=db_session, current_user=_user(), _=None,
                         page=1, page_size=20, type=None, q=None)
    titles = {r['title'] for r in rows}
    assert 'team-broadcast' in titles
    assert 'personale' not in titles          # notifica 1-a-1 filtrata


def test_dashboard_activity_esclude_personali(db_session):
    _seed(db_session)
    rows = get_activity(db=db_session, current_user=_user(), _=None, limit=10)
    titles = {r['title'] for r in rows}
    assert 'team-broadcast' in titles
    assert 'personale' not in titles
