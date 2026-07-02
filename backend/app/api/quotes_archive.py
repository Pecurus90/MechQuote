from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload, joinedload
from sqlalchemy import func, extract, or_
from typing import List, Optional

from app.api.orders import _format_dim
from app.core.database import get_db
from app.core.quote_types import is_die
from app.core.security import require_any_permission, get_current_user
from app.models import (
    ManufacturingPhase, Material, Part, Quote, QuoteSupplierOrder, User,
)
from app.schemas import (
    ArchiveQuoteOut, ArticleMaterialRow, QuoteMaterialDetailOut,
)
from app.services.material_status import (
    part_material_state, quote_material_status,
)


router = APIRouter(prefix="/api", tags=["quotes-archive"])

# Archivio: il permesso `quotes.archive` copre i preventivi standard; chi ha
# solo `dies.archive` può accedere alla lista filtrata su quote_type='die'.
# Il filtro applicativo è applicato sotto: senza `quotes.archive` la lista è
# forzata a quote_type='die'.
_can_view = require_any_permission('quotes.archive', 'dies.archive')


def _user_sees_all(current_user: User) -> bool:
    return 'quotes.view_all' in getattr(current_user, '_permissions', [])


def _archive_quote_type_filter(current_user: User, requested: Optional[str]) -> Optional[str]:
    """Se l'utente ha solo `dies.archive`, forza il filtro a 'die'.
    Altrimenti rispetta la richiesta del client (può essere None = tutti)."""
    perms = getattr(current_user, '_permissions', [])
    if 'quotes.archive' not in perms and 'dies.archive' in perms:
        return 'die'
    return requested


@router.get("/quotes/years")
def get_quote_years(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
):
    # ACL: stessa logica di list_archive — gli anni mostrati devono coincidere
    # con il set di preventivi che l'utente può effettivamente vedere.
    query = db.query(func.strftime("%Y", Quote.quote_date)).distinct()
    if not _user_sees_all(current_user):
        query = query.filter(Quote.created_by_user_id == current_user.id)
    forced_type = _archive_quote_type_filter(current_user, None)
    if forced_type:
        query = query.filter(Quote.quote_type == forced_type)
    results = query.all()
    years = sorted([int(r[0]) for r in results if r[0]], reverse=True)
    return years or [2026]


@router.get("/quotes/archive", response_model=List[ArchiveQuoteOut])
def list_archive(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    year: Optional[int] = None,
    q: Optional[str] = None,
    quote_type: Optional[str] = None,   # 'single' | 'commessa' | 'die' (None=tutti)
    phase: Optional[str] = None,        # 'active' (non completo) | 'completed' | None=tutti
    status: Optional[str] = None,       # filtro stato esatto (opzionale)
    page: int = 1,
    page_size: int = 20,
    _=_can_view,
):
    # Clamp parametri di paginazione: niente offset negativo, page_size in range sensato
    page = max(1, page)
    page_size = max(1, min(100, page_size))
    # joinedload(die_spec) per dare al frontend cost_industrial/margin/discount
    # senza una seconda chiamata per ogni riga. parts.material serve per lo
    # stato materiale derivato (spec 18).
    query = db.query(Quote).options(
        selectinload(Quote.parts).selectinload(Part.material),
        joinedload(Quote.die_spec),
    )
    # ACL: senza quotes.view_all l'utente vede solo i preventivi che ha creato.
    if not _user_sees_all(current_user):
        query = query.filter(Quote.created_by_user_id == current_user.id)
    if year:
        query = query.filter(extract('year', Quote.quote_date) == year)
    quote_type = _archive_quote_type_filter(current_user, quote_type)
    if quote_type:
        # Modulo Stampi: tab dedicato all'archivio mostra solo quote_type='die'.
        # Utente con solo `dies.archive` è forzato a 'die' (vedi helper).
        query = query.filter(Quote.quote_type == quote_type)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(
            Quote.quote_number.ilike(like),
            Quote.customer_name.ilike(like),
        ))
    # Spec 18: split "Preventivi in corso" (non completo) vs Archivio (completo).
    if phase == 'completed':
        query = query.filter(Quote.status == 'completo')
    elif phase == 'active':
        query = query.filter(Quote.status.in_(['bozza', 'inviato', 'letto', 'confermato']))
    if status:
        query = query.filter(Quote.status == status)
    query = query.order_by(Quote.quote_date.desc(), Quote.id.desc())
    offset = (page - 1) * page_size
    results = query.offset(offset).limit(page_size).all()

    # Stato materiale derivato (spec 18) per la colonna archivio. Batch dei
    # fornitori ordinati per i preventivi di questa pagina (evita N+1). Gli
    # stampi restano fuori scope → material_status None.
    quote_ids = [r.id for r in results]
    ordered_map: dict = {}
    if quote_ids:
        rows = db.query(
            QuoteSupplierOrder.quote_id, QuoteSupplierOrder.material_supplier_id
        ).filter(QuoteSupplierOrder.quote_id.in_(quote_ids)).all()
        for qid, sid in rows:
            ordered_map.setdefault(qid, set()).add(sid)
    for r in results:
        if is_die(r):
            r.material_status = None
        else:
            r.material_status = quote_material_status(r.parts, ordered_map.get(r.id, set()))
    return results


@router.get("/quotes/{quote_id}/material-detail", response_model=QuoteMaterialDetailOut)
def quote_material_detail(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
):
    """Dettaglio articoli con stato materiale, per la vista espandibile
    dell'archivio (spec 18, sola visualizzazione)."""
    quote = db.query(Quote).options(
        selectinload(Quote.parts).joinedload(Part.material).joinedload(Material.material_supplier),
        selectinload(Quote.parts).selectinload(Part.phases).joinedload(ManufacturingPhase.treatment),
    ).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    if not _user_sees_all(current_user) and quote.created_by_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Accesso negato")

    ordered = {
        r.material_supplier_id for r in db.query(QuoteSupplierOrder).filter(
            QuoteSupplierOrder.quote_id == quote_id
        ).all()
    }

    articles: List[ArticleMaterialRow] = []
    for p in quote.parts:
        mat = p.material
        sup = mat.material_supplier if mat else None
        treatments = [ph.treatment.name for ph in p.phases if ph.treatment_id and ph.treatment]
        articles.append(ArticleMaterialRow(
            part_id=p.id,
            part_code=p.part_code,
            revision=p.revision,
            material_name=mat.name if mat else None,
            family=mat.family if mat else None,
            dimensions=_format_dim(p),
            treatments=treatments,
            supplier_name=sup.name if sup else None,
            state=part_material_state(p, ordered),
        ))
    return QuoteMaterialDetailOut(
        quote_id=quote.id,
        material_status=quote_material_status(quote.parts, ordered),
        articles=articles,
    )
