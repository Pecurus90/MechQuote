"""Test della derivazione stato materiale preventivo (spec 18, Blocco 1)."""
from types import SimpleNamespace

from app.services.material_status import (
    MAT_NON_NECESSARIO, MAT_NON_ORDINATO, MAT_PARZIALE, MAT_TOTALMENTE_EVASO,
    PART_CONTO_LAVORO, PART_DA_MAGAZZINO, PART_DA_ORDINARE, PART_NESSUN_MATERIALE,
    PART_ORDINATO, PART_SENZA_FORNITORE,
    part_material_state, part_needs_ordering, quote_material_status,
    required_supplier_ids, unassigned_supplier_parts,
)


def _part(material_id=None, supplier_id=None, conto=False, stock=False):
    """Costruisce una Part fittizia con solo gli attributi usati dalla logica."""
    material = SimpleNamespace(supplier_id=supplier_id) if material_id else None
    return SimpleNamespace(
        material_id=material_id,
        customer_supplied_material=conto,
        material_from_stock=stock,
        material=material,
    )


# ─── part_needs_ordering ────────────────────────────────────────────────────

def test_needs_ordering_normal():
    assert part_needs_ordering(_part(material_id=1, supplier_id=5)) is True


def test_needs_ordering_senza_fornitore_still_needs():
    # materiale reale ma senza fornitore: va comunque ordinato (blocca conferma)
    assert part_needs_ordering(_part(material_id=1, supplier_id=None)) is True


def test_needs_ordering_excludes_conto_lavoro_and_stock_and_no_material():
    assert part_needs_ordering(_part(material_id=1, supplier_id=5, conto=True)) is False
    assert part_needs_ordering(_part(material_id=1, supplier_id=5, stock=True)) is False
    assert part_needs_ordering(_part(material_id=None)) is False


# ─── quote_material_status (aggregato) ──────────────────────────────────────

def test_status_non_necessario_when_no_parts():
    assert quote_material_status([], set()) == MAT_NON_NECESSARIO


def test_status_non_necessario_all_stock_or_conto():
    parts = [_part(material_id=1, supplier_id=5, stock=True),
             _part(material_id=2, supplier_id=6, conto=True),
             _part(material_id=None)]
    assert quote_material_status(parts, set()) == MAT_NON_NECESSARIO


def test_status_non_ordinato():
    parts = [_part(material_id=1, supplier_id=5), _part(material_id=2, supplier_id=6)]
    assert quote_material_status(parts, set()) == MAT_NON_ORDINATO


def test_status_parziale_one_of_two_suppliers():
    parts = [_part(material_id=1, supplier_id=5), _part(material_id=2, supplier_id=6)]
    assert quote_material_status(parts, {5}) == MAT_PARZIALE


def test_status_totalmente_evaso_same_supplier_two_parts():
    parts = [_part(material_id=1, supplier_id=5), _part(material_id=2, supplier_id=5)]
    assert quote_material_status(parts, {5}) == MAT_TOTALMENTE_EVASO


def test_status_totalmente_evaso_mixed_with_stock_ignored():
    # la parte da magazzino non conta: bastano i fornitori "da ordinare"
    parts = [_part(material_id=1, supplier_id=5),
             _part(material_id=2, supplier_id=6, stock=True)]
    assert quote_material_status(parts, {5}) == MAT_TOTALMENTE_EVASO


def test_status_senza_fornitore_never_fully_evaso():
    # una parte senza fornitore non è mai coperta → resta parziale
    parts = [_part(material_id=1, supplier_id=5), _part(material_id=2, supplier_id=None)]
    assert quote_material_status(parts, {5}) == MAT_PARZIALE


# ─── unassigned_supplier_parts / required_supplier_ids ──────────────────────

def test_unassigned_supplier_parts_flags_only_orderable_without_supplier():
    p_ok = _part(material_id=1, supplier_id=5)
    p_bad = _part(material_id=2, supplier_id=None)
    p_stock = _part(material_id=3, supplier_id=None, stock=True)
    result = unassigned_supplier_parts([p_ok, p_bad, p_stock])
    assert result == [p_bad]


def test_required_supplier_ids():
    parts = [_part(material_id=1, supplier_id=5), _part(material_id=2, supplier_id=6),
             _part(material_id=3, supplier_id=5), _part(material_id=4, supplier_id=7, conto=True)]
    assert required_supplier_ids(parts) == {5, 6}


# ─── part_material_state (vista articoli) ───────────────────────────────────

def test_part_state_variants():
    assert part_material_state(_part(material_id=1, supplier_id=5, conto=True), set()) == PART_CONTO_LAVORO
    assert part_material_state(_part(material_id=1, supplier_id=5, stock=True), set()) == PART_DA_MAGAZZINO
    assert part_material_state(_part(material_id=None), set()) == PART_NESSUN_MATERIALE
    assert part_material_state(_part(material_id=1, supplier_id=None), set()) == PART_SENZA_FORNITORE
    assert part_material_state(_part(material_id=1, supplier_id=5), set()) == PART_DA_ORDINARE
    assert part_material_state(_part(material_id=1, supplier_id=5), {5}) == PART_ORDINATO
