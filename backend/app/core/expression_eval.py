"""Valutatore di espressioni safe per le `quantity_formula` dei
`DieTemplateNormalized` (Sprint C).

Filosofia: l'utente scrive formule come "n_stations * 2 + 4" o
"4 if area_castello_dm2 < 30 else 6" nel template editor. Il server le
deve valutare in modo affidabile e SICURO (mai `eval()` builtin → rischio
RCE via injection di codice nel testo del template).

Implementazione: `ast.parse(..., mode='eval')` + walker che alza
`UnsafeExpressionError` su qualsiasi nodo fuori whitelist. Nessun accesso
a globals/locals/builtins. Variabili limitate a una whitelist passata dal
chiamante.

Limiti:
- Solo aritmetica, confronti, if/else ternario, min/max/round.
- No funzioni utente, no chiamate ai metodi, no attributi, no comprehensions.
- Lunghezza massima 100 caratteri (limita il blast radius).
"""
import ast
from typing import Any, Dict


class UnsafeExpressionError(Exception):
    """Sollevata quando la formula contiene nodi AST non consentiti."""


# Solo funzioni built-in numeriche essenziali. Niente `eval`, `exec`, `open`…
_SAFE_FUNCTIONS = {
    "min": min,
    "max": max,
    "round": round,
    "abs": abs,
}

# Nodi consentiti: aritmetica + booleani + if-expr (ternario) + chiamate
# alle sole funzioni whitelisted.
_ALLOWED_NODES = (
    ast.Expression,
    ast.Constant,
    ast.Name,
    ast.Load,
    ast.BinOp, ast.UnaryOp,
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow,
    ast.USub, ast.UAdd,
    ast.Compare,
    ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE,
    ast.BoolOp, ast.And, ast.Or,
    ast.IfExp,
    ast.Call,
)

# Limite caratteri: cap difensivo contro espressioni mostruose.
_MAX_LENGTH = 100


def safe_eval(expression: str, variables: Dict[str, Any]) -> Any:
    """Valuta `expression` con `variables` come scope, in modo sicuro.

    Args:
        expression: stringa da valutare. Vuota → ritorna 0.
        variables: dict di variabili disponibili (es. {'n_stations': 3}).
                   Le funzioni `min`/`max`/`round`/`abs` sono sempre disponibili.

    Returns:
        Risultato della valutazione (int o float). Lascia al chiamante
        eventuale cast/clamp.

    Raises:
        UnsafeExpressionError: nodi AST non consentiti, nomi sconosciuti,
                                espressione troppo lunga, sintassi invalida.
    """
    if not expression or not expression.strip():
        return 0
    if len(expression) > _MAX_LENGTH:
        raise UnsafeExpressionError(f"Espressione troppo lunga (>{_MAX_LENGTH} caratteri)")

    try:
        tree = ast.parse(expression, mode='eval')
    except SyntaxError as e:
        raise UnsafeExpressionError(f"Sintassi non valida: {e}")

    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_NODES):
            raise UnsafeExpressionError(
                f"Nodo AST non consentito: {type(node).__name__}"
            )
        # Chiamate: solo funzioni whitelisted, niente metodi (Attribute) o
        # chiamate dinamiche.
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.func.id not in _SAFE_FUNCTIONS:
                raise UnsafeExpressionError(
                    f"Chiamata non consentita: {ast.dump(node.func)}"
                )

    # Scope: variabili passate + funzioni safe. NIENTE __builtins__: passando
    # '{}' come globals e fornendo locals esplicito blocchiamo qualsiasi
    # `__import__`, `open`, ecc.
    scope = {**_SAFE_FUNCTIONS, **variables}
    code = compile(tree, '<safe_eval>', 'eval')
    return eval(code, {'__builtins__': {}}, scope)


def evaluate_quantity_formula(formula: str, variables: Dict[str, Any]) -> int:
    """Wrapper specifico per le `quantity_formula` dei template normalizzati.

    Comportamento:
    - Formula vuota o solo whitespace → 1 (1 pezzo, default ragionevole).
    - Errore di parsing / espressione non sicura → 1 + warning log (NON
      blocca il flusso di creazione preventivo).
    - Risultato negativo o non numerico → 1.
    - Risultato float → arrotondato all'intero più vicino, minimo 0.
    """
    import logging
    log = logging.getLogger(__name__)
    if not formula or not formula.strip():
        return 1
    try:
        result = safe_eval(formula, variables)
    except UnsafeExpressionError as e:
        log.warning("quantity_formula non sicura %r: %s — uso 1", formula, e)
        return 1
    except Exception as e:
        log.warning("quantity_formula errore %r: %s — uso 1", formula, e)
        return 1
    if not isinstance(result, (int, float)):
        return 1
    try:
        return max(0, int(round(result)))
    except (ValueError, OverflowError):
        return 1
