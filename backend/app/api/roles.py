from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List

from app.core.database import get_db
from app.core.security import require_permission
from app.core.permissions import PERMISSION_KEYS
from app.models import Role, RolePermission
from app.schemas import RoleCreate, RoleUpdate, RoleOut

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


@permissions_router.get("")
def list_permission_keys():
    """Return all known permission keys with their labels."""
    return PERMISSION_KEYS


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


@router.patch("/{role_id}/permissions/{key}", response_model=RoleOut)
def toggle_permission(role_id: int, key: str, db: Session = Depends(get_db), _=_admin):
    if key not in PERMISSION_KEYS:
        raise HTTPException(status_code=400, detail="Chiave permesso non valida")
    role = db.query(Role).options(joinedload(Role.permissions)).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Ruolo non trovato")
    existing = next((p for p in role.permissions if p.permission_key == key), None)
    if existing:
        db.delete(existing)
    else:
        db.add(RolePermission(role_id=role_id, permission_key=key))
    db.commit()
    db.refresh(role)
    return _role_to_out(role)
