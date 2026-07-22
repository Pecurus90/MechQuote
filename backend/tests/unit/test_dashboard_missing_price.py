"""KPI "Preventivi senza prezzo": il conteggio resta finché ENTRAMBI i prezzi
del consuntivo (venduto sold_price + costo reale actual_cost) sono compilati.
"""
from types import SimpleNamespace

from app.api.dashboard import get_workflow_stats
from app.models import Quote


def _completo(db, num, sold, cost):
    db.add(Quote(quote_number=num, quote_type='single', status='completo',
                 sold_price=sold, actual_cost=cost))


def test_missing_price_persiste_finche_mancano_entrambi(db_session):
    _completo(db_session, 'Q-both', 100.0, 80.0)   # entrambi → NON contato
    _completo(db_session, 'Q-sold', 100.0, None)   # manca il costo → contato
    _completo(db_session, 'Q-cost', None, 80.0)    # manca il venduto → contato
    _completo(db_session, 'Q-none', None, None)    # mancano entrambi → contato
    db_session.commit()

    user = SimpleNamespace(id=1, role='amministrazione', username='a',
                           full_name='A', _permissions=['quotes.archive'])
    stats = get_workflow_stats(db=db_session, current_user=user, _=None)
    # 3 su 4: sparisce solo quando venduto E costo sono entrambi compilati.
    assert stats.completed_missing_price_count == 3
