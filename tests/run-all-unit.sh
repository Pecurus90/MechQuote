#!/usr/bin/env bash
# Esegue tutta la rete di test unit del cost engine: backend + frontend.
#
# Uso: ./tests/run-all-unit.sh
#
# Exit code: 0 se entrambe le suite passano (xfail OK), >0 se qualcosa è
# rotto. Gli xfail (test costruiti sui bug Fascia 1 non ancora corretti)
# non fanno fallire la suite — sono "previsti".

set -u
cd "$(dirname "$0")/.."

ROOT="$(pwd)"
BACK_OK=0
FRONT_OK=0

echo "═══════════════════════════════════════════════════════════════"
echo "  BACKEND — pytest tests/unit/test_cost_golden.py"
echo "═══════════════════════════════════════════════════════════════"
cd "$ROOT/backend"
if venv/bin/python -m pytest tests/unit/test_cost_golden.py --tb=short -q 2>&1 | tail -20; then
  BACK_OK=1
fi

echo
echo "═══════════════════════════════════════════════════════════════"
echo "  FRONTEND — vitest tests/unit/cost-golden.test.ts"
echo "═══════════════════════════════════════════════════════════════"
cd "$ROOT/frontend"
if npm test --silent 2>&1 | tail -10; then
  FRONT_OK=1
fi

echo
echo "═══════════════════════════════════════════════════════════════"
echo "  RIEPILOGO"
echo "═══════════════════════════════════════════════════════════════"
if [ $BACK_OK -eq 1 ]; then echo "  Backend  ✅"; else echo "  Backend  ❌"; fi
if [ $FRONT_OK -eq 1 ]; then echo "  Frontend ✅"; else echo "  Frontend ❌"; fi

if [ $BACK_OK -eq 1 ] && [ $FRONT_OK -eq 1 ]; then
  exit 0
else
  exit 1
fi
