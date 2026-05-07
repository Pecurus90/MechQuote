import os
import sys
from pydantic_settings import BaseSettings


_INSECURE_DEFAULT_KEY = "change-me-generate-a-real-secret-key"


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


if settings.secret_key == _INSECURE_DEFAULT_KEY:
    if _looks_like_production():
        sys.stderr.write(
            "FATAL: SECRET_KEY is the insecure default and ALLOWED_ORIGINS suggests production. "
            "Set a real SECRET_KEY in backend/.env before starting.\n"
        )
        sys.exit(1)
    import warnings
    warnings.warn(
        "SECRET_KEY is using the insecure default value. "
        "Set SECRET_KEY in .env before deploying to production.",
        stacklevel=1,
    )
