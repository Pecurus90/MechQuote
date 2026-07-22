from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List

from app.core.database import get_db
from app.core.security import require_permission
from app.core.permissions import PERMISSION_KEYS, PERMISSION_GROUPS
from app.models import Role, RolePermission
from app.schemas import RoleCreate, RoleUpdate, RoleOut, RolePermissionsBulk

router = APIRouter(prefix="/api/roles", tags=["roles"])
permissions_router = APIRouter(prefix="/api/permissions", tags=["permissions"])

_admin = require_permission('users')


def _role_to_out(role: Role) -> dict:
    return {
        "id": role.id,
        "name": role.name,
        "label": role.label,
        "color": role.color,
        "permissions": [p.permission_key for p in role.permissions],
    }


def _ensure_users_perm_survives(db: Session, role: Role) -> None:
    """N1 — impedisce di lasciare 0 ruoli con 'users' (la chiave che gestisce
    utenti E ruoli): senza, si perde la capacità di rimediare dalla UI
    (lockout, recupero solo via DB/script). Chiamata quando si sta per TOGLIERE
    'users' da `role`: verifica che almeno un ALTRO ruolo la mantenga."""
    others = db.query(RolePermission).filter(
        RolePermission.permission_key == 'users',
        RolePermission.role_id != role.id,
    ).count()
    if others == 0:
        raise HTTPException(
            status_code=400,
            detail="Operazione bloccata: 'Gestione utenti' resterebbe senza "
                   "alcun ruolo. Assegnala a un altro ruolo prima di toglierla.",
        )


@permissions_router.get("")
def list_permission_keys():
    """Return all known permission keys with their labels."""
    return PERMISSION_KEYS


@permissions_router.get("/grouped")
def list_permission_groups():
    """Permessi raggruppati per dominio, ordinati, per la pagina Ruoli e Permessi.

    Forma: `[{"group": label, "items": [{"key", "label"}]}]`. Le chiavi non
    incluse in PERMISSION_GROUPS finiscono in un gruppo "Altro" (difesa contro
    una chiave nuova dimenticata: non deve sparire dalla UI).
    """
    grouped = []
    seen: set[str] = set()
    for label, keys in PERMISSION_GROUPS:
        items = [{"key": k, "label": PERMISSION_KEYS[k]} for k in keys if k in PERMISSION_KEYS]
        seen.update(i["key"] for i in items)
        if items:
            grouped.append({"group": label, "items": items})
    leftover = [{"key": k, "label": v} for k, v in PERMISSION_KEYS.items() if k not in seen]
    if leftover:
        grouped.append({"group": "Altro", "items": leftover})
    return grouped


@router.get("", response_model=List[RoleOut])
def list_roles(db: Session = Depends(get_db)):
    roles = db.query(Role).options(joinedload(Role.permissions)).order_by(Role.id).all()
    return [_role_to_out(r) for r in roles]


@router.post("", response_model=RoleOut)
def create_role(data: RoleCreate, db: Session = Depends(get_db), _=_admin):
    slug = data.name.strip().lower().replace(" ", "_")
    if db.query(Role).filter(Role.name == slug).first():
        raise HTTPException(status_code=400, detail="Nome ruolo già esistente")
    role = Role(name=slug, label=data.label, color=data.color)
    db.add(role)
    db.commit()
    db.refresh(role)
    return _role_to_out(role)


@router.put("/{role_id}", response_model=RoleOut)
def update_role(role_id: int, data: RoleUpdate, db: Session = Depends(get_db), _=_admin):
    role = db.query(Role).options(joinedload(Role.permissions)).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Ruolo non trovato")
    if data.label is not None:
        role.label = data.label
    if data.color is not None:
        role.color = data.color
    db.commit()
    db.refresh(role)
    return _role_to_out(role)


@router.delete("/{role_id}")
def delete_role(role_id: int, db: Session = Depends(get_db), _=_admin):
    from app.models import User
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Ruolo non trovato")
    if db.query(User).filter(User.role == role.name).first():
        raise HTTPException(status_code=400, detail="Ruolo in uso da utenti attivi — spostali prima")
    db.delete(role)
    db.commit()
    return {"ok": True}


@router.patch("/{role_id}/permissions", response_model=RoleOut)
def set_permissions_bulk(role_id: int, data: RolePermissionsBulk, db: Session = Depends(get_db), _=_admin):
    """Accende/spegne in blocco più chiavi per un ruolo (toggle di gruppo)."""
    invalid = [k for k in data.keys if k not in PERMISSION_KEYS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Chiavi non valide: {', '.join(invalid)}")
    role = db.query(Role).options(joinedload(Role.permissions)).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Ruolo non trovato")
    existing = {p.permission_key: p for p in role.permissions}
    # N1: se questo bulk sta TOGLIENDO 'users' a un ruolo che ce l'ha, verifica
    # che non sia l'ultimo a possederla (anti-lockout RBAC).
    if not data.value and 'users' in data.keys and 'users' in existing:
        _ensure_users_perm_survives(db, role)
    for k in data.keys:
        if data.value and k not in existing:
            db.add(RolePermission(role_id=role_id, permission_key=k))
        elif not data.value and k in existing:
            db.delete(existing[k])
    db.commit()
    db.refresh(role)
    return _role_to_out(role)


@router.patch("/{role_id}/permissions/{key}", response_model=RoleOut)
def toggle_permission(role_id: int, key: str, db: Session = Depends(get_db), _=_admin):
    if key not in PERMISSION_KEYS:
        raise HTTPException(status_code=400, detail="Chiave permesso non valida")
    role = db.query(Role).options(joinedload(Role.permissions)).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Ruolo non trovato")
    existing = next((p for p in role.permissions if p.permission_key == key), None)
    if existing:
        if key == 'users':
            _ensure_users_perm_survives(db, role)  # N1: anti-lockout RBAC
        db.delete(existing)
    else:
        db.add(RolePermission(role_id=role_id, permission_key=key))
    db.commit()
    db.refresh(role)
    return _role_to_out(role)
