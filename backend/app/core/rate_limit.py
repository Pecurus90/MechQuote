"""Rate limiter condiviso (slowapi).

Definito in un modulo dedicato per evitare circular import: `auth.py`
e `main.py` lo importano entrambi senza dipendere l'uno dall'altro.

Storage in memoria (default slowapi). Va bene per single-process —
quando si scalerà a multi-worker uvicorn andrà sostituito con uno
storage condiviso (Redis), altrimenti ogni worker ha il proprio
contatore e il limite effettivo è N×worker.

Chiave: IP del client (`get_remote_address`). Per LAN aziendale è
sensato — ogni postazione ha il proprio limite.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
