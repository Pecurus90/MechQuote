"""Macchina a stati del ciclo di vita preventivo (spec 18, Blocco 4).

Cuore del workflow, condiviso tra `api/quotes.py` (transizioni) e
`api/orders.py` (auto-completamento all'ordine materiale). Tiene:

- le costanti di stato + l'insieme modificabile (`is_editable`)
- il glue DB-aware verso lo stato materiale (`material_status.py` è puro)
- `maybe_complete`: confermato → completo quando il materiale è risolto

Stato lavorazione:
    bozza → inviato → letto → confermato → completo
- modificabile fino a `letto` compreso; bloccato da `confermato` (admin esente)
- `letto`: auto quando amministrazione apre un `inviato`
- `confermato`: click manuale amministrazione (blocca la modifica)
- `completo`: auto quando `confermato` e materiale risolto (evaso o non
  necessario). Per i preventivi Stampi (`die`, fuori scope materiale) il
  materiale è considerato sempre risolto → conferma = completo.
"""
from __future__ import annotations

from sqlalchemy.orm import Session, joinedload

from app.core.database import utc_now
from app.core.quote_types import is_die
from app.models import Part, Quote, QuoteSupplierOrder
from app.services import material_status as ms

STATUS_BOZZA = "bozza"
STATUS_INVIATO = "inviato"
STATUS_LETTO = "letto"
STATUS_CONFERMATO = "confermato"
STATUS_COMPLETO = "completo"

QUOTE_STATUSES = (
    STATUS_BOZZA, STATUS_INVIATO, STATUS_LETTO, STATUS_CONFERMATO, STATUS_COMPLETO,
)

# Fino a "letto" il preventivo è modificabile; dalla Conferma è bloccato.
EDITABLE_STATUSES = frozenset({STATUS_BOZZA, STATUS_INVIATO, STATUS_LETTO})

# Da questi stati si può creare un ordine materiale (dopo la Conferma).
ORDERABLE_STATUSES = frozenset({STATUS_CONFERMATO, STATUS_COMPLETO})


def is_editable(status: str) -> bool:
    return status in EDITABLE_STATUSES


def ordered_supplier_ids(db: Session, quote_id: int) -> set:
    """Fornitori già ordinati per un preventivo (dalle righe quote_supplier_orders)."""
    return {
        sid for (sid,) in db.query(QuoteSupplierOrder.material_supplier_id).filter(
            QuoteSupplierOrder.quote_id == quote_id
        ).all()
    }


def quote_material_status(db: Session, quote: Quote) -> str:
    """Stato materiale del preventivo, calcolato dal DB (spec 18)."""
    parts = db.query(Part).options(joinedload(Part.material)).filter(
        Part.quote_id == quote.id
    ).all()
    return ms.quote_material_status(parts, ordered_supplier_ids(db, quote.id))


def material_is_resolved(db: Session, quote: Quote) -> bool:
    """True se il materiale non blocca il completamento.

    Stampi: sempre risolto (materiale fuori scope). Preventivi normali:
    materiale totalmente evaso o non necessario.
    """
    if is_die(quote):
        return True
    return quote_material_status(db, quote) in (
        ms.MAT_TOTALMENTE_EVASO, ms.MAT_NON_NECESSARIO,
    )


def maybe_complete(db: Session, quote: Quote, actor_id: int) -> bool:
    """Se il preventivo è `confermato` e il materiale è risolto → `completo`.

    Ritorna True se ha effettuato la transizione (il chiamante manda la
    notifica). Non fa commit: lo fa il chiamante.
    """
    if quote.status != STATUS_CONFERMATO:
        return False
    if not material_is_resolved(db, quote):
        return False
    quote.status = STATUS_COMPLETO
    quote.completed_at = utc_now()
    quote.completed_by_user_id = actor_id
    return True
