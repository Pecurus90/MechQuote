"""Suite del clone "ricetta su altro articolo" (POST /parts/{id}/clone-onto).

Copre: copia ricetta + fasi, identità del target preservata, ricalcolo sulla
quantità del target, sostituzione fasi esistenti, multi-target, drop dei
profili DXF, e i blocchi (sorgente=target, cross-preventivo, bloccato, vuoto).

Chiama la funzione dell'endpoint direttamente (niente HTTP) su SQLite in-memory.
"""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.parts import clone_part_onto, duplicate_part
from app.models import Quote, Part, ManufacturingPhase, Machine, Material
from app.schemas import PartCloneRequest

EUR = 0.01


def _user(perms=('quotes.view_all', 'quotes.create')):
    return SimpleNamespace(id=1, full_name='Tester', username='tester', _permissions=list(perms))


def _setup(db, status='bozza', n_targets=2, target_qty=5):
    m = Machine(name='Mazak', machine_type='cnc_5_axis', hourly_rate=100.0, setup_hourly_rate=40.0)
    db.add(m); db.flush()
    mat = Material(name='Acciaio', family='acciaio', density_kg_dm3=7.85, cost_per_kg=3.0, default_scrap_percent=10)
    db.add(mat); db.flush()
    q = Quote(quote_number='C-1', quote_type='commessa', status=status, created_by_user_id=1)
    db.add(q); db.flush()
    src = Part(quote_id=q.id, part_code='C-1_01', description='Staffa A', quantity=10,
               material_id=mat.id, raw_x_mm=50, raw_y_mm=50, raw_z_mm=100, minimum_price=0.0)
    db.add(src); db.flush()
    # fase macchina + fase conto lavoro (costo fisso)
    db.add(ManufacturingPhase(part_id=src.id, sequence_number=10, phase_type='', machine_id=m.id,
                              setup_hours=0.5, cycle_hours_per_part=1.0, fixed_cost=0.0, variable_cost_per_part=0.0))
    db.add(ManufacturingPhase(part_id=src.id, sequence_number=20, phase_type='', description='Conto lavoro',
                              fixed_cost=460.0, variable_cost_per_part=0.0))
    targets = []
    for i in range(2, 2 + n_targets):
        t = Part(quote_id=q.id, part_code=f'C-1_{i:02d}', description=f'Staffa {i}', quantity=target_qty, minimum_price=0.0)
        db.add(t); db.flush()
        targets.append(t)
    db.commit()
    return q, src, targets, m, mat


def _phases(db, part_id):
    return db.query(ManufacturingPhase).filter_by(part_id=part_id).order_by(ManufacturingPhase.sequence_number).all()


def test_clone_copia_ricetta_fasi_e_preserva_identita(db_session):
    q, src, targets, m, mat = _setup(db_session)
    t = targets[0]
    res = clone_part_onto(src.id, PartCloneRequest(target_ids=[t.id]), db_session, _user(), None)
    assert res == {"ok": True, "cloned": 1}
    db_session.refresh(t)
    # ricetta copiata
    assert t.material_id == mat.id
    assert (t.raw_x_mm, t.raw_y_mm, t.raw_z_mm) == (50, 50, 100)
    # identità del target preservata (codice, quantità, descrizione)
    assert t.part_code == 'C-1_02'
    assert t.quantity == 5
    assert t.description == 'Staffa 2'
    # fasi copiate
    ph = _phases(db_session, t.id)
    assert len(ph) == 2
    assert ph[0].machine_id == m.id and ph[0].setup_hours == 0.5 and ph[0].cycle_hours_per_part == 1.0
    assert ph[1].fixed_cost == 460.0


def test_clone_ricalcola_sulla_quantita_del_target(db_session):
    # Sorgente qty 10, target qty 5: gli ammortizzati (setup/qty, fisso/qty)
    # devono usare la qty del TARGET.
    q, src, targets, m, mat = _setup(db_session, target_qty=5)
    t = targets[0]
    clone_part_onto(src.id, PartCloneRequest(target_ids=[t.id]), db_session, _user(), None)
    ph = _phases(db_session, t.id)
    # macchina: setup 0.5h×40€ / 5 + 1h×100€ = 4 + 100 = 104
    assert abs(ph[0].calculated_cost - 104.0) < EUR
    # conto lavoro: 460 / 5 = 92
    assert abs(ph[1].calculated_cost - 92.0) < EUR
    # sulla sorgente (qty 10) resta 102 e 46
    ph_src = _phases(db_session, src.id)
    assert abs(ph_src[0].calculated_cost - 102.0) < EUR
    assert abs(ph_src[1].calculated_cost - 46.0) < EUR


