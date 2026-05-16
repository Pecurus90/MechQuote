from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload, joinedload
from sqlalchemy import func, extract, or_
from typing import List, Optional

from app.core.database import get_db
from app.core.security import require_permission, get_current_user
from app.models import Quote, User
from app.schemas import QuoteOut


router = APIRouter(prefix="/api", tags=["quotes-archive"])

# Archivio: il permesso `quotes.archive` copre i preventivi standard; chi ha
# solo `dies.archive` può accedere alla lista filtrata su quote_type='die'.
# Il filtro applicativo è fatto comunque in list_archive.
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


@router.get("/quotes/archive", response_model=List[QuoteOut])
def list_archive(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    year: Optional[int] = None,
    q: Optional[str] = None,
    quote_type: Optional[str] = None,   # 'single' | 'commessa' | 'die' (None=tutti)
    page: int = 1,
    page_size: int = 20,
    _=_can_view,
):
    # Clamp parametri di paginazione: niente offset negativo, page_size in range sensato
    page = max(1, page)
    page_size = max(1, min(100, page_size))
    # joinedload(die_spec) per dare al frontend cost_industrial/margin/discount
    # senza una seconda chiamata per ogni riga.
    query = db.query(Quote).options(
        selectinload(Quote.parts),
        joinedload(Quote.die_spec),
    )
    # ACL: senza quotes.view_all l'utente vede solo i preventivi che ha creato.
    if not _user_sees_all(current_user):
        query = query.filter(Quote.created_by_user_id == current_user.id)
    if year:
        query = query.filter(extract('year', Quote.quote_date) == year)
    if quote_type:
        # Modulo Stampi: tab dedicato all'archivio mostra solo quote_type='die'.
        query = query.filter(Quote.quote_type == quote_type)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(
            Quote.quote_number.ilike(like),
            Quote.customer_name.ilike(like),
        ))
    query = query.order_by(Quote.quote_date.desc(), Quote.id.desc())
    offset = (page - 1) * page_size
    return query.offset(offset).limit(page_size).all()
