"""Derivazione dello stato materiale del preventivo (spec 18).

Logica **pura** e single-source: dato l'insieme delle Parti di un preventivo
e l'insieme dei fornitori già ordinati per quel preventivo (righe
`QuoteSupplierOrder`), calcola:

- lo stato materiale del preventivo (`quote_material_status`)
- lo stato materiale della singola parte, per la vista articoli
  (`part_material_state`)
- le parti "da ordinare senza fornitore", che bloccano la Conferma
  (`unassigned_supplier_parts`)

Le funzioni accedono solo agli attributi delle Parti (`material_id`,
`customer_supplied_material`, `material_from_stock`, `material.supplier_id`),
quindi sono testabili anche con oggetti fittizi. Il chiamante deve aver
caricato `Part.material` (joinedload) per non incorrere in N+1.

"Da ordinare" = la parte ha un materiale reale da approvvigionare:
`material_id` valorizzato, NON conto lavoro, NON da magazzino. Una parte così
concorre all'evasione anche se non ha ancora un fornitore (→ blocca la
Conferma finché non gliene assegni uno).
"""
from __future__ import annotations

from typing import Iterable, List, Set

# ─── Stato materiale del preventivo (aggregato) ─────────────────────────────
MAT_NON_NECESSARIO = "non_necessario"
MAT_NON_ORDINATO = "non_ordinato"
MAT_PARZIALE = "parziale"
MAT_TOTALMENTE_EVASO = "totalmente_evaso"

# ─── Stato materiale della singola parte (per la vista articoli) ────────────
PART_CONTO_LAVORO = "conto_lavoro"
PART_DA_MAGAZZINO = "da_magazzino"
PART_NESSUN_MATERIALE = "nessun_materiale"
PART_SENZA_FORNITORE = "senza_fornitore"
PART_DA_ORDINARE = "da_ordinare"
PART_ORDINATO = "ordinato"


def _part_supplier_id(part) -> int | None:
    """supplier_id del materiale della parte (None se materiale/fornitore assenti)."""
    mat = getattr(part, "material", None)
    return getattr(mat, "supplier_id", None) if mat is not None else None


def part_needs_ordering(part) -> bool:
    """True se la parte ha materiale reale da approvvigionare.

    Esclude conto lavoro (cliente porta il materiale) e da magazzino (già in
    officina). Una parte con materiale ma senza fornitore resta "da ordinare".
    """
    return (
        bool(getattr(part, "material_id", None))
        and not getattr(part, "customer_supplied_material", False)
        and not getattr(part, "material_from_stock", False)
    )


def part_material_state(part, ordered_supplier_ids: Set[int]) -> str:
    """Stato materiale della singola parte (per la vista articoli espandibile).

    Precedenza: conto lavoro / da magazzino vincono anche se c'è un materiale.
    """
    if getattr(part, "customer_supplied_material", False):
        return PART_CONTO_LAVORO
    if getattr(part, "material_from_stock", False):
        return PART_DA_MAGAZZINO
    if not getattr(part, "material_id", None):
        return PART_NESSUN_MATERIALE
    sup = _part_supplier_id(part)
    if sup is None:
        return PART_SENZA_FORNITORE
    return PART_ORDINATO if sup in ordered_supplier_ids else PART_DA_ORDINARE


def quote_material_status(parts: Iterable, ordered_supplier_ids: Set[int]) -> str:
    """Stato materiale aggregato del preventivo.

    - nessuna parte da ordinare → `non_necessario`
    - una parte è "coperta" se ha un fornitore e quel fornitore è tra gli
      ordinati (le parti senza fornitore non sono mai coperte)
    - nessuna coperta → `non_ordinato`; tutte → `totalmente_evaso`; altrimenti
      → `parziale`
    """
    need = [p for p in parts if part_needs_ordering(p)]
    if not need:
        return MAT_NON_NECESSARIO

    def covered(p) -> bool:
        sup = _part_supplier_id(p)
        return sup is not None and sup in ordered_supplier_ids

    n_covered = sum(1 for p in need if covered(p))
    if n_covered == 0:
        return MAT_NON_ORDINATO
    if n_covered == len(need):
        return MAT_TOTALMENTE_EVASO
    return MAT_PARZIALE


def unassigned_supplier_parts(parts: Iterable) -> List:
    """Parti da ordinare ma senza fornitore assegnato.

    Bloccherebbero per sempre il `totalmente_evaso`: la Conferma preventivo va
    impedita finché questa lista non è vuota (spec 18 §2).
    """
    return [p for p in parts if part_needs_ordering(p) and _part_supplier_id(p) is None]


def required_supplier_ids(parts: Iterable) -> Set[int]:
    """Insieme dei fornitori che vanno ordinati per evadere il preventivo."""
    return {
        sid for p in parts
        if part_needs_ordering(p) and (sid := _part_supplier_id(p)) is not None
    }
