from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func, extract, or_
from typing import List, Optional

from app.core.database import get_db
from app.models import Quote
from app.schemas import QuoteOut


router = APIRouter(prefix="/api", tags=["quotes-archive"])


@router.get("/quotes/years")
def get_quote_years(db: Session = Depends(get_db)):
    results = db.query(func.strftime("%Y", Quote.quote_date)).distinct().all()
    years = sorted([int(r[0]) for r in results if r[0]], reverse=True)
    return years or [2026]


@router.get("/quotes/archive", response_model=List[QuoteOut])
def list_archive(
    db: Session = Depends(get_db),
    year: Optional[int] = None,
    q: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
):
    # Clamp parametri di paginazione: niente offset negativo, page_size in range sensato
    page = max(1, page)
    page_size = max(1, min(100, page_size))
    query = db.query(Quote).options(selectinload(Quote.parts))
    if year:
        query = query.filter(extract('year', Quote.quote_date) == year)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(
            Quote.quote_number.ilike(like),
            Quote.customer_name.ilike(like),
        ))
    query = query.order_by(Quote.quote_date.desc(), Quote.id.desc())
    offset = (page - 1) * page_size
    return query.offset(offset).limit(page_size).all()
