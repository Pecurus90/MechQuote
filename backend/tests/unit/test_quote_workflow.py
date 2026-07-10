"""Test della macchina a stati preventivo (spec 18, Blocco 4)."""
from types import SimpleNamespace

from app.services import quote_workflow as wf
from app.services import material_status as ms


def _fake_quote(**kw):
    """Preventivo fittizio con tutti i campi toccati da reconcile_material_state."""
    base = dict(
        status='confermato', quote_type='single',
        material_ordered_at=None, material_ordered_by_user_id=None,
        completed_at=None, completed_by_user_id=None,
        sold_price=None, actual_cost=None, final_total=None,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def test_is_editable():
    assert wf.is_editable('bozza') is True
    assert wf.is_editable('inviato') is True
    assert wf.is_editable('letto') is True
    assert wf.is_editable('in_attesa_cliente') is True
    assert wf.is_editable('confermato') is False
    assert wf.is_editable('completo') is False
    assert wf.is_editable('non_ordinato') is False


def test_status_sets():
    assert wf.EDITABLE_STATUSES == {'bozza', 'inviato', 'letto', 'in_attesa_cliente'}
    assert wf.ORDERABLE_STATUSES == {'confermato', 'completo'}
    assert set(wf.QUOTE_STATUSES) == {
        'bozza', 'inviato', 'letto', 'in_attesa_cliente',
        'confermato', 'completo', 'non_ordinato',
    }


def test_material_is_resolved_die_short_circuits():
    # Stampo: materiale sempre risolto, non tocca il DB (db=None è sicuro).
    die = SimpleNamespace(quote_type='die')
    assert wf.material_is_resolved(None, die) is True


def test_maybe_complete_die_confirmed_goes_complete():
    die = SimpleNamespace(
        status='confermato', quote_type='die',
        completed_at=None, completed_by_user_id=None,
        sold_price=None, final_total=1234.0,
    )
    assert wf.maybe_complete(None, die, actor_id=7) is True
    assert die.status == 'completo'
    assert die.completed_by_user_id == 7
    assert die.completed_at is not None
    # B2 — al completamento il venduto viene inizializzato col preventivato.
    assert die.sold_price == 1234.0


def test_maybe_complete_noop_when_not_confirmed():
    die = SimpleNamespace(
        status='letto', quote_type='die',
        completed_at=None, completed_by_user_id=None,
        sold_price=None, final_total=1234.0,
    )
    assert wf.maybe_complete(None, die, actor_id=7) is False
    assert die.status == 'letto'
    # Nessun passaggio a completo → il venduto non viene toccato.
    assert die.sold_price is None


def test_autofill_sold_price_preserves_manual_value():
    # B2 — se il venduto è già stato compilato a mano, il completamento non lo
    # sovrascrive col preventivato.
    die = SimpleNamespace(
        status='confermato', quote_type='die',
        completed_at=None, completed_by_user_id=None,
        sold_price=999.0, final_total=1234.0,
    )
    assert wf.maybe_complete(None, die, actor_id=7) is True
    assert die.sold_price == 999.0


# ─── reconcile_material_state (radice asse materiale) ───────────────────────

def test_reconcile_noop_when_not_orderable():
    q = _fake_quote(status='bozza')
    assert wf.reconcile_material_state(None, q, actor_id=7) is False
    assert q.status == 'bozza'
    assert q.material_ordered_at is None


def test_reconcile_die_confermato_promotes():
    # Stampo: materiale sempre risolto, non tocca il DB (db=None sicuro).
    die = _fake_quote(status='confermato', quote_type='die')
    assert wf.reconcile_material_state(None, die, actor_id=7) is True
    assert die.status == 'completo'
    assert die.completed_by_user_id == 7
    # Materiale fuori scope: il flag legacy non viene toccato.
    assert die.material_ordered_at is None


def test_reconcile_die_completo_stays():
    die = _fake_quote(status='completo', quote_type='die',
                      completed_at='x', completed_by_user_id=1)
    assert wf.reconcile_material_state(None, die, actor_id=7) is False
    assert die.status == 'completo'


def test_reconcile_promote_and_set_flag_on_totalmente_evaso(monkeypatch):
    monkeypatch.setattr(wf, 'quote_material_status', lambda db, q: ms.MAT_TOTALMENTE_EVASO)
    q = _fake_quote(status='confermato')
    assert wf.reconcile_material_state(None, q, actor_id=9) is True
    assert q.status == 'completo'
    assert q.completed_by_user_id == 9
    assert q.material_ordered_at is not None          # flag alzato
    assert q.material_ordered_by_user_id == 9


def test_reconcile_promote_non_necessario_without_flag(monkeypatch):
    # Nessun materiale da ordinare → risolto, ma niente da ordinare: flag resta giù.
    monkeypatch.setattr(wf, 'quote_material_status', lambda db, q: ms.MAT_NON_NECESSARIO)
    q = _fake_quote(status='confermato')
    assert wf.reconcile_material_state(None, q, actor_id=9) is True
    assert q.status == 'completo'
    assert q.material_ordered_at is None


def test_reconcile_demote_completo_to_confermato_preserves_closeout(monkeypatch):
    monkeypatch.setattr(wf, 'quote_material_status', lambda db, q: ms.MAT_NON_ORDINATO)
    q = _fake_quote(status='completo', completed_at='x', completed_by_user_id=3,
                    material_ordered_at='y', material_ordered_by_user_id=3,
                    sold_price=1000.0, actual_cost=800.0)
    assert wf.reconcile_material_state(None, q, actor_id=9) is True
    assert q.status == 'confermato'
    assert q.completed_at is None
    assert q.completed_by_user_id is None
    assert q.material_ordered_at is None              # flag azzerato
    # Il consuntivo è un fatto della vendita: NON viene toccato dal demote.
    assert q.sold_price == 1000.0
    assert q.actual_cost == 800.0


def test_reconcile_confermato_parziale_clears_flag_no_transition(monkeypatch):
    monkeypatch.setattr(wf, 'quote_material_status', lambda db, q: ms.MAT_PARZIALE)
    q = _fake_quote(status='confermato', material_ordered_at='y', material_ordered_by_user_id=3)
    assert wf.reconcile_material_state(None, q, actor_id=9) is False
    assert q.status == 'confermato'
    assert q.material_ordered_at is None


def test_reconcile_completo_still_evaso_stays(monkeypatch):
    monkeypatch.setattr(wf, 'quote_material_status', lambda db, q: ms.MAT_TOTALMENTE_EVASO)
    q = _fake_quote(status='completo', completed_at='x', completed_by_user_id=3,
                    material_ordered_at='y', material_ordered_by_user_id=3)
    assert wf.reconcile_material_state(None, q, actor_id=9) is False
    assert q.status == 'completo'
    assert q.material_ordered_at == 'y'               # resta evaso


def test_reconcile_db_full_cycle_promote_then_demote(db_session):
    """Ciclo reale su DB in-memory (valida il path `quote_material_status(db)`):
    confermato → (evasione fornitore) completo → (rimozione evasione, come
    delete_order) di nuovo confermato. È lo scenario #4 dell'audit."""
    from app.models import Quote, Part, Material, MaterialSupplier, QuoteSupplierOrder

    sup = MaterialSupplier(name="Fornitore A")
    db_session.add(sup)
    db_session.flush()
    mat = Material(name="Acciaio", family="acciaio", supplier_id=sup.id)
    db_session.add(mat)
    db_session.flush()
    q = Quote(quote_number="REC-26X_001", quote_type="single", status="confermato")
    db_session.add(q)
    db_session.flush()
    db_session.add(Part(quote_id=q.id, part_code="P1", quantity=1, material_id=mat.id))
    db_session.commit()

    # Nessuna evasione → materiale non ordinato → resta confermato, flag giù.
    assert wf.reconcile_material_state(db_session, q, actor_id=1) is False
    assert q.status == "confermato"
    assert q.material_ordered_at is None

    # Evasione del fornitore → totalmente evaso → promote a completo, flag su.
    db_session.add(QuoteSupplierOrder(quote_id=q.id, material_supplier_id=sup.id))
    db_session.commit()
    assert wf.reconcile_material_state(db_session, q, actor_id=1) is True
    assert q.status == "completo"
    assert q.material_ordered_at is not None

    # Rimozione evasione (come delete_order) → non più risolto → demote.
    db_session.query(QuoteSupplierOrder).filter(
        QuoteSupplierOrder.quote_id == q.id
    ).delete()
    db_session.commit()
    assert wf.reconcile_material_state(db_session, q, actor_id=1) is True
    assert q.status == "confermato"
    assert q.material_ordered_at is None
