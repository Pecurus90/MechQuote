"""Test del modello NormalizedAlias: relazione inversa, cascade, normalizzazione.

Gemello di test_material_alias: l'alias lega il nome grezzo della distinta alla
voce di catalogo NormalizedItem (il "tipo") richiamata negli ordini normalizzati.
"""
from app.core.csv_import import normalize_alias
from app.models import NormalizedItem, NormalizedAlias


def test_normalized_aliases_relationship_and_cascade(db_session):
    item = NormalizedItem(code="VITI-TCEI", description="Viti TCEI")
    db_session.add(item)
    db_session.flush()
    db_session.add_all([
        NormalizedAlias(csv_name=normalize_alias("Viti M8x100 TCEI"), normalized_item_id=item.id),
        NormalizedAlias(csv_name=normalize_alias("VITE TCEI M6x40"), normalized_item_id=item.id),
    ])
    db_session.commit()

    # Relazione inversa NormalizedItem.aliases (back_populates) popolata.
    db_session.refresh(item)
    assert sorted(a.csv_name for a in item.aliases) == ["vite tcei m6x40", "viti m8x100 tcei"]
    assert all(a.normalized_item.id == item.id for a in item.aliases)

    # Cascade all/delete-orphan: eliminando la voce spariscono gli alias.
    db_session.delete(item)
    db_session.commit()
    assert db_session.query(NormalizedAlias).count() == 0
