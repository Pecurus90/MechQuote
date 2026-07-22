import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from fastapi.security import OAuth2PasswordRequestForm

from app.core.database import get_db
from app.core.rate_limit import limiter
from app.core.security import verify_password, get_password_hash, create_access_token, get_current_user, require_permission
from app.models import User
from app.schemas import Token, UserCreate, UserUpdate, UserOut, ChangePasswordIn

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])


def _guard_admin_role(current_user: User, target_role: Optional[str]) -> None:
    """Refusa di assegnare role='admin' se chi chiama non è già admin.

    Protezione anti privilege-escalation: un utente con permesso 'users'
    può creare/modificare utenti, ma NON può promuovere altri (o sé stesso)
    ad admin se non è già admin.
    """
    if target_role == 'admin' and current_user.role != 'admin':
        raise HTTPException(
            status_code=403,
            detail="Solo un admin può assegnare il ruolo admin",
        )


def _guard_modify_admin(current_user: User, target_user: User) -> None:
    """Refusa di modificare/eliminare un utente admin se chi chiama non è admin.

    Senza questa guardia un utente con permesso 'users' potrebbe resettare la
    password di un admin (o modificarne il ruolo a non-admin) e ottenere
    privilege escalation indiretta.
    """
    if target_user.role == 'admin' and current_user.role != 'admin':
        raise HTTPException(
            status_code=403,
            detail="Solo un admin può modificare un account admin",
        )


def _ensure_not_last_active_admin(
    db: Session, target: User, *,
    new_role: Optional[str] = None, new_active: Optional[bool] = None,
) -> None:
    """M1 — impedisce di lasciare l'organizzazione senza NESSUN admin attivo.

    Copre demote (role diverso da 'admin'), disattivazione ed eliminazione
    dell'ultimo admin attivo. Senza, un admin può declassarsi/disattivarsi e
    bloccare tutti fuori dalle funzioni admin (users/backup/company): il
    recupero passerebbe solo dallo script di bootstrap. Il self-delete era già
    bloccato, il self-demote/deactivate no.
    """
    if not (target.role == 'admin' and target.is_active):
        return
    still_admin = (new_role if new_role is not None else target.role) == 'admin'
    still_active = new_active if new_active is not None else target.is_active
    if still_admin and still_active:
        return
    others = db.query(User).filter(
        User.role == 'admin', User.is_active == True, User.id != target.id,  # noqa: E712
    ).count()
    if others == 0:
        raise HTTPException(
            status_code=400,
            detail="Operazione bloccata: è l'ultimo amministratore attivo. "
                   "Promuovi o attiva un altro admin prima.",
        )


@router.post("/register", response_model=Token)
def register(
    user: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=require_permission('users'),
):
    _guard_admin_role(current_user, user.role)
    existing = db.query(User).filter(User.username == user.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username già esistente")
    db_user = User(
        username=user.username,
        hashed_password=get_password_hash(user.password),
        full_name=user.full_name,
        email=user.email,
        role=user.role or 'ufficio_tecnico',
    )
    db.add(db_user)
    db.commit()
    token = create_access_token({"sub": user.username})
    return {"access_token": token, "token_type": "bearer"}


@router.post("/login", response_model=Token)
@limiter.limit("5/minute")
def login(
    request: Request,  # required by slowapi to extract client IP
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        # Log username MA NON la password. Utile per intercettare brute force.
        logger.warning("Login fallito per username=%r", form_data.username)
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    if not user.is_active:
        logger.warning("Login rifiutato — account disattivato: username=%r", user.username)
        raise HTTPException(status_code=403, detail="Account disabilitato")
    logger.info("Login OK: username=%s role=%s", user.username, user.role)
    token = create_access_token({"sub": user.username})
    return {"access_token": token, "token_type": "bearer"}


@router.post("/change-password")
def change_password(
    data: ChangePasswordIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cambio password self-service (AUD-13): l'utente cambia la propria
    password verificando quella attuale. Nessun permesso richiesto oltre
    all'essere autenticato."""
    if not verify_password(data.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="La password attuale non è corretta")
    if data.new_password == data.old_password:
        raise HTTPException(status_code=400, detail="La nuova password deve essere diversa da quella attuale")
    current_user.hashed_password = get_password_hash(data.new_password)
    db.commit()
    logger.info("Password cambiata (self-service): username=%s", current_user.username)
    return {"ok": True}


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "role": current_user.role,
        "permissions": getattr(current_user, '_permissions', []),
    }


# ─── User management (gating: 'users' permission) ────────────────────────────

users_router = APIRouter(prefix="/api/users", tags=["users"])
_can_manage_users = require_permission('users')


@users_router.get("", response_model=List[UserOut], dependencies=[_can_manage_users])
def list_users(db: Session = Depends(get_db)):
    # Limit difensivo (audit Sprint D — M5): la lista utenti oggi è piccola
    # ma .all() senza cap su tabelle che possono crescere è anti-pattern.
    return db.query(User).order_by(User.id).limit(1000).all()


@users_router.post("", response_model=UserOut, dependencies=[_can_manage_users])
def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _guard_admin_role(current_user, data.role)
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(status_code=400, detail="Username già esistente")
    user = User(
        username=data.username,
        hashed_password=get_password_hash(data.password),
        full_name=data.full_name,
        email=data.email,
        role=data.role or 'ufficio_tecnico',
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@users_router.put("/{user_id}", response_model=UserOut, dependencies=[_can_manage_users])
def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    _guard_modify_admin(current_user, user)
    _guard_admin_role(current_user, data.role)
    _ensure_not_last_active_admin(db, user, new_role=data.role, new_active=data.is_active)
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.email is not None:
        user.email = data.email
    if data.role is not None:
        user.role = data.role
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.password:
        user.hashed_password = get_password_hash(data.password)
    db.commit()
    db.refresh(user)
    return user


@users_router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Self-delete check va prima del permission check, perché serve current_user.id
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Non puoi eliminare il tuo account")
    if 'users' not in getattr(current_user, '_permissions', []):
        raise HTTPException(status_code=403, detail="Permesso negato")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    _guard_modify_admin(current_user, user)
    _ensure_not_last_active_admin(db, user, new_active=False)  # M1
    db.delete(user)
    db.commit()
    return {"ok": True}
