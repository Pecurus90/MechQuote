"""Endpoint dettaglio item ordini (dropdown storico): materiali con peso/costo
calcolati, normalizzati con costo = prezzo × qty.
"""
from types import SimpleNamespace

from app.api.orders import get_order_items
from app.api.normalized_from_file import get_normalized_order_items
from app.models import (
    Material, MaterialOrder, MaterialOrderItem, MaterialSupplier,
    NormalizedItem, NormalizedOrder, NormalizedOrderItem, NormalizedSupplier,
)


def test_material_order_items_con_peso_e_costo(db_session):
    sup = MaterialSupplier(name='Ferramenta', shipping_cost=10.0)
    db_session.add(sup); db_session.flush()
    mat = Material(name='C45', family='acciaio', density_kg_dm3=7.85,
                   cost_per_kg=2.0, default_scrap_percent=10, supplier_id=sup.id)
    db_session.add(mat); db_session.flush()
    order = MaterialOrder(material_supplier_id=sup.id, supplier_name='Ferramenta',
                          source='request')
    db_session.add(order); db_session.flush()
    db_session.add(MaterialOrderItem(
        material_order_id=order.id, material_id=mat.id, material_name='C45',
        part_code='240-26A_010', shape='prismatico',
        width_mm=100, height_mm=50, thickness_mm=20, quantity=10,
    ))
    db_session.commit()

    res = get_order_items(order.id, db_session, None)
    it = res['items'][0]
    assert it['reference'] == '240-26A_010'      # riferimento richiesto
    assert it['material_name'] == 'C45'
    assert abs(it['weight_kg'] - 7.85) < 0.05     # 0.1 dm³ × 7.85 × 10
    assert it['material_cost'] > 0                # 7.85 × 2.0 × 1.1 ≈ 17.27


def test_material_order_items_senza_materiale_no_peso(db_session):
    """Riga senza materiale a catalogo → peso/costo None (non 0 fittizio)."""
    order = MaterialOrder(supplier_name='X', source='request')
    db_session.add(order); db_session.flush()
    db_session.add(MaterialOrderItem(
        material_order_id=order.id, material_id=None, material_name='Ignoto',
        shape='prismatico', width_mm=10, height_mm=10, thickness_mm=10, quantity=1,
    ))
    db_session.commit()
    it = get_order_items(order.id, db_session, None)['items'][0]
    assert it['weight_kg'] is None and it['material_cost'] is None


def test_normalized_order_items_costo_da_prezzo(db_session):
    sup = NormalizedSupplier(name='Bossard')
    db_session.add(sup); db_session.flush()
    norm = NormalizedItem(code='M8x20', description='Vite TCEI', unit_price=0.15,
                          supplier_id=sup.id)
    db_session.add(norm); db_session.flush()
    order = NormalizedOrder(normalized_supplier_id=sup.id, supplier_name='Bossard')
    db_session.add(order); db_session.flush()
    db_session.add(NormalizedOrderItem(
        normalized_order_id=order.id, normalized_item_id=norm.id,
        article='M8x20', description='Vite TCEI', reference='C-1', quantity=100,
    ))
    db_session.commit()
    it = get_normalized_order_items(order.id, db_session, None)['items'][0]
    assert it['reference'] == 'C-1'
    assert it['unit_price'] == 0.15
    assert it['cost'] == 15.0                     # 0.15 × 100
