"""Rete di sicurezza sul percorso permessi/auth (tema J, 2026-07-02).

Tre livelli, tutti unit (SQLite in-memory, nessun server live):
1. Invarianti di configurazione: PERMISSION_KEYS / PERMISSION_GROUPS /
   DEFAULT_ROLE_PERMISSIONS coerenti tra loro (blocca typo e derive future).
2. Primitivo di gating: require_permission / require_any_permission bloccano
   davvero (403) o passano, in base ai permessi dell'utente.
3. get_current_user: carica i permessi dal DB e applica l'anti-lockout admin.
"""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core.permissions import (
    PERMISSION_KEYS, PERMISSION_GROUPS, DEFAULT_ROLE_PERMISSIONS,
)
from app.core.security import (
    require_permission, require_any_permission, get_current_user,
    create_access_token,
)
from app.models import User, Role, RolePermission


# ─── 1. Invarianti di configurazione ────────────────────────────────────────

def test_new_j_keys_exist():
    """Le chiavi introdotte nel tema J devono esistere."""
    for key in ("quotes.edit_locked", "quotes.delete", "orders.tools"):
        assert key in PERMISSION_KEYS
    # tools e orders.tools sono distinti (split catalogo vs ordini utensili)
    assert "tools" in PERMISSION_KEYS and "orders.tools" in PERMISSION_KEYS


def test_permission_groups_cover_all_keys_once():
    """I gruppi (pagina Ruoli e Permessi) coprono ogni chiave esattamente una volta."""
    grouped = [k for _label, keys in PERMISSION_GROUPS for k in keys]
    assert len(grouped) == len(set(grouped)), "chiave duplicata tra i gruppi"
    assert set(grouped) == set(PERMISSION_KEYS), (
        "PERMISSION_GROUPS deve coprire esattamente PERMISSION_KEYS "
        f"(mancanti: {set(PERMISSION_KEYS) - set(grouped)}, "
        f"extra: {set(grouped) - set(PERMISSION_KEYS)})"
    )


def test_default_role_permissions_reference_valid_keys():
    """Nessun typo: ogni chiave assegnata ai ruoli di default esiste."""
    for role, keys in DEFAULT_ROLE_PERMISSIONS.items():
        for key in keys:
            assert key in PERMISSION_KEYS, f"{role} referenzia chiave inesistente: {key}"


def test_admin_default_has_all_keys():
    assert set(DEFAULT_ROLE_PERMISSIONS["admin"]) == set(PERMISSION_KEYS)


def test_officina_role_is_restricted():
    """Officina: solo la sua area + catalogo utensili (decisione 2026-07-02)."""
    assert set(DEFAULT_ROLE_PERMISSIONS["officina"]) == {"officina", "officina.write", "tools"}
    off = DEFAULT_ROLE_PERMISSIONS["officina"]
    for forbidden in ("orders.materials", "orders.tools", "dashboard", "notifications",
                      "quotes.archive", "quotes.pdf"):
        assert forbidden not in off


def test_orders_tools_assigned_to_order_roles_not_officina():
    for role in ("admin", "ufficio_tecnico", "amministrazione"):
        assert "orders.tools" in DEFAULT_ROLE_PERMISSIONS[role]
    assert "orders.tools" not in DEFAULT_ROLE_PERMISSIONS["officina"]


def test_edit_locked_and_delete_default_admin_only():
    """quotes.edit_locked / quotes.delete di default solo admin (delegabili)."""
    for key in ("quotes.edit_locked", "quotes.delete"):
        for role, keys in DEFAULT_ROLE_PERMISSIONS.items():
            if role == "admin":
                assert key in keys
            else:
                assert key not in keys, f"{key} non dovrebbe essere di default in {role}"


# ─── 2. Primitivo di gating (require_permission / require_any_permission) ─────

def _run(dep, perms):
    """Esegue il check interno di un Depends di permesso con un utente finto."""
    user = SimpleNamespace(_permissions=perms)
    return dep.dependency(current_user=user)


def test_require_permission_allows_and_blocks():
    dep = require_permission("quotes.delete")
    # ha il permesso → passa e ritorna l'utente
    user = _run(dep, ["quotes.delete", "dashboard"])
    assert user._permissions == ["quotes.delete", "dashboard"]
    # non ce l'ha → 403
    with pytest.raises(HTTPException) as ei:
        _run(dep, ["dashboard"])
    assert ei.value.status_code == 403


def test_require_any_permission_needs_at_least_one():
    dep = require_any_permission("quotes.send", "quotes.confirm")
    assert _run(dep, ["quotes.confirm"]) is not None    # una basta
    with pytest.raises(HTTPException) as ei:
        _run(dep, ["dashboard"])                         # nessuna → 403
    assert ei.value.status_code == 403


def test_missing_permissions_attr_blocks():
    """Utente senza _permissions (edge) → negato, non crash."""
    dep = require_permission("dashboard")
    with pytest.raises(HTTPException):
        dep.dependency(current_user=SimpleNamespace())


# ─── 3. get_current_user: caricamento permessi + anti-lockout ────────────────

def _seed_user(db, username, role_name, perms=None, active=True):
    db.add(User(username=username, hashed_password="x", full_name=username,
                role=role_name, is_active=active))
    if perms is not None:
        role = Role(name=role_name, label=role_name, color="gray")
        db.add(role)
        db.flush()
        for k in perms:
            db.add(RolePermission(role_id=role.id, permission_key=k))
    db.commit()


def test_get_current_user_loads_perms_from_db(db_session):
    _seed_user(db_session, "mario", "ufficio_tecnico", perms=["dashboard", "quotes.create"])
    token = create_access_token({"sub": "mario"})
    user = get_current_user(token=token, db=db_session)
    assert set(user._permissions) == {"dashboard", "quotes.create"}


def test_get_current_user_admin_anti_lockout_when_role_missing(db_session):
    """Slug admin ma ruolo NON in tabella roles → tutti i permessi (salva-vita)."""
    _seed_user(db_session, "root", "admin", perms=None)  # nessun Role 'admin' creato
    token = create_access_token({"sub": "root"})
    user = get_current_user(token=token, db=db_session)
    assert set(user._permissions) == set(PERMISSION_KEYS)


def test_get_current_user_unknown_role_gets_nothing(db_session):
    """Ruolo inesistente e non-admin → nessun permesso (non crash)."""
    _seed_user(db_session, "ghost", "ruolo_fantasma", perms=None)
    token = create_access_token({"sub": "ghost"})
    user = get_current_user(token=token, db=db_session)
    assert user._permissions == []


def test_inactive_user_rejected(db_session):
    _seed_user(db_session, "sospeso", "ufficio_tecnico", perms=["dashboard"], active=False)
    token = create_access_token({"sub": "sospeso"})
    with pytest.raises(HTTPException) as ei:
        get_current_user(token=token, db=db_session)
    assert ei.value.status_code == 401
