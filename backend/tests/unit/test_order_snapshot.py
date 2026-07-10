"""B6 — snapshot congelato degli ordini materiali da preventivo.

Verifica che le righe salvate all'emissione (MaterialOrderItem) coincidano con
l'aggregazione live e restino invariate se il preventivo cambia dopo l'ordine.
"""
from app.models import Quote, Part, Material, MaterialSupplier, MaterialOrder
from app.api.orders import (
    _persist_order_snapshot, _supplier_order_data,
    _shape_label_it, _file_item_dim,
)


def _snap_rows(order):
    return sorted(
        [it.material_name, _shape_label_it(it.shape), _file_item_dim(it), it.part_code, it.quantity]
        for it in order.items
    )


def test_order_snapshot_matches_live_then_freezes(db_session):
    sup = MaterialSupplier(name="Forn A")
    db_session.add(sup); db_session.flush()
    mat = Material(name="Acciaio 1730", family="acciaio", supplier_id=sup.id, density_kg_dm3=7.85)
    db_session.add(mat); db_session.flush()
    q = Quote(quote_number="MO-26X_001", quote_type="single", status="confermato")
    db_session.add(q); db_session.flush()
    # Una parte prismatica + una tonda (coprono entrambe le forme).
    db_session.add(Part(quote_id=q.id, part_code="P1", quantity=3, material_id=mat.id,
                        raw_x_mm=80, raw_y_mm=120, raw_z_mm=30))
    db_session.add(Part(quote_id=q.id, part_code="P2", quantity=2, material_id=mat.id,
                        raw_diameter_mm=50, raw_z_mm=100))
    db_session.commit()

    _involved, live_rows = _supplier_order_data([q.id], sup.id, db_session)

    order = MaterialOrder(material_supplier_id=sup.id, supplier_name=sup.name, source="quotes")
    db_session.add(order); db_session.flush()
    _persist_order_snapshot(order, [q.id], sup.id, db_session)
    db_session.commit()

    # All'emissione lo snapshot coincide con l'aggregazione live.
    assert _snap_rows(order) == sorted(live_rows)

    # Modifica del preventivo DOPO l'ordine: lo snapshot resta congelato, il
    # live invece cambia (è esattamente il caso che B6 risolve).
    frozen = _snap_rows(order)
    part = db_session.query(Part).filter(Part.part_code == "P1").first()
    part.raw_x_mm = 999
    db_session.commit()

    _involved2, live_after = _supplier_order_data([q.id], sup.id, db_session)
    assert _snap_rows(order) == frozen          # snapshot invariato
    assert sorted(live_after) != frozen         # il live diverge
