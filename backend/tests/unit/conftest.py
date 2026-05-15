"""Fixture comuni ai test unit (no backend live).

Strategia: ogni test usa una SQLite in-memory pulita, popolata col solo
schema (`Base.metadata.create_all`). I record di seed (Material, Machine,
EdmConfig, ecc.) li crea il singolo test, per restare leggibili e
indipendenti l'uno dall'altro.

Separato da `tests/integration/conftest.py` (che richiede uvicorn live):
i test unit girano in qualsiasi ambiente, anche CI senza database fisico.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
# Import esplicito di app.models — la chiamata `Base.metadata.create_all`
# vede solo i modelli che sono stati importati nel processo Python.
import app.models  # noqa: F401  pylint: disable=unused-import


@pytest.fixture
def db_session():
    """SQLite in-memory + schema completo, isolato per ogni test."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()
