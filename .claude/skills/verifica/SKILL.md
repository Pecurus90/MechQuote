---
name: verifica
description: Esegue la verifica obbligatoria pre-commit di MechQuote (CLAUDE.md §7) — TypeScript pulito, avvio backend, test unit. Usala prima di ogni commit o quando l'utente chiede di verificare che non si sia rotto niente.
---

# Verifica obbligatoria (§7)

Esegui, in ordine, i controlli della §7 del manuale. Se uno fallisce, **fermati
e non committare**: riporta l'errore esatto.

## 1. TypeScript pulito
```bash
cd frontend && npx tsc --noEmit
```

## 2. Il backend si avvia
```bash
cd backend && venv/Scripts/python -c "from app.main import app; print('OK')"
```

## 3. Test unit (se il cambio tocca calcoli, modelli o API)
```bash
cd backend && venv/Scripts/python -m pytest tests/unit -x
```

## 4. Prova manuale del flusso
Ricorda all'utente di provare a mano il flusso concreto toccato dal cambio
(aprire, cliccare, controllare toast/risultato). Non basta che "compili".

## Note
- venv su questa macchina: `backend/venv/Scripts/python.exe` (Git Bash accetta
  `venv/Scripts/python`).
- Se il cambio tocca il **cost engine** (`calculation.py` / `primitives.py` /
  `quoteCalc.ts`), esegui anche il **golden frontend** oltre a `tests/unit`:
  `cd frontend && npm test` (vitest, `cost-golden.test.ts`). Il pytest testa
  solo il backend: senza questo, una rottura di parità nel gemello TS passa
  inosservata.
- Esito: elenca ✅/❌ per ogni passo. Verde su 1-2 (e 3 se pertinente) =
  requisito minimo per committare.
