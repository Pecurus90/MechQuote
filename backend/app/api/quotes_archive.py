from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload, joinedload
from sqlalchemy import func, extract, or_
from typing import List, Optional

from app.api.orders import _format_dim
from app.core.database import get_db
from app.core.security import require_permission, get_current_user
from app.models import (
    ManufacturingPhase, Material, Part, PartFile, Quote, QuoteSupplierOrder, User,
)
from app.schemas import (
    ArchiveQuoteOut, ArticleMaterialRow, QuoteMaterialDetailOut,
)
from app.services.material_status import (
    part_material_state, quote_material_status,
)
from app.services.quote_workflow import ORDERABLE_STATUSES


router = APIRouter(prefix="/api", tags=["quotes-archive"])

_can_view = require_permission('quotes.archive')


def _user_sees_all(current_user: User) -> bool:
    return 'quotes.view_all' in getattr(current_user, '_permissions', [])


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
    results = query.all()
    years = sorted([int(r[0]) for r in results if r[0]], reverse=True)
    return years or [2026]


@router.get("/quotes/archive", response_model=List[ArchiveQuoteOut])
def list_archive(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    year: Optional[int] = None,
    q: Optional[str] = None,
    quote_type: Optional[str] = None,   # 'single' | 'commessa' (None=tutti)
    phase: Optional[str] = None,        # 'active' (non completo) | 'completed' | None=tutti
    status: Optional[str] = None,       # filtro stato esatto (opzionale)
    page: int = 1,
    page_size: int = 20,
    _=_can_view,
):
    # Clamp parametri di paginazione: niente offset negativo, page_size in range sensato
    page = max(1, page)
    page_size = max(1, min(100, page_size))
    # parts.material serve per lo stato materiale derivato (spec 18).
    query = db.query(Quote).options(
        selectinload(Quote.parts).selectinload(Part.material),
        # Autore del preventivo mostrato in lista (Preventivi in corso/Archivio):
        # joinedload per evitare N+1 in serializzazione (many-to-one, 1 riga).
        joinedload(Quote.created_by),
    )
    # ACL: senza quotes.view_all l'utente vede solo i preventivi che ha creato.
    if not _user_sees_all(current_user):
        query = query.filter(Quote.created_by_user_id == current_user.id)
    if year:
        query = query.filter(extract('year', Quote.quote_date) == year)
    if quote_type:
        query = query.filter(Quote.quote_type == quote_type)
    if q:
        like = f"%{q.strip()}%"
        # TD-14: ricerca anche su descrizione/codice delle parti (match parziale).
        # `.any()` = EXISTS subquery: nessun join che duplichi le righe o rompa
        # la paginazione.
        query = query.filter(or_(
            Quote.quote_number.ilike(like),
            Quote.customer_name.ilike(like),
            Quote.parts.any(or_(
                Part.description.ilike(like),
                Part.part_code.ilike(like),
            )),
        ))
    # Spec 18: split "Preventivi in corso" (in lavorazione) vs Archivio
    # (terminali: completo o non ordinato/perso).
    if phase == 'completed':
        query = query.filter(Quote.status.in_(['completo', 'non_ordinato']))
    elif phase == 'active':
        query = query.filter(Quote.status.in_(
            ['bozza', 'in_revisione', 'inviato', 'letto', 'in_attesa_cliente', 'confermato']))
    # Filtri "sintetici" per far coincidere i KPI dashboard con la lista:
    #  - da_confermare = inviato + letto (KPI "Preventivi da confermare")
    #  - senza_prezzo  = completo senza prezzo di vendita (KPI "Senza prezzo")
    if status == 'da_confermare':
        query = query.filter(Quote.status.in_(['inviato', 'letto']))
    elif status == 'senza_prezzo':
        query = query.filter(Quote.status == 'completo', Quote.sold_price.is_(None))
    elif status:
        query = query.filter(Quote.status == status)
    query = query.order_by(Quote.quote_date.desc(), Quote.id.desc())
    offset = (page - 1) * page_size
    results = query.offset(offset).limit(page_size).all()

    # Stato materiale derivato (spec 18) per la colonna archivio. Batch dei
    # fornitori ordinati per i preventivi di questa pagina (evita N+1).
    quote_ids = [r.id for r in results]
    ordered_map: dict = {}
    if quote_ids:
        rows = db.query(
            QuoteSupplierOrder.quote_id, QuoteSupplierOrder.material_supplier_id
        ).filter(QuoteSupplierOrder.quote_id.in_(quote_ids)).all()
        for qid, sid in rows:
            ordered_map.setdefault(qid, set()).add(sid)
    # Preventivi con almeno un allegato (batch distinct: nessun N+1, non carica
    # le righe file). Alimenta l'icona "occhio" passiva nella lista.
    with_files: set = set()
    if quote_ids:
        file_rows = db.query(Part.quote_id).join(
            PartFile, PartFile.part_id == Part.id
        ).filter(Part.quote_id.in_(quote_ids)).distinct().all()
        with_files = {qid for (qid,) in file_rows}
    for r in results:
        # Solo confermato/completo è "ordinabile": altrimenti eventuali
        # ordini residui non contano come evasione (spec 18).
        ordered = ordered_map.get(r.id, set()) if r.status in ORDERABLE_STATUSES else set()
        r.material_status = quote_material_status(r.parts, ordered)
        r.has_files = r.id in with_files
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
    } if quote.status in ORDERABLE_STATUSES else set()

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
