"""Test del modello MaterialAlias: relazione inversa, cascade, normalizzazione.

Copre il legame alias → materiale canonico (quello richiamato a preventivo e
ordine) e la fonte-unica di normalizzazione condivisa col flusso ordini-da-file.
"""
from app.core.csv_import import normalize_alias
from app.models import Material, MaterialAlias


def test_normalize_alias_trim_lower():
    assert normalize_alias("  C45 EN10083 ") == "c45 en10083"
    assert normalize_alias(None) == ""
    assert normalize_alias("") == ""


def test_material_aliases_relationship_and_cascade(db_session):
    m = Material(name="Acciaio C45", family="acciaio")
    db_session.add(m)
    db_session.flush()
    db_session.add_all([
        MaterialAlias(csv_name=normalize_alias("C45 EN10083"), material_id=m.id),
        MaterialAlias(csv_name=normalize_alias("1.0503"), material_id=m.id),
    ])
    db_session.commit()

    # Relazione inversa Material.aliases (back_populates) popolata.
    db_session.refresh(m)
    assert sorted(a.csv_name for a in m.aliases) == ["1.0503", "c45 en10083"]
    # Ogni alias punta al materiale canonico.
    assert all(a.material.id == m.id for a in m.aliases)

    # Cascade all/delete-orphan: eliminando il materiale spariscono gli alias.
    db_session.delete(m)
    db_session.commit()
    assert db_session.query(MaterialAlias).count() == 0
