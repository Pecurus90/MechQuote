from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
import bcrypt

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    # Scadenza opzionale: se non è passato un delta esplicito e
    # access_token_expire_minutes <= 0, il token NON scade (nessun claim exp).
    if expires_delta is not None:
        to_encode.update({"exp": now + expires_delta})
    elif settings.access_token_expire_minutes > 0:
        to_encode.update({"exp": now + timedelta(minutes=settings.access_token_expire_minutes)})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    from app.models import User, Role  # local import to avoid circular dependency
    from sqlalchemy.orm import joinedload
    from app.core.permissions import PERMISSION_KEYS

    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        username: Optional[str] = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Token non valido")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token non valido")
    user = db.query(User).filter(User.username == username, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="Utente non trovato")

    # Load permissions from role_permissions table; anti-lockout for admin
    role = db.query(Role).options(joinedload(Role.permissions)).filter(Role.name == user.role).first()
    if role:
        user._permissions = [p.permission_key for p in role.permissions]
    elif user.role == 'admin':
        user._permissions = list(PERMISSION_KEYS.keys())
    else:
        user._permissions = []

    return user


def require_permission(key: str):
    """Return a Depends that checks a permission key against the DB-configured role permissions."""
    def _check(current_user=Depends(get_current_user)):
        if key not in getattr(current_user, '_permissions', []):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permesso negato")
        return current_user
    return Depends(_check)


def require_any_permission(*keys: str):
    """Return a Depends che passa se l'utente ha ALMENO UNA delle chiavi.

    Usato per endpoint condivisi tra moduli (es. parts.py + phases.py usati
    sia da preventivi standard che da preventivi stampi: chi modifica le
    piastre deve avere `quotes.create` OPPURE `dies.create`)."""
    def _check(current_user=Depends(get_current_user)):
        perms = getattr(current_user, '_permissions', [])
        if not any(k in perms for k in keys):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permesso negato")
        return current_user
    return Depends(_check)
