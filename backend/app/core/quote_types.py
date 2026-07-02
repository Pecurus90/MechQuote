"""Registro dei tipi di preventivo.

Un unico posto per i valori validi di `Quote.quote_type` e per la distinzione
die/standard, così da eliminare le magic-string sparse (`== 'die'`). NULL è
trattato come **standard** (retro-compatibile coi preventivi pre-modulo stampi).

Uso: `is_die(quote)` / `is_standard(quote)` sui controlli d'oggetto Python.
Nelle query SQL raw (dashboard) resta il literal, ma si può interpolare
`QUOTE_TYPE_DIE` (è una costante fissa, nessun rischio injection).
"""
from typing import Optional

QUOTE_TYPE_SINGLE = "single"
QUOTE_TYPE_COMMESSA = "commessa"
QUOTE_TYPE_DIE = "die"

# Tutti i tipi "standard" (motore preventivi classico). NULL è standard di fatto.
STANDARD_QUOTE_TYPES = frozenset({QUOTE_TYPE_SINGLE, QUOTE_TYPE_COMMESSA})
QUOTE_TYPES = frozenset({QUOTE_TYPE_SINGLE, QUOTE_TYPE_COMMESSA, QUOTE_TYPE_DIE})


def _type_of(quote_or_type) -> Optional[str]:
    """Estrae la stringa quote_type da un Quote o la ritorna se già stringa."""
    if quote_or_type is None:
        return None
    if isinstance(quote_or_type, str):
        return quote_or_type
    return getattr(quote_or_type, "quote_type", None)


def is_die(quote_or_type) -> bool:
    """True se è un preventivo Stampi. Accetta un Quote o la stringa quote_type."""
    return _type_of(quote_or_type) == QUOTE_TYPE_DIE


def is_standard(quote_or_type) -> bool:
    """True se è un preventivo standard (single/commessa, o NULL legacy)."""
    return not is_die(quote_or_type)