def test_clone_sostituisce_le_fasi_esistenti_del_target(db_session):
    q, src, targets, m, mat = _setup(db_session)
    t = targets[0]
    # il target ha già una fase sua (diversa)
    db_session.add(ManufacturingPhase(part_id=t.id, sequence_number=99, phase_type='', fixed_cost=5.0))
    db_session.commit()
    assert len(_phases(db_session, t.id)) == 1
    clone_part_onto(src.id, PartCloneRequest(target_ids=[t.id]), db_session, _user(), None)
    ph = _phases(db_session, t.id)
    assert len(ph) == 2                       # la fase vecchia è sparita
    assert all(p.fixed_cost != 5.0 or p.sequence_number != 99 for p in ph)


def test_clone_multi_target(db_session):
    q, src, targets, m, mat = _setup(db_session, n_targets=2)
    ids = [t.id for t in targets]
    res = clone_part_onto(src.id, PartCloneRequest(target_ids=ids), db_session, _user(), None)
    assert res["cloned"] == 2
    for t in targets:
        assert len(_phases(db_session, t.id)) == 2


def test_clone_droppa_i_profili_dxf(db_session):
    q, src, targets, m, mat = _setup(db_session)
    # una fase sorgente con profili DXF
    src_ph = _phases(db_session, src.id)[0]
    src_ph.dxf_profile_ids = [1, 2, 3]
    src_ph.cut_length_mm = 320.0
    db_session.commit()
    t = targets[0]
    clone_part_onto(src.id, PartCloneRequest(target_ids=[t.id]), db_session, _user(), None)
    ph = _phases(db_session, t.id)[0]
    assert ph.dxf_profile_ids is None          # i profili non si trasferiscono
    assert ph.cut_length_mm == 320.0           # ma il valore numerico (costo) sì


def test_clone_sorgente_uguale_target_400(db_session):
    q, src, targets, m, mat = _setup(db_session)
    with pytest.raises(HTTPException) as ei:
        clone_part_onto(src.id, PartCloneRequest(target_ids=[src.id]), db_session, _user(), None)
    assert ei.value.status_code == 400


def test_clone_target_vuoti_400(db_session):
    q, src, targets, m, mat = _setup(db_session)
    with pytest.raises(HTTPException) as ei:
        clone_part_onto(src.id, PartCloneRequest(target_ids=[]), db_session, _user(), None)
    assert ei.value.status_code == 400


def test_clone_cross_preventivo_400(db_session):
    q, src, targets, m, mat = _setup(db_session)
    # una parte in un ALTRO preventivo
    q2 = Quote(quote_number='C-2', quote_type='commessa', status='bozza', created_by_user_id=1)
    db_session.add(q2); db_session.flush()
    other = Part(quote_id=q2.id, part_code='C-2_01', quantity=1, minimum_price=0.0)
    db_session.add(other); db_session.commit()
    with pytest.raises(HTTPException) as ei:
        clone_part_onto(src.id, PartCloneRequest(target_ids=[other.id]), db_session, _user(), None)
    assert ei.value.status_code == 400


def test_clone_target_inesistente_404(db_session):
    q, src, targets, m, mat = _setup(db_session)
    with pytest.raises(HTTPException) as ei:
        clone_part_onto(src.id, PartCloneRequest(target_ids=[999999]), db_session, _user(), None)
    assert ei.value.status_code == 404


def test_clone_preventivo_bloccato_403(db_session):
    # quote confermato + utente senza edit_locked → 403
    q, src, targets, m, mat = _setup(db_session, status='confermato')
    with pytest.raises(HTTPException) as ei:
        clone_part_onto(src.id, PartCloneRequest(target_ids=[targets[0].id]), db_session,
                        _user(perms=('quotes.view_all', 'quotes.create')), None)
    assert ei.value.status_code == 403


def test_duplicate_copia_flag_provenienza_materiale(db_session):
    # Audit A1: duplicate deve copiare customer_supplied_material e
    # material_from_stock. Senza, la copia tornava "fornitore normale" e il
    # cost engine riaddebitava materiale/spedizione/taglio (prezzo salvato più alto).
    q, src, targets, m, mat = _setup(db_session)
    # Conto lavoro (cliente porta il materiale)
    src.customer_supplied_material = True
    db_session.commit()
    dup1 = duplicate_part(src.id, db_session, _user(), None)
    assert dup1.customer_supplied_material is True
    assert dup1.material_from_stock is False
    # Materiale a magazzino (mutex con conto lavoro)
    src.customer_supplied_material = False
    src.material_from_stock = True
    db_session.commit()
    dup2 = duplicate_part(src.id, db_session, _user(), None)
    assert dup2.material_from_stock is True
    assert dup2.customer_supplied_material is False
