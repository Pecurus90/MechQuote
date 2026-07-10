"""Macchina a stati del ciclo di vita preventivo (spec 18, Blocco 4).

Cuore del workflow, condiviso tra `api/quotes.py` (transizioni) e
`api/orders.py` (auto-completamento all'ordine materiale). Tiene:

- le costanti di stato + l'insieme modificabile (`is_editable`)
- il glue DB-aware verso lo stato materiale (`material_status.py` è puro)
- `maybe_complete`: confermato → completo quando il materiale è risolto

Stato lavorazione:
    bozza → inviato → letto → in_attesa_cliente ─┬→ confermato → completo
                                                 └→ non_ordinato (perso)
- modificabile fino a `in_attesa_cliente` compreso; bloccato da `confermato`
  (admin esente). `non_ordinato` è terminale e non modificabile.
- `letto`: auto quando amministrazione apre un `inviato`
- `in_attesa_cliente`: click manuale amministrazione — l'offerta è dal cliente,
  si attende la sua risposta (materiale non ancora ordinabile)
- `confermato`: click manuale amministrazione = il cliente ha ordinato (blocca
  la modifica, materiale ordinabile)
- `non_ordinato`: click manuale amministrazione = il cliente non ha ordinato
  (preventivo perso, terminale, reversibile con `restore` → letto)
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
STATUS_IN_ATTESA_CLIENTE = "in_attesa_cliente"
STATUS_CONFERMATO = "confermato"
STATUS_COMPLETO = "completo"
STATUS_NON_ORDINATO = "non_ordinato"

QUOTE_STATUSES = (
    STATUS_BOZZA, STATUS_INVIATO, STATUS_LETTO, STATUS_IN_ATTESA_CLIENTE,
    STATUS_CONFERMATO, STATUS_COMPLETO, STATUS_NON_ORDINATO,
)

# Fino a "in attesa cliente" il preventivo è modificabile; dalla Conferma è
# bloccato. 'non_ordinato' (perso) è terminale e non modificabile.
EDITABLE_STATUSES = frozenset({
    STATUS_BOZZA, STATUS_INVIATO, STATUS_LETTO, STATUS_IN_ATTESA_CLIENTE,
})

# Da questi stati si può creare un ordine materiale (dopo la Conferma).
ORDERABLE_STATUSES = frozenset({STATUS_CONFERMATO, STATUS_COMPLETO})


def is_editable(status: str) -> bool:
    return status in EDITABLE_STATUSES


def _autofill_sold_price(quote: Quote) -> None:
    """B2 — al completamento inizializza il prezzo di vendita col preventivato.

    Il grafico Costo/Venduto filtra `sold_price IS NOT NULL`: senza questo
    resterebbe vuoto per default (e gli stampi non ci entrerebbero mai). Al
    passaggio a `completo`, se il consuntivo non è ancora stato compilato a
    mano, lo inizializziamo col totale preventivato persistito (`final_total`,
    stampi inclusi via L7). L'utente resta libero di correggerlo col prezzo
    realmente spuntato dall'archivio. Non sovrascrive un valore già presente;
    se `final_total` non è ancora stato calcolato resta NULL (comportamento
    pre-B2, nessuna regressione)."""
    if quote.sold_price is None and quote.final_total is not None:
        quote.sold_price = quote.final_total


def ordered_supplier_ids(db: Session, quote_id: int) -> set:
    """Fornitori già ordinati per un preventivo (dalle righe quote_supplier_orders)."""
    return {
        sid for (sid,) in db.query(QuoteSupplierOrder.material_supplier_id).filter(
            QuoteSupplierOrder.quote_id == quote_id
        ).all()
    }


def quote_material_status(db: Session, quote: Quote) -> str:
    """Stato materiale del preventivo, calcolato dal DB (spec 18).

    Solo i preventivi confermati/completi sono "ordinabili": per gli altri
    eventuali righe d'ordine residue (es. dopo un ritorno indietro) NON contano
    come evasione — il materiale resta 'da ordinare'.
    """
    parts = db.query(Part).options(joinedload(Part.material)).filter(
        Part.quote_id == quote.id
    ).all()
    ordered = ordered_supplier_ids(db, quote.id) if quote.status in ORDERABLE_STATUSES else set()
    return ms.quote_material_status(parts, ordered)


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
    _autofill_sold_price(quote)
    return True


def reconcile_material_state(db: Session, quote: Quote, actor_id: int) -> bool:
    """Riallinea flag materiale + stato lavorazione di un preventivo ordinabile.

    Fonte di verità unica per la *coda* del ciclo (spec 18): va chiamata dopo
    ogni operazione che cambia la realtà materiale — evasione/ordine, delete
    ordine, modifica parti su preventivo bloccato — così le due viste (stato
    derivato dai `QuoteSupplierOrder` e flag legacy `material_ordered_at`) non
    divergono mai. Idempotente. Non fa commit: lo fa il chiamante.

    - Flag legacy `material_ordered_at`/`_by` (ponte compat dashboard): set se
      il materiale è totalmente evaso, azzerato altrimenti. Gli stampi (die)
      hanno il materiale fuori scope → il flag non viene toccato.
    - `confermato` + materiale risolto → `completo` (promote).
    - `completo` + materiale non più risolto → `confermato` (demote): azzera
      `completed_at`/`_by`. Il consuntivo (`sold_price`/`actual_cost`) NON
      viene toccato — è un fatto della vendita, non della coda materiale.

    Sui preventivi non ordinabili (bozza…in_attesa, non_ordinato) non fa nulla.
    Ritorna True se ha cambiato lo *stato lavorazione* (promote o demote): il
    chiamante può notificare / distinguere i riaperti.
    """
    if quote.status not in ORDERABLE_STATUSES:
        return False

    if is_die(quote):
        # Materiale fuori scope: sempre risolto, flag legacy non pertinente.
        resolved = True
    else:
        status = quote_material_status(db, quote)
        resolved = status in (ms.MAT_TOTALMENTE_EVASO, ms.MAT_NON_NECESSARIO)
        if status == ms.MAT_TOTALMENTE_EVASO:
            if quote.material_ordered_at is None:
                quote.material_ordered_at = utc_now()
                quote.material_ordered_by_user_id = actor_id
        else:
            quote.material_ordered_at = None
            quote.material_ordered_by_user_id = None

    if quote.status == STATUS_CONFERMATO and resolved:
        quote.status = STATUS_COMPLETO
        quote.completed_at = utc_now()
        quote.completed_by_user_id = actor_id
        _autofill_sold_price(quote)
        return True
    if quote.status == STATUS_COMPLETO and not resolved:
        quote.status = STATUS_CONFERMATO
        quote.completed_at = None
        quote.completed_by_user_id = None
        return True
    return False
