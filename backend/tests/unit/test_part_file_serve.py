"""Serve autenticato degli allegati di parte (GET /files/{id}).

Verifica ACL + guardie senza HTTP: chiama la funzione dell'endpoint su SQLite
in-memory.
"""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.responses import FileResponse

from app.api.parts import get_part_file
from app.models import Quote, Part, PartFile


def _user(perms=('quotes.view_all',)):
    return SimpleNamespace(id=1, _permissions=list(perms))


def _make(db, created_by=1, path='uploads/nonexistent.pdf'):
    q = Quote(quote_number='F-1', quote_type='single', status='bozza', created_by_user_id=created_by)
    db.add(q); db.flush()
    p = Part(quote_id=q.id, part_code='F-1', quantity=1, minimum_price=0.0)
    db.add(p); db.flush()
    pf = PartFile(part_id=p.id, file_type='pdf', filename='disegno.pdf', path=path)
    db.add(pf); db.commit()
    return q, p, pf


def test_serve_ok_ritorna_fileresponse(db_session, tmp_path):
    f = tmp_path / 'disegno.pdf'
    f.write_bytes(b'%PDF-1.4 test')
    _q, _p, pf = _make(db_session, path=str(f))
    res = get_part_file(pf.id, db_session, _user())
    assert isinstance(res, FileResponse)
    assert res.path == str(f)


def test_serve_404_file_id_inesistente(db_session):
    with pytest.raises(HTTPException) as ei:
        get_part_file(999999, db_session, _user())
    assert ei.value.status_code == 404


def test_serve_404_blob_mancante_su_disco(db_session):
    _q, _p, pf = _make(db_session, path='uploads/manca-di-sicuro.pdf')
    with pytest.raises(HTTPException) as ei:
        get_part_file(pf.id, db_session, _user())
    assert ei.value.status_code == 404


def test_serve_acl_403_se_non_puoi_vedere_il_preventivo(db_session, tmp_path):
    f = tmp_path / 'x.pdf'; f.write_bytes(b'x')
    # preventivo creato da un altro utente; il richiedente non ha view_all → 403
    _q, _p, pf = _make(db_session, created_by=2, path=str(f))
    with pytest.raises(HTTPException) as ei:
        get_part_file(pf.id, db_session, _user(perms=('quotes.create',)))
    assert ei.value.status_code == 403
