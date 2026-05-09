import os
import sys
from pydantic_settings import BaseSettings


_INSECURE_DEFAULT_KEY = "change-me-generate-a-real-secret-key"

# Pattern testuali che identificano placeholder/dev keys: se la SECRET_KEY li
# contiene è quasi certamente non di produzione.
_INSECURE_KEY_PATTERNS = ("change", "secret", "production", "mechquote", "default", "placeholder")

# Lunghezza minima ragionevole per HS256 (raccomandazione: 256-bit di entropia).
_MIN_SECRET_KEY_LENGTH = 32


class Settings(BaseSettings):
    app_name: str = "MechQuote"
    company_name: str = "Fratelli Dalla Via"
    database_url: str = "sqlite:///./mechquote.db"
    secret_key: str = _INSECURE_DEFAULT_KEY
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    class Config:
        env_file = ".env"


settings = Settings()


def _looks_like_production() -> bool:
    """Heuristic: if ALLOWED_ORIGINS contains anything other than localhost, we're not in dev."""
    origins = os.getenv("ALLOWED_ORIGINS", "")
    if not origins:
        return False
    for origin in origins.split(","):
        origin = origin.strip().lower()
        if origin and "localhost" not in origin and "127.0.0.1" not in origin:
            return True
    return False


def _looks_insecure(key: str) -> bool:
    """True se la SECRET_KEY è palesemente debole (default, placeholder, troppo corta).

    Check sintattici, non crypto: una chiave random ad alta entropia che contenga
    'secret' fallirà comunque — accettabile false-positive per tipare l'utente verso
    una chiave generata correttamente (`openssl rand -base64 32`).
    """
    if key == _INSECURE_DEFAULT_KEY:
        return True
    if len(key) < _MIN_SECRET_KEY_LENGTH:
        return True
    lower = key.lower()
    return any(pattern in lower for pattern in _INSECURE_KEY_PATTERNS)


if _looks_insecure(settings.secret_key):
    if _looks_like_production():
        sys.stderr.write(
            "FATAL: SECRET_KEY appare insicura (default, placeholder o troppo corta) "
            "e ALLOWED_ORIGINS suggerisce production. Genera una chiave reale "
            "(es. `openssl rand -base64 32`) e settala in backend/.env prima dell'avvio.\n"
        )
        sys.exit(1)
    import warnings
    warnings.warn(
        f"SECRET_KEY appare insicura. Per production genera una chiave reale "
        f"(min {_MIN_SECRET_KEY_LENGTH} caratteri, no parole comuni).",
        stacklevel=1,
    )
