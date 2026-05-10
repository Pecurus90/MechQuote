#!/usr/bin/env bash
# Lancia la suite integration test (richiede backend + frontend dev server up).
#
# Uso:
#   ./run-tests.sh             # tutta la suite
#   ./run-tests.sh -k workflow # solo test che matchano "workflow"
#
# Pre-req:
#   - backend running CON RATE LIMIT DISABILITATO:
#       MQ_DISABLE_RATE_LIMIT=1 venv/bin/uvicorn app.main:app --port 8000
#     (i test fanno N login in successione, sbattono contro 5/min altrimenti)
#   - frontend running: cd ../frontend && npx vite (port 3000) — solo per e2e
#
# Pytest skippa automaticamente le suite se l'host non è raggiungibile.
set -euo pipefail
cd "$(dirname "$0")"
exec venv/bin/pytest tests/integration "$@"
