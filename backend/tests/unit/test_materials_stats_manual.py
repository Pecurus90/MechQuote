"""Statistiche materiali: gli ordini MANUALI (da richiesta, senza preventivo)
devono contribuire a kg e costo, non solo alla spedizione.

Regressione: prima l'aggregazione kg/costo passava da QuoteSupplierOrder→Parts,
che gli ordini manuali non hanno → spedizione sì, kg/€ = 0. Ora si basa sugli
snapshot MaterialOrderItem di TUTTI gli ordini.
"""
from types import SimpleNamespace

from app.api.dashboard import get_materials_stats
from app.models import Material, MaterialOrder, MaterialOrderItem, MaterialSupplier


def test_materials_stats_include_ordini_manuali(db_session):
    sup = MaterialSupplier(name='Ferramenta X', shipping_cost=25.0)
    db_session.add(sup); db_session.flush()
    mat = Material(name='C45', family='acciaio', density_kg_dm3=7.85,
                   cost_per_kg=2.0, default_scrap_percent=10, supplier_id=sup.id)
    db_session.add(mat); db_session.flush()
    # Ordine MANUALE (da richiesta): nessun preventivo/parte collegati.
    order = MaterialOrder(material_supplier_id=sup.id, supplier_name=sup.name,
                          source='request')
    db_session.add(order); db_session.flush()
    # Riga snapshot: prismatico 100×50×20 mm × 10 pz → 0.785 kg/pz × 10 = 7.85 kg.
    db_session.add(MaterialOrderItem(
        material_order_id=order.id, material_id=mat.id, material_name='C45',
        shape='prismatico', width_mm=100, height_mm=50, thickness_mm=20, quantity=10,
    ))
    db_session.commit()

    user = SimpleNamespace(id=1, username='a', full_name='A',
                           role='amministrazione', _permissions=['statistics'])
    stats = get_materials_stats(period='all', db=db_session, current_user=user)

    # Prima del fix: 0. Ora contano.
    assert abs(stats.total_weight_kg - 7.85) < 0.05         # 0.1 dm³ × 7.85 × 10
    assert stats.total_material_cost > 0                    # 7.85 × 2.0 × 1.1 ≈ 17.27
    assert stats.total_shipping == 25.0                     # spedizione già ok
    assert any(r.supplier_name == 'Ferramenta X'
               and r.weight_kg > 0 and r.material_cost > 0
               for r in stats.by_supplier)
