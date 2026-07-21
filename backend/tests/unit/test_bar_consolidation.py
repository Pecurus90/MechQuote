"""TD-3 — consolidamento degli spezzoni tondi in barre (_apply_bars).

Verifica sullo snapshot dell'ordine: barra singola, split multi-barra,
esclusione di lunghezze (override), aggregazione dei riferimenti su più
preventivi, isolamento per diametro e materiale, no-op senza pieces.
DB SQLite in-memory (fixture db_session): nessun tocco al DB di sviluppo.
"""
from app.models import Quote, Part, Material, MaterialSupplier, MaterialOrder
from app.api.orders import _persist_order_snapshot, _apply_bars
from app.schemas import BarSpec, BarPiece


def _round_items(order):
    return [it for it in order.items if it.shape == 'tondo']


def _setup(db, parts):
    """Crea fornitore + materiale + 1 preventivo per numero, con le parti date.
    `parts` = lista di (quote_number, kwargs Part). Ritorna (order, sup)."""
    sup = MaterialSupplier(name="Forn A")
    db.add(sup); db.flush()
    mat = Material(name="C45", family="acciaio", supplier_id=sup.id, density_kg_dm3=7.85)
    db.add(mat); db.flush()
    quotes = {}
    for qn, kw in parts:
        q = quotes.get(qn)
        if q is None:
            q = Quote(quote_number=qn, quote_type="single", status="confermato")
            db.add(q); db.flush()
            quotes[qn] = q
        db.add(Part(quote_id=q.id, material_id=mat.id, **kw))
    db.flush()
    order = MaterialOrder(material_supplier_id=sup.id, supplier_name=sup.name, source="quotes")
    db.add(order); db.flush()
    _persist_order_snapshot(order, [q.id for q in quotes.values()], sup.id, db)
    db.flush()
    return order, mat


def test_single_bar_replaces_pieces(db_session):
    # AAA: Ø20×100 ×4, Ø20×250 ×3, + un prismatico di controllo.
    order, mat = _setup(db_session, [
        ("AAA", dict(part_code="P1", quantity=4, raw_diameter_mm=20, raw_z_mm=100)),
        ("AAA", dict(part_code="P2", quantity=3, raw_diameter_mm=20, raw_z_mm=250)),
        ("AAA", dict(part_code="P3", quantity=1, raw_x_mm=80, raw_y_mm=120, raw_z_mm=30)),
    ])
    need = 100 * 4 + 250 * 3  # 1150
    _apply_bars(order, [BarSpec(
        material_id=mat.id, material_name="C45", diameter_mm=20,
        lengths=[100, 250], pieces=[BarPiece(length_mm=need, quantity=1)],
    )], db_session)
    db_session.commit()

    rounds = _round_items(order)
    assert len(rounds) == 1
    bar = rounds[0]
    assert bar.length_mm == need and bar.quantity == 1
    assert bar.diameter_mm == 20 and bar.description == "Barra"
    assert "AAA" in bar.part_code
    # Il prismatico resta intatto.
    assert any(it.shape == 'prismatico' for it in order.items)


def test_multi_bar_split(db_session):
    order, mat = _setup(db_session, [
        ("AAA", dict(part_code="P1", quantity=20, raw_diameter_mm=20, raw_z_mm=200)),  # 4000 mm
    ])
    _apply_bars(order, [BarSpec(
        material_id=mat.id, material_name="C45", diameter_mm=20, lengths=[200],
        pieces=[BarPiece(length_mm=3000, quantity=1), BarPiece(length_mm=1000, quantity=1)],
    )], db_session)
    db_session.commit()

    rounds = sorted(_round_items(order), key=lambda it: it.length_mm)
    assert [(it.length_mm, it.quantity) for it in rounds] == [(1000, 1), (3000, 1)]


def test_exclusion_keeps_piece_single(db_session):
    # Escludo la lunghezza 100 (resta spezzone), consolido solo la 250.
    order, mat = _setup(db_session, [
        ("AAA", dict(part_code="P1", quantity=4, raw_diameter_mm=20, raw_z_mm=100)),
        ("AAA", dict(part_code="P2", quantity=3, raw_diameter_mm=20, raw_z_mm=250)),
    ])
    _apply_bars(order, [BarSpec(
        material_id=mat.id, material_name="C45", diameter_mm=20, lengths=[250],
        pieces=[BarPiece(length_mm=750, quantity=1)],
    )], db_session)
    db_session.commit()

    rounds = _round_items(order)
    # Lo spezzone Ø20×100 ×4 resta; Ø20×250 diventa barra 750.
    kept = [it for it in rounds if it.length_mm == 100]
    bars = [it for it in rounds if it.length_mm == 750]
    assert len(kept) == 1 and kept[0].quantity == 4 and kept[0].description != "Barra"
    assert len(bars) == 1 and bars[0].description == "Barra"


def test_refs_aggregated_across_quotes(db_session):
    order, mat = _setup(db_session, [
        ("AAA", dict(part_code="P1", quantity=2, raw_diameter_mm=20, raw_z_mm=100)),
        ("BBB", dict(part_code="P2", quantity=2, raw_diameter_mm=20, raw_z_mm=100)),
    ])
    _apply_bars(order, [BarSpec(
        material_id=mat.id, material_name="C45", diameter_mm=20, lengths=[100],
        pieces=[BarPiece(length_mm=2000, quantity=1)],
    )], db_session)
    db_session.commit()

    rounds = _round_items(order)
    assert len(rounds) == 1
    assert set(rounds[0].part_code.split(" + ")) == {"AAA", "BBB"}


def test_other_diameter_untouched(db_session):
    order, mat = _setup(db_session, [
        ("AAA", dict(part_code="P1", quantity=3, raw_diameter_mm=20, raw_z_mm=100)),
        ("AAA", dict(part_code="P2", quantity=2, raw_diameter_mm=30, raw_z_mm=100)),
    ])
    _apply_bars(order, [BarSpec(
        material_id=mat.id, material_name="C45", diameter_mm=20, lengths=[100],
        pieces=[BarPiece(length_mm=500, quantity=1)],
    )], db_session)
    db_session.commit()

    rounds = _round_items(order)
    # Ø30 resta spezzone; Ø20 diventa barra.
    assert any(it.diameter_mm == 30 and it.description != "Barra" for it in rounds)
    assert any(it.diameter_mm == 20 and it.description == "Barra" for it in rounds)


def test_no_pieces_is_noop(db_session):
    order, mat = _setup(db_session, [
        ("AAA", dict(part_code="P1", quantity=3, raw_diameter_mm=20, raw_z_mm=100)),
    ])
    before = len(_round_items(order))
    _apply_bars(order, [BarSpec(
        material_id=mat.id, material_name="C45", diameter_mm=20, lengths=[100], pieces=[],
    )], db_session)
    db_session.commit()
    assert len(_round_items(order)) == before  # nessuna barra, spezzone intatto
