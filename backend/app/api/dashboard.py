"""Dashboard endpoint — KPI e aggregati mensili.

Implementazione: aggregati via SQL (SUM/COUNT/GROUP BY) invece di caricare
tutti i Quote+Part+Phase in memoria. Per N preventivi × M parti × P fasi
passa da O(N×M×P) row idratate in Python a O(1) lato DB. La differenza
si sente da ~500 preventivi in poi.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import func, text
from sqlalchemy.orm import Session, joinedload
from datetime import date, timedelta
from typing import List, Optional

from fastapi import HTTPException

from app.core.database import get_db
from app.core.security import require_permission, get_current_user
from app.models import Quote, Part, User, Notification, NotificationRead
from app.schemas import DashboardKPI, MonthlyData, WorkflowStats, DashboardQuoteRow
from app.api.notifications import serialize_notification


router = APIRouter(prefix="/api", tags=["dashboard"])

_can_view = require_permission('dashboard')


@router.get("/dashboard/kpi", response_model=DashboardKPI)
def get_kpi(db: Session = Depends(get_db), _=_can_view):
    today = date.today()
    first_this = today.replace(day=1)
    first_prev = (first_this - timedelta(days=1)).replace(day=1)

    # 4 query aggregate in totale, niente caricamento di righe in memoria.
    # `parts.total_price` è già ricalcolato via `recalculate_part` ad ogni write,
    # quindi sommarlo qui è coerente con quanto mostrato nei preventivi.

    # 1. Conteggi quote (totale + mese corrente)
    quote_counts = db.execute(text(
        """
        SELECT
          COUNT(*) AS total,
          COALESCE(SUM(CASE WHEN quote_date >= :first_this THEN 1 ELSE 0 END), 0) AS this_month
        FROM quotes
        """
    ), {"first_this": first_this}).first()
    total_quotes = int(quote_counts.total or 0)
    total_quotes_this_month = int(quote_counts.this_month or 0)

    # 2. Somme valore preventivato per finestra temporale (totale, mese corrente, mese precedente)
    value_sums = db.execute(text(
        """
        SELECT
          COALESCE(SUM(p.total_price), 0) AS total,
          COALESCE(SUM(CASE WHEN q.quote_date >= :first_this THEN p.total_price ELSE 0 END), 0) AS this_month,
          COALESCE(SUM(CASE WHEN q.quote_date >= :first_prev AND q.quote_date < :first_this THEN p.total_price ELSE 0 END), 0) AS prev_month
        FROM parts p
        JOIN quotes q ON q.id = p.quote_id
        """
    ), {"first_this": first_this, "first_prev": first_prev}).first()
    total_quoted_value = float(value_sums.total or 0.0)
    quoted_value_this_month = float(value_sums.this_month or 0.0)
    quoted_value_prev_month = float(value_sums.prev_month or 0.0)

    percentage_diff = 0.0
    if quoted_value_prev_month > 0:
        percentage_diff = ((quoted_value_this_month - quoted_value_prev_month) / quoted_value_prev_month) * 100
    avg_quote_value = total_quoted_value / total_quotes if total_quotes > 0 else 0.0

    # 3. Conteggio totale parti (codici)
    total_part_codes = db.execute(text("SELECT COUNT(*) AS n FROM parts")).scalar() or 0

    # 4. Split CNC/EDM per quote_mode (somma parti.total_price condizionale).
    # Esclude i preventivi tipo 'die' (le piastre stampo non sono CNC/EDM
    # nel senso lavorazione-cliente, sono materiale interno dello stampo).
    mode_split = db.execute(text(
        """
        SELECT
          COALESCE(SUM(CASE WHEN p.quote_mode IN ('manual','step','mixed') THEN p.total_price ELSE 0 END), 0) AS cnc,
          COALESCE(SUM(CASE WHEN p.quote_mode IN ('dxf','mixed') THEN p.total_price ELSE 0 END), 0) AS edm
        FROM parts p
        JOIN quotes q ON q.id = p.quote_id
        WHERE q.quote_type != 'die' OR q.quote_type IS NULL
        """
    )).first()
    cnc_value = float(mode_split.cnc or 0.0)
    edm_value = float(mode_split.edm or 0.0)

    # 5. Modulo Stampi: valore preventivato per quote_type='die'. Il prezzo
    # finale è cost_industrial × (1 + margin%) × (1 - discount%); somma su
    # tutti i preventivi stampo (non solo i 'completato', allineato al resto
    # del KPI che include anche bozze e inviati).
    dies_value = db.execute(text(
        """
        SELECT COALESCE(SUM(
          ds.cost_industrial
          * (1 + COALESCE(q.global_margin_percent, 0) / 100.0)
          * (1 - COALESCE(q.global_discount_percent, 0) / 100.0)
        ), 0) AS v
        FROM die_specs ds
        JOIN quotes q ON q.id = ds.quote_id
        WHERE q.quote_type = 'die'
        """
    )).scalar() or 0.0
    dies_quoted_value = float(dies_value)

    # 6. Margine medio % sui preventivi standard (non die — i die hanno
    # un margine "globale" sull'industriale e non per parte, calcolo a parte).
    # Formula: ((Σ unit_price × qty) - (Σ total_cost × qty)) / (Σ total_cost × qty) × 100
    # Se total_cost=0 → 0% (parte senza costo, non significativa per la media).
    margin_row = db.execute(text(
        """
        SELECT
          COALESCE(SUM(p.unit_price * p.quantity), 0) AS revenue,
          COALESCE(SUM(p.total_cost * p.quantity), 0) AS cost
        FROM parts p
        JOIN quotes q ON q.id = p.quote_id
        WHERE (q.quote_type != 'die' OR q.quote_type IS NULL)
          AND p.total_cost > 0
        """
    )).first()
    revenue = float(margin_row.revenue or 0.0)
    cost = float(margin_row.cost or 0.0)
    avg_margin_percent = ((revenue - cost) / cost * 100.0) if cost > 0 else 0.0

    return DashboardKPI(
        total_quotes=total_quotes,
        total_quotes_this_month=total_quotes_this_month,
        total_quoted_value=round(total_quoted_value, 2),
        quoted_value_this_month=round(quoted_value_this_month, 2),
        quoted_value_prev_month=round(quoted_value_prev_month, 2),
        percentage_diff=round(percentage_diff, 2),
        avg_quote_value=round(avg_quote_value, 2),
        total_part_codes=int(total_part_codes),
        cnc_quoted_value=round(cnc_value, 2),
        edm_quoted_value=round(edm_value, 2),
        dies_quoted_value=round(dies_quoted_value, 2),
        avg_margin_percent=round(avg_margin_percent, 2),
    )


@router.get("/dashboard/activity")
def get_activity(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
    limit: int = 5,
):
    """Feed globale: ultime N notifiche del sistema in ordine cronologico desc.

    Diverso da /api/notifications (inbox personale): qui niente filtro per
    destinatario né esclusione delle dismissed. Lo stato di lettura mostrato
    (read_at/confirmed_at) è quello dell'utente corrente per coerenza visiva.
    """
    notifications = (
        db.query(Notification)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )
    if not notifications:
        return []
    reads = {
        r.notification_id: r
        for r in db.query(NotificationRead)
        .filter(NotificationRead.user_id == current_user.id)
        .filter(NotificationRead.notification_id.in_([n.id for n in notifications]))
        .all()
    }
    return [serialize_notification(n, reads.get(n.id)) for n in notifications]


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


@router.get("/dashboard/alerts")
def get_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
):
    """Conteggi per il pannello Alert della dashboard. Niente row di dettaglio
    qui: solo i counts, le pagine target hanno già le loro liste complete.

    Ritorna:
    - low_stock_tools: utensili con quantity < minimum
    - stale_submitted: preventivi inviati > 7gg senza completamento
    - to_order_materials: preventivi completati senza ordine materiale
    """
    from datetime import datetime, timezone
    from app.models import Tool

    # 1. Utensili sotto scorta
    low_stock = db.execute(text(
        "SELECT COUNT(*) FROM tools WHERE quantity < minimum_quantity AND minimum_quantity > 0"
    )).scalar() or 0

    # 2. Preventivi inviati > 7 giorni
    threshold = datetime.now(timezone.utc) - timedelta(days=7)
    stale_submitted = db.execute(text(
        "SELECT COUNT(*) FROM quotes WHERE status = 'inviato' AND submitted_at < :t"
    ), {"t": threshold}).scalar() or 0

    # 3. Completati senza ordine materiale
    to_order = db.execute(text(
        "SELECT COUNT(*) FROM quotes WHERE status = 'completato' AND material_ordered_at IS NULL"
    )).scalar() or 0

    return {
        "low_stock_tools": int(low_stock),
        "stale_submitted": int(stale_submitted),
        "to_order_materials": int(to_order),
    }


@router.get("/dashboard/my-quotes", response_model=List[DashboardQuoteRow])
def get_my_quotes(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
    limit: int = 10,
):
    """Lista preventivi del utente corrente. status opzionale: se None ritorna
    tutti gli stati (bozza/inviato/completato).
    """
    if status is not None and status not in ('bozza', 'inviato', 'completato'):
        raise HTTPException(status_code=400, detail="Stato non valido")
    q = db.query(Quote).options(
        joinedload(Quote.parts),
        joinedload(Quote.submitted_by),
    ).filter(Quote.created_by_user_id == current_user.id)
    if status is not None:
        q = q.filter(Quote.status == status)
    quotes = q.order_by(Quote.updated_at.desc()).limit(limit).all()
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
    """Aggregati mensili — value, margin, material, labor.

    2 query aggregate. La prima copre value/cost/material via JOIN su
    materials/material_suppliers per il cutting_cost_per_part. La seconda
    somma il calculated_cost delle fasi non-treatment. Le coppie (anno,mese)
    sono unite in Python.
    """
    materials_rows = db.execute(text(
        """
        SELECT
          CAST(strftime('%Y', q.quote_date) AS INTEGER) AS y,
          CAST(strftime('%m', q.quote_date) AS INTEGER) AS m,
          COALESCE(SUM(p.total_price), 0)                                  AS value,
          COALESCE(SUM(COALESCE(p.total_cost, 0) * p.quantity), 0)         AS cost_total,
          COALESCE(SUM(
            COALESCE(p.material_cost, 0) * p.quantity
            + COALESCE(p.material_delivery_cost, 0)
            + COALESCE(ms.cutting_cost_per_part, 0) * p.quantity
          ), 0) AS material
        FROM quotes q
        JOIN parts p ON p.quote_id = q.id
        LEFT JOIN materials mat ON mat.id = p.material_id
        LEFT JOIN material_suppliers ms ON ms.id = mat.supplier_id
        WHERE q.quote_date IS NOT NULL
        GROUP BY y, m
        ORDER BY y, m
        """
    )).fetchall()

    labor_rows = db.execute(text(
        """
        SELECT
          CAST(strftime('%Y', q.quote_date) AS INTEGER) AS y,
          CAST(strftime('%m', q.quote_date) AS INTEGER) AS m,
          COALESCE(SUM(COALESCE(ph.calculated_cost, 0) * p.quantity), 0) AS labor
        FROM quotes q
        JOIN parts p ON p.quote_id = q.id
        JOIN manufacturing_phases ph ON ph.part_id = p.id
        WHERE q.quote_date IS NOT NULL AND ph.treatment_id IS NULL
        GROUP BY y, m
        """
    )).fetchall()

    labor_by_key = {(int(r.y), int(r.m)): float(r.labor or 0.0) for r in labor_rows}

    out: List[MonthlyData] = []
    for r in materials_rows:
        y, m = int(r.y), int(r.m)
        value = float(r.value or 0.0)
        cost_total = float(r.cost_total or 0.0)
        material = float(r.material or 0.0)
        labor = labor_by_key.get((y, m), 0.0)
        out.append(MonthlyData(
            month=f"{y}-{m:02d}",
            year=y,
            value=round(value, 2),
            margin=round(value - cost_total, 2),
            material=round(material, 2),
            labor=round(labor, 2),
        ))
    return out
