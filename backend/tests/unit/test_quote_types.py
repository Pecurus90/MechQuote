"""Registro tipi di preventivo (guard-rail E1): semantica is_die/is_standard.

Blocca la regola critica NULL→standard (retro-compat preventivi pre-stampi) e
il fatto che i due helper siano complementari, così nessuna futura modifica
introduca magic-string incoerenti.
"""
from types import SimpleNamespace

from app.core.quote_types import (
    is_die, is_standard, QUOTE_TYPE_DIE, QUOTE_TYPE_SINGLE, QUOTE_TYPE_COMMESSA,
)


def test_is_die_by_string():
    assert is_die(QUOTE_TYPE_DIE) is True
    assert is_die(QUOTE_TYPE_SINGLE) is False
    assert is_die(QUOTE_TYPE_COMMESSA) is False
    assert is_die(None) is False


def test_is_die_by_object():
    assert is_die(SimpleNamespace(quote_type='die')) is True
    assert is_die(SimpleNamespace(quote_type='commessa')) is False


def test_is_standard_includes_null_legacy():
    # NULL quote_type (preventivi pre-modulo stampi) = standard.
    assert is_standard(None) is True
    assert is_standard(SimpleNamespace(quote_type=None)) is True
    assert is_standard(QUOTE_TYPE_SINGLE) is True
    assert is_standard(QUOTE_TYPE_DIE) is False


def test_helpers_are_complementary():
    for t in ('die', 'single', 'commessa', None, 'sconosciuto'):
        assert is_die(t) != is_standard(t)
