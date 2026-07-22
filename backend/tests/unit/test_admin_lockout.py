"""Guardie anti-lockout admin (audit §30 M1 / §31 N1) + default utente (M4/M6).

Chiamano le funzioni-endpoint direttamente (niente HTTP) su SQLite in-memory.
"""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.auth import update_user, delete_user
from app.api.roles import toggle_permission, set_permissions_bulk
from app.core.security import get_password_hash
from app.models import Role, RolePermission, User
from app.schemas import RolePermissionsBulk, UserCreate, UserUpdate


def _actor(uid, role='admin', perms=('users',)):
    return SimpleNamespace(id=uid, role=role, username='act', full_name='Act',
                           _permissions=list(perms))


def _mk_admin(db, username, active=True):
    u = User(username=username, hashed_password=get_password_hash('password123'),
             role='admin', is_active=active, full_name=username)
    db.add(u)
    db.flush()
    return u


def _mk_role(db, name, perms):
    r = Role(name=name, label=name, color='#000')
    db.add(r)
    db.flush()
    for p in perms:
        db.add(RolePermission(role_id=r.id, permission_key=p))
    db.flush()
    return r


# ─── M1: ultimo admin attivo ────────────────────────────────────────────────

def test_cannot_demote_last_admin(db_session):
    a = _mk_admin(db_session, 'a1')
    db_session.commit()
    with pytest.raises(HTTPException) as ei:
        update_user(a.id, UserUpdate(role='ufficio_tecnico'), db_session, _actor(a.id))
    assert ei.value.status_code == 400


def test_cannot_deactivate_last_admin(db_session):
    a = _mk_admin(db_session, 'a1')
    db_session.commit()
    with pytest.raises(HTTPException) as ei:
        update_user(a.id, UserUpdate(is_active=False), db_session, _actor(a.id))
    assert ei.value.status_code == 400


def test_demote_allowed_when_another_admin_exists(db_session):
    a = _mk_admin(db_session, 'a1')
    _mk_admin(db_session, 'a2')          # secondo admin attivo
    db_session.commit()
    out = update_user(a.id, UserUpdate(role='ufficio_tecnico'), db_session, _actor(a.id))
    assert out.role == 'ufficio_tecnico'   # consentito: resta un admin


def test_cannot_delete_last_admin(db_session):
    a = _mk_admin(db_session, 'a1')
    db_session.commit()
    # attore diverso dal target (il self-delete è bloccato da un'altra guardia)
    with pytest.raises(HTTPException) as ei:
        delete_user(a.id, db_session, _actor(999))
    assert ei.value.status_code == 400


# ─── N1: ultimo ruolo con 'users' ───────────────────────────────────────────

def test_cannot_remove_users_from_last_role(db_session):
    r = _mk_role(db_session, 'admin', ['users', 'dashboard'])
    db_session.commit()
    with pytest.raises(HTTPException) as ei:
        toggle_permission(r.id, 'users', db_session, None)
    assert ei.value.status_code == 400


def test_can_remove_users_when_another_role_has_it(db_session):
    r1 = _mk_role(db_session, 'admin', ['users'])
    _mk_role(db_session, 'manager', ['users'])
    db_session.commit()
    out = toggle_permission(r1.id, 'users', db_session, None)
    assert 'users' not in out['permissions']


def test_bulk_cannot_remove_users_from_last_role(db_session):
    r = _mk_role(db_session, 'admin', ['users', 'dashboard'])
    db_session.commit()
    with pytest.raises(HTTPException) as ei:
        set_permissions_bulk(r.id, RolePermissionsBulk(keys=['users'], value=False),
                             db_session, None)
    assert ei.value.status_code == 400


# ─── M4 / M6: schema UserCreate ─────────────────────────────────────────────

def test_usercreate_rejects_short_password():
    with pytest.raises(ValidationError):
        UserCreate(username='x', password='short12')   # 7 < 8


def test_usercreate_role_defaults_to_none():
    u = UserCreate(username='x', password='password123')
    assert u.role is None                              # M6: non più 'admin'
