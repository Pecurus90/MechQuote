from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings

engine = create_engine(settings.database_url, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def utc_now() -> datetime:
    """UTC naive datetime — sostituto deprecation-safe di datetime.utcnow().

    I campi DateTime SQLAlchemy sono naive (no timezone). Salviamo naive UTC
    per consistenza con server_default=func.now(). Per token JWT che richiedono
    datetime aware, usare datetime.now(timezone.utc) direttamente.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)
