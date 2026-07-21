"""TD-14 — ricerca su descrizione (match parziale) in preventivi e ordini.

Verifica il meccanismo di filtro usato dagli endpoint: EXISTS su Part per i
preventivi, join su MaterialOrderItem per gli ordini. DB in-memory isolato.
"""
from sqlalchemy import or_

from app.models import (
    Quote, Part, MaterialOrder, MaterialOrderItem, MaterialSupplier,
)


def _quotes_matching(db, term):
    like = f"%{term.strip()}%"
    return db.query(Quote).filter(or_(
        Quote.quote_number.ilike(like),
        Quote.customer_name.ilike(like),
        Quote.parts.any(or_(Part.description.ilike(like), Part.part_code.ilike(like))),
    )).all()


def test_quote_search_by_part_description(db_session):
    q = Quote(quote_number="240-26A_001", quote_type="single", status="bozza", customer_name="Rossi")
    db_session.add(q); db_session.flush()
    db_session.add(Part(quote_id=q.id, part_code="FLANGIA-01", description="Flangia speciale inox", quantity=1))
    db_session.commit()

    assert len(_quotes_matching(db_session, "speciale")) == 1     # descrizione parziale
    assert len(_quotes_matching(db_session, "flangia-01")) == 1   # codice parte
    assert len(_quotes_matching(db_session, "Rossi")) == 1        # cliente (invariato)
    assert len(_quotes_matching(db_session, "240-26A")) == 1      # numero (invariato)
    assert len(_quotes_matching(db_session, "inesistente")) == 0


def _orders_matching(db, term):
    like = f"%{term.strip()}%"
    return (
        db.query(MaterialOrder)
        .outerjoin(MaterialOrderItem, MaterialOrderItem.material_order_id == MaterialOrder.id)
        .filter(or_(
            MaterialOrder.supplier_name.ilike(like),
            MaterialOrderItem.material_name.ilike(like),
            MaterialOrderItem.description.ilike(like),
            MaterialOrderItem.part_code.ilike(like),
        ))
        .distinct().all()
    )


def test_order_search_by_item_fields(db_session):
    sup = MaterialSupplier(name="Acciai Veneti")
    db_session.add(sup); db_session.flush()
    o = MaterialOrder(material_supplier_id=sup.id, supplier_name="Acciai Veneti", source="quotes")
    db_session.add(o); db_session.flush()
    db_session.add(MaterialOrderItem(
        material_order_id=o.id, material_name="C45 bonificato",
        description="Barra tonda", part_code="ART-999", shape="tondo", quantity=1,
    ))
    db_session.commit()

    assert len(_orders_matching(db_session, "c45")) == 1        # materiale
    assert len(_orders_matching(db_session, "tonda")) == 1      # descrizione
    assert len(_orders_matching(db_session, "art-999")) == 1    # codice
    assert len(_orders_matching(db_session, "veneti")) == 1     # fornitore
    assert len(_orders_matching(db_session, "nulla")) == 0
