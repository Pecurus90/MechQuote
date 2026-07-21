"""TD-11 — la dashboard "materiale da ordinare" include anche le richieste
materiale manuali (RM) inviate con righe ancora aperte.

Verifica la logica di inclusione (stessa dell'endpoint get_awaiting_materials):
RM 'inviato' con almeno una riga non evasa → inclusa; RM tutta evasa o in
bozza → esclusa. DB in-memory isolato.
"""
from app.models import MaterialRequest, MaterialRequestItem, MaterialOrder, MaterialSupplier


def _qualifying(db):
    reqs = db.query(MaterialRequest).filter(MaterialRequest.status == 'inviato').all()
    return [r for r in reqs if any(it.material_order_id is None for it in r.items)]


def test_manual_requests_inclusion(db_session):
    sup = MaterialSupplier(name="Forn")
    db_session.add(sup); db_session.flush()
    order = MaterialOrder(material_supplier_id=sup.id, supplier_name="Forn", source="request")
    db_session.add(order); db_session.flush()

    # RM inviata con una riga aperta + una evasa → INCLUSA (ha righe da ordinare).
    r1 = MaterialRequest(status='inviato', title='Barre acciaio')
    db_session.add(r1); db_session.flush()
    db_session.add(MaterialRequestItem(material_request_id=r1.id, material_name="C45", quantity=1))  # aperta
    db_session.add(MaterialRequestItem(material_request_id=r1.id, material_name="Alu", quantity=1,
                                       material_order_id=order.id))  # evasa

    # RM inviata ma tutte le righe evase → ESCLUSA.
    r2 = MaterialRequest(status='inviato', title='Tutto ordinato')
    db_session.add(r2); db_session.flush()
    db_session.add(MaterialRequestItem(material_request_id=r2.id, material_name="Inox", quantity=1,
                                       material_order_id=order.id))

    # RM in bozza → ESCLUSA (non ancora inviata).
    r3 = MaterialRequest(status='bozza', title='Bozza')
    db_session.add(r3); db_session.flush()
    db_session.add(MaterialRequestItem(material_request_id=r3.id, material_name="C40", quantity=1))
    db_session.commit()

    qualifying = _qualifying(db_session)
    ids = {r.id for r in qualifying}
    assert ids == {r1.id}
