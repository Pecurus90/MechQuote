"""Test della macchina a stati preventivo (spec 18, Blocco 4)."""
from types import SimpleNamespace

from app.services import quote_workflow as wf


def test_is_editable():
    assert wf.is_editable('bozza') is True
    assert wf.is_editable('inviato') is True
    assert wf.is_editable('letto') is True
    assert wf.is_editable('confermato') is False
    assert wf.is_editable('completo') is False


def test_status_sets():
    assert wf.EDITABLE_STATUSES == {'bozza', 'inviato', 'letto'}
    assert wf.ORDERABLE_STATUSES == {'confermato', 'completo'}
    assert set(wf.QUOTE_STATUSES) == {'bozza', 'inviato', 'letto', 'confermato', 'completo'}


def test_material_is_resolved_die_short_circuits():
    # Stampo: materiale sempre risolto, non tocca il DB (db=None è sicuro).
    die = SimpleNamespace(quote_type='die')
    assert wf.material_is_resolved(None, die) is True


def test_maybe_complete_die_confirmed_goes_complete():
    die = SimpleNamespace(
        status='confermato', quote_type='die',
        completed_at=None, completed_by_user_id=None,
    )
    assert wf.maybe_complete(None, die, actor_id=7) is True
    assert die.status == 'completo'
    assert die.completed_by_user_id == 7
    assert die.completed_at is not None


def test_maybe_complete_noop_when_not_confirmed():
    die = SimpleNamespace(
        status='letto', quote_type='die',
        completed_at=None, completed_by_user_id=None,
    )
    assert wf.maybe_complete(None, die, actor_id=7) is False
    assert die.status == 'letto'
