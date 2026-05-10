"""Integration test wrappers — eseguono gli script standalone in `scripts/`.

Ogni script implementa una suite con il proprio output dettagliato (PASS/FAIL
per ogni assertion). Qui verifichiamo solo l'exit code: 0 = tutti i check
verdi, != 0 = almeno un fail (lo script stesso stampa il fail in dettaglio).

Per debug: lancia gli script direttamente da linea di comando, es:
    cd backend && venv/bin/python tests/integration/scripts/e2e_test.py
"""
import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent / "scripts"


def _run(script_name: str) -> int:
    """Esegue uno script come subprocess e ritorna l'exit code."""
    path = SCRIPTS_DIR / script_name
    result = subprocess.run(
        [sys.executable, str(path)],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        print(f"\n=== STDOUT ({script_name}) ===\n{result.stdout}")
        print(f"\n=== STDERR ({script_name}) ===\n{result.stderr}")
    return result.returncode


def test_e2e_general(backend_up, frontend_up, admin_token):
    """Pagine UI tutte raggiungibili + flusso preventivo + PDF + backup."""
    assert _run("e2e_test.py") == 0


def test_aggregation_commessa(backend_up, admin_token):
    """Costi condivisi (trattamento + spedizione) tra parti commessa."""
    assert _run("test_aggregation.py") == 0


def test_workflow_apply(backend_up, admin_token):
    """Workflow template (Macchina + Operation): CRUD + apply clean-slate."""
    assert _run("test_workflow.py") == 0


def test_edm_machine_driven(backend_up, admin_token):
    """Cost engine EDM: autocalc legato a machine.machine_type, non phase_type."""
    assert _run("test_edm_machine_driven.py") == 0


def test_edge_cases(backend_up, admin_token):
    """Auth, validazione input, not-found, recovery, qty edge cases."""
    assert _run("test_edge_cases.py") == 0
