from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload
from datetime import date, timedelta
from typing import List

from fastapi import HTTPException
from sqlalchemy.orm import joinedload

from app.core.database import get_db
from app.core.security import require_permission, get_current_user
from app.models import Quote, Part, User
from app.schemas import DashboardKPI, MonthlyData, WorkflowStats, DashboardQuoteRow
from app.api.notifications import _user_notifications


router = APIRouter(prefix="/api", tags=["dashboard"])

_can_view = require_permission('dashboard')


def calc_quote_value(quote: Quote) -> float:
    """Calculate total value of a quote by summing its parts' total_price."""
    return sum(p.total_price or 0 for p in quote.parts)


@router.get("/dashboard/kpi", response_model=DashboardKPI)
def get_kpi(db: Session = Depends(get_db), _=_can_view):
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


@router.get("/dashboard/activity")
def get_activity(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
    limit: int = 5,
):
    """Le 5 notifiche più recenti per l'utente corrente.

    Riusa la stessa logica di filtraggio di /api/notifications. Niente tabella
    'activity' separata: le attività SONO le notifiche personali.
    """
    return _user_notifications(db, current_user, limit=limit)


def _quote_to_row(q: Quote) -> DashboardQuoteRow:
    """Serializza un Quote nella shape compatta usata dalle liste in dashboard."""
    total = sum((p.total_price or 0.0) for p in q.parts) if q.parts else 0.0
    return DashboardQuoteRow(
        id=q.id,
        quote_number=q.quote_number,
        customer_name=q.customer_name,
        status=q.status,
        quote_date=q.quote_date,
        total_price=round(total, 2),
        submitted_at=q.submitted_at,
        submitted_by=q.submitted_by,
    )


@router.get("/dashboard/workflow-stats", response_model=WorkflowStats)
def get_workflow_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
):
    by_status_rows = db.query(Quote.status, func.count(Quote.id)).group_by(Quote.status).all()
    by_status = {status: cnt for status, cnt in by_status_rows}

    my_drafts = db.query(func.count(Quote.id)).filter(
        Quote.created_by_user_id == current_user.id,
        Quote.status == 'bozza',
    ).scalar() or 0

    my_pending = db.query(func.count(Quote.id)).filter(
        Quote.created_by_user_id == current_user.id,
        Quote.status == 'inviato',
    ).scalar() or 0

    has_complete = 'quotes.complete' in getattr(current_user, '_permissions', [])
    to_review = (
        db.query(func.count(Quote.id)).filter(Quote.status == 'inviato').scalar() or 0
    ) if has_complete else 0

    return WorkflowStats(
        by_status=by_status,
        my_drafts_count=my_drafts,
        my_pending_count=my_pending,
        to_review_count=to_review,
    )


@router.get("/dashboard/my-quotes", response_model=List[DashboardQuoteRow])
def get_my_quotes(
    status: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
    limit: int = 10,
):
    if status not in ('bozza', 'inviato', 'completato'):
        raise HTTPException(status_code=400, detail="Stato non valido")
    quotes = db.query(Quote).options(
        joinedload(Quote.parts),
        joinedload(Quote.submitted_by),
    ).filter(
        Quote.created_by_user_id == current_user.id,
        Quote.status == status,
    ).order_by(Quote.updated_at.desc()).limit(limit).all()
    return [_quote_to_row(q) for q in quotes]


@router.get("/dashboard/to-review", response_model=List[DashboardQuoteRow])
def get_to_review(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
    limit: int = 10,
):
    if 'quotes.complete' not in getattr(current_user, '_permissions', []):
        raise HTTPException(status_code=403, detail="Permesso negato")
    quotes = db.query(Quote).options(
        joinedload(Quote.parts),
        joinedload(Quote.submitted_by),
    ).filter(
        Quote.status == 'inviato',
    ).order_by(Quote.submitted_at.desc().nullslast()).limit(limit).all()
    return [_quote_to_row(q) for q in quotes]


@router.get("/dashboard/monthly", response_model=List[MonthlyData])
def get_monthly(db: Session = Depends(get_db), _=_can_view):
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
