"""Pytest fixtures for integration tests.

Strategy: questi sono integration test che richiedono il backend live
(uvicorn su http://localhost:8000) + il frontend dev server (vite su :3000)
per i test che usano Playwright.

Pattern: ogni test è un wrapper minimale su uno script standalone in
`scripts/` — gli script implementano la logica completa, qui dentro
ne verifichiamo solo l'exit code. Così il singolo script è eseguibile
da solo a mano (`venv/bin/python tests/integration/scripts/e2e_test.py`)
e l'output del fail è ricco di dettagli.

L'auto-skip della suite quando il backend è down evita CI rosse confuse.
"""
import os
import socket
import pytest
import requests

BACKEND = os.environ.get("MQ_BACKEND_URL", "http://localhost:8000")
FRONTEND = os.environ.get("MQ_FRONTEND_URL", "http://localhost:3000")


def _is_up(url: str, timeout: float = 1.0) -> bool:
    try:
        return requests.get(f"{url}/api/health", timeout=timeout).status_code == 200
    except (requests.RequestException, socket.error):
        return False


@pytest.fixture(scope="session")
def backend_up():
    if not _is_up(BACKEND):
        pytest.skip(
            f"Backend non raggiungibile su {BACKEND}. "
            "Avvialo con: cd backend && venv/bin/uvicorn app.main:app --port 8000"
        )
    return BACKEND


@pytest.fixture(scope="session")
def frontend_up():
    try:
        ok = requests.get(FRONTEND, timeout=1.0).status_code == 200
    except (requests.RequestException, socket.error):
        ok = False
    if not ok:
        pytest.skip(
            f"Frontend non raggiungibile su {FRONTEND}. "
            "Avvialo con: cd frontend && npx vite (port 3000)"
        )
    return FRONTEND


@pytest.fixture(scope="session")
def admin_token(backend_up):
    """Token JWT admin/admin (bootstrap user)."""
    r = requests.post(
        f"{backend_up}/api/auth/login",
        data={"username": "admin", "password": "admin"},
    )
    if r.status_code != 200:
        pytest.fail(
            f"Login admin fallito ({r.status_code}). "
            "Verifica che l'utente bootstrap esista (vedi CLAUDE.md §3 Bootstrap primo admin)."
        )
    return r.json()["access_token"]
