"""Test del valutatore di espressioni safe (`core.expression_eval`).

Copre:
- Espressioni legali (aritmetica, if/else ternario, funzioni whitelisted).
- Espressioni illegali (lambda, attribute access, __builtins__, chiamate
  arbitrarie) → UnsafeExpressionError.
- Wrapper `evaluate_quantity_formula` con fallback a 1.
"""
import pytest

from app.core.expression_eval import (
    safe_eval, evaluate_quantity_formula, UnsafeExpressionError,
)


class TestSafeEvalLegit:
    """Espressioni che DEVONO funzionare."""

    def test_constant(self):
        assert safe_eval("4", {}) == 4

    def test_arithmetic(self):
        assert safe_eval("n_stations * 2 + 4", {"n_stations": 3}) == 10

    def test_division(self):
        assert safe_eval("area / 10", {"area": 50}) == 5.0

    def test_ternary(self):
        ctx = {"area_castello_dm2": 25}
        assert safe_eval("4 if area_castello_dm2 < 30 else 6", ctx) == 4
        assert safe_eval("4 if area_castello_dm2 < 30 else 6", {"area_castello_dm2": 35}) == 6

    def test_min_max_round(self):
        assert safe_eval("min(4, n_stations * 2)", {"n_stations": 3}) == 4
        assert safe_eval("max(2, n_stations)", {"n_stations": 5}) == 5
        assert safe_eval("round(3.7)", {}) == 4

    def test_compound_boolean(self):
        ctx = {"n_stations": 5, "area_castello_dm2": 80}
        assert safe_eval("6 if n_stations > 3 and area_castello_dm2 > 50 else 4", ctx) == 6


class TestSafeEvalUnsafe:
    """Espressioni che DEVONO essere rifiutate."""

    def test_no_eval(self):
        with pytest.raises(UnsafeExpressionError):
            safe_eval("__import__('os')", {})

    def test_no_attribute_access(self):
        with pytest.raises(UnsafeExpressionError):
            safe_eval("(1).__class__", {})

    def test_no_lambda(self):
        with pytest.raises(UnsafeExpressionError):
            safe_eval("(lambda: 1)()", {})

    def test_no_unknown_function(self):
        with pytest.raises(UnsafeExpressionError):
            safe_eval("open('file')", {})

    def test_no_string_methods(self):
        with pytest.raises(UnsafeExpressionError):
            safe_eval("'abc'.upper()", {})

    def test_no_list_comprehension(self):
        with pytest.raises(UnsafeExpressionError):
            safe_eval("[x for x in [1,2,3]]", {})

    def test_too_long(self):
        with pytest.raises(UnsafeExpressionError):
            safe_eval("1+" * 60 + "1", {})

    def test_syntax_error(self):
        with pytest.raises(UnsafeExpressionError):
            safe_eval("4 +", {})


class TestEvaluateQuantityFormula:
    """Wrapper con fallback a 1 — non solleva mai eccezioni."""

    def test_empty(self):
        assert evaluate_quantity_formula("", {}) == 1
        assert evaluate_quantity_formula("   ", {}) == 1

    def test_basic(self):
        assert evaluate_quantity_formula("n_stations * 2 + 4", {"n_stations": 3}) == 10

    def test_unsafe_falls_back_to_1(self):
        # Iniezione blocked → fallback 1, log warning.
        assert evaluate_quantity_formula("__import__('os')", {}) == 1

    def test_negative_clamps_to_0(self):
        assert evaluate_quantity_formula("-5", {}) == 0

    def test_float_rounded(self):
        assert evaluate_quantity_formula("3.7", {}) == 4

    def test_unknown_variable_falls_back(self):
        # `xxx` non in scope → NameError → fallback 1.
        assert evaluate_quantity_formula("xxx * 2", {}) == 1
