from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload
from datetime import date, timedelta
from typing import List

from app.core.database import get_db
from app.models import Quote, Part
from app.schemas import DashboardKPI, MonthlyData


router = APIRouter(prefix="/api", tags=["dashboard"])


def calc_quote_value(quote: Quote) -> float:
    """Calculate total value of a quote by summing its parts' total_price."""
    return sum(p.total_price or 0 for p in quote.parts)


@router.get("/dashboard/kpi", response_model=DashboardKPI)
def get_kpi(db: Session = Depends(get_db)):
    today = date.today()
    first_this = today.replace(day=1)
    first_prev = (first_this - timedelta(days=1)).replace(day=1)

    all_quotes = db.query(Quote).options(selectinload(Quote.parts)).all()
    total_quotes = len(all_quotes)
    total_quoted_value = sum(calc_quote_value(q) for q in all_quotes)

    quotes_this_month = [q for q in all_quotes if q.quote_date and q.quote_date >= first_this]
    quoted_value_this_month = sum(calc_quote_value(q) for q in quotes_this_month)

    quotes_prev_month = [q for q in all_quotes if q.quote_date and first_prev <= q.quote_date < first_this]
    quoted_value_prev_month = sum(calc_quote_value(q) for q in quotes_prev_month)

    percentage_diff = 0.0
    if quoted_value_prev_month > 0:
        percentage_diff = ((quoted_value_this_month - quoted_value_prev_month) / quoted_value_prev_month) * 100

    avg_quote_value = total_quoted_value / total_quotes if total_quotes > 0 else 0.0

    total_part_codes = db.query(func.count(Part.id)).scalar() or 0

    cnc_value = db.query(func.coalesce(func.sum(Part.total_price), 0.0)).filter(
        Part.quote_mode.in_(["manual", "step", "mixed"])
    ).scalar() or 0.0

    edm_value = db.query(func.coalesce(func.sum(Part.total_price), 0.0)).filter(
        Part.quote_mode.in_(["dxf", "mixed"])
    ).scalar() or 0.0

    return DashboardKPI(
        total_quotes=total_quotes,
        total_quotes_this_month=len(quotes_this_month),
        total_quoted_value=round(total_quoted_value, 2),
        quoted_value_this_month=round(quoted_value_this_month, 2),
        quoted_value_prev_month=round(quoted_value_prev_month, 2),
        percentage_diff=round(percentage_diff, 2),
        avg_quote_value=round(avg_quote_value, 2),
        total_part_codes=total_part_codes,
        cnc_quoted_value=round(cnc_value, 2),
        edm_quoted_value=round(edm_value, 2),
    )


@router.get("/dashboard/monthly", response_model=List[MonthlyData])
def get_monthly(db: Session = Depends(get_db)):
    quotes = db.query(Quote).options(selectinload(Quote.parts)).all()
    data = {}
    for q in quotes:
        if q.quote_date:
            key = (q.quote_date.year, q.quote_date.month)
            data[key] = data.get(key, 0.0) + calc_quote_value(q)
    return [
        MonthlyData(month=f"{y}-{m:02d}", value=round(v, 2), year=y)
        for (y, m), v in sorted(data.items())
    ]
