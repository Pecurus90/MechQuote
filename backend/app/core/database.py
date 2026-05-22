from datetime import datetime, timezone

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings

engine = create_engine(settings.database_url, connect_args={"check_same_thread": False})


@event.listens_for(Engine, "connect")
def _sqlite_set_pragmas(dbapi_connection, _connection_record):
    """PRAGMA su ogni connessione SQLite.

    - `journal_mode=WAL`: write-ahead log. Letture concorrenti non bloccate
      durante una scrittura (default `delete` bloccava per la durata della
      transazione). Coerente con SQLAlchemy connection pool.
      WAL è persistente sul DB file, ma il PRAGMA va comunque emesso a ogni
      connect per evitare regressioni in caso di restore o copy del file.
    - `busy_timeout=5000`: quando una scrittura trova il DB già lock-ato
      da un'altra connessione, SQLite aspetta fino a 5 secondi che si
      liberi invece di fallire immediatamente con "database is locked".
      Default SQLite è 0 → con 2+ utenti che salvano insieme uno dei due
      perde le modifiche. 5s copre il tempo di una transazione tipica.
    - Niente `foreign_keys=ON` qui: scelta posticipata (vedi audit DB).
      Attivarlo richiede prima verifica orfani sul DB di prod.

    Skip su backend non-SQLite (es. test futuri con Postgres).
    """
    try:
        is_sqlite = dbapi_connection.__class__.__module__.startswith("sqlite3")
    except Exception:
        is_sqlite = False
    if not is_sqlite:
        return
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
    finally:
        cursor.close()


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
