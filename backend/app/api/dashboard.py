from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import date, datetime, timedelta
from typing import List

from app.core.database import get_db
from app.models import Quote, Part, ManufacturingPhase
from app.schemas import DashboardKPI, MonthlyData

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard/kpi", response_model=DashboardKPI)
def get_kpi(db: Session = Depends(get_db)):
    today = date.today()
    first_this = today.replace(day=1)
    first_prev = (first_this - timedelta(days=1)).replace(day=1)

    all_quotes = db.query(Quote).all()
    total_quotes = len(all_quotes)
    total_quoted_value = sum(q.total_price for q in all_quotes if q.total_price)

    quotes_this_month = [q for q in all_quotes if q.date and q.date >= first_this]
    quoted_value_this_month = sum(q.total_price for q in quotes_this_month if q.total_price)

    quotes_prev_month = [q for q in all_quotes if q.date and first_prev <= q.date < first_this]
    quoted_value_prev_month = sum(q.total_price for q in quotes_prev_month if q.total_price)

    percentage_diff = 0.0
    if quoted_value_prev_month > 0:
        percentage_diff = ((quoted_value_this_month - quoted_value_prev_month) / quoted_value_prev_month) * 100

    avg_quote_value = total_quoted_value / total_quotes if total_quotes > 0 else 0.0

    all_parts = db.query(Part).all()
    total_part_codes = len(all_parts)

    cnc_value = sum(
        p.total_price for p in all_parts
        if p.quote_mode in ("manual", "step", "mixed") and p.total_price
    )
    edm_value = sum(
        p.total_price for p in all_parts
        if p.quote_mode in ("dxf", "mixed") and p.total_price
    )

    return DashboardKPI(
        total_quotes=total_quotes,
        total_quotes_this_month=len(quotes_this_month),
        total_quoted_value=total_quoted_value,
        quoted_value_this_month=quoted_value_this_month,
        quoted_value_prev_month=quoted_value_prev_month,
        percentage_diff=round(percentage_diff, 2),
        avg_quote_value=round(avg_quote_value, 2),
        total_part_codes=total_part_codes,
        cnc_quoted_value=cnc_value,
        edm_quoted_value=edm_value,
    )


@router.get("/dashboard/monthly", response_model=List[MonthlyData])
def get_monthly(db: Session = Depends(get_db)):
    quotes = db.query(Quote).all()
    data = {}
    for q in quotes:
        if q.date and q.total_price:
            key = (q.date.year, q.date.month)
            data[key] = data.get(key, 0.0) + q.total_price
    return [
        MonthlyData(month=f"{y}-{m:02d}", value=v, year=y)
        for (y, m), v in sorted(data.items())
    ]
