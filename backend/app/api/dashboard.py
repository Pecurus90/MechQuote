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
from app.schemas import (
    DashboardKPI, MonthlyData, WorkflowStats, DashboardQuoteRow,
    StatisticsOut, StatsTrendPoint, StatsCustomerRow, StatsCategoryRow, StatsMarginPoint,
    MaterialsStatsOut, ToolsStatsOut, StatsCountPoint, StatsSupplierRow,
    StatsLeadTimePoint, StatsToolRow,
)
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


def _period_range(period: str):
    """Restituisce (date_from, date_to) per i preset di periodo della pagina
    /statistics. None = nessun filtro su quel bound."""
    today = date.today()
    if period == 'year':
        return (date(today.year, 1, 1), today)
    if period == '12m':
        return (today - timedelta(days=365), today)
    if period == 'prev_year':
        prev = today.year - 1
        return (date(prev, 1, 1), date(prev, 12, 31))
    # 'all' o sconosciuto
    return (None, None)


@router.get("/dashboard/statistics", response_model=StatisticsOut)
def get_statistics(
    period: str = 'year',
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
):
    """Dataset aggregato per la pagina /statistics. 4 dataset in 1 risposta.
    Param `period`: year (default) | 12m | prev_year | all.
    """
    date_from, date_to = _period_range(period)
    where_parts = []
    params: dict = {}
    if date_from is not None:
        where_parts.append("q.quote_date >= :date_from")
        params['date_from'] = date_from
    if date_to is not None:
        where_parts.append("q.quote_date <= :date_to")
        params['date_to'] = date_to
    date_filter = (' AND ' + ' AND '.join(where_parts)) if where_parts else ''

    # ─── 1. Trend mensile per tipo (standard vs dies) ──────────────────
    # Standard: somma parts.total_price (escluso die).
    rows_std = db.execute(text(
        f"""
        SELECT strftime('%Y-%m', q.quote_date) AS m, COALESCE(SUM(p.total_price), 0) AS v
        FROM parts p
        JOIN quotes q ON q.id = p.quote_id
        WHERE (q.quote_type != 'die' OR q.quote_type IS NULL)
          {date_filter}
        GROUP BY m ORDER BY m
        """
    ), params).all()
    # Stampi: cost_industrial × margin × discount.
    rows_die = db.execute(text(
        f"""
        SELECT strftime('%Y-%m', q.quote_date) AS m, COALESCE(SUM(
          ds.cost_industrial
          * (1 + COALESCE(q.global_margin_percent, 0) / 100.0)
          * (1 - COALESCE(q.global_discount_percent, 0) / 100.0)
        ), 0) AS v
        FROM die_specs ds
        JOIN quotes q ON q.id = ds.quote_id
        WHERE q.quote_type = 'die'
          {date_filter}
        GROUP BY m ORDER BY m
        """
    ), params).all()
    months = sorted({r.m for r in rows_std} | {r.m for r in rows_die})
    std_map = {r.m: float(r.v or 0) for r in rows_std}
    die_map = {r.m: float(r.v or 0) for r in rows_die}
    trend = [StatsTrendPoint(month=m, standard=std_map.get(m, 0.0), dies=die_map.get(m, 0.0))
             for m in months]

    # ─── 2. Top 10 clienti (combinato standard + stampi) ──────────────
    rows_cust = db.execute(text(
        f"""
        SELECT q.customer_id, q.customer_name,
          COALESCE(
            CASE WHEN q.quote_type = 'die'
                 THEN ds.cost_industrial
                      * (1 + COALESCE(q.global_margin_percent, 0) / 100.0)
                      * (1 - COALESCE(q.global_discount_percent, 0) / 100.0)
                 ELSE (SELECT COALESCE(SUM(p.total_price), 0) FROM parts p WHERE p.quote_id = q.id)
            END, 0
          ) AS total
        FROM quotes q
        LEFT JOIN die_specs ds ON ds.quote_id = q.id
        WHERE q.customer_name IS NOT NULL AND q.customer_name != ''
          {date_filter}
        """
    ), params).all()
    cust_agg: dict[tuple, float] = {}
    for r in rows_cust:
        key = (r.customer_id, r.customer_name)
        cust_agg[key] = cust_agg.get(key, 0.0) + float(r.total or 0)
    top_customers = [
        StatsCustomerRow(customer_id=cid, customer_name=name, total=round(v, 2))
        for (cid, name), v in sorted(cust_agg.items(), key=lambda x: x[1], reverse=True)[:10]
    ]

    # ─── 3. Distribuzione per categoria (lettera nel quote_number) ────
    # quote_number formato: CCC-YYL_PPP → lettera in posizione 8 (1-based)
    rows_cat = db.execute(text(
        f"""
        SELECT
          SUBSTR(q.quote_number, 8, 1) AS cat,
          COUNT(*) AS cnt,
          COALESCE(SUM(
            COALESCE(
              CASE WHEN q.quote_type = 'die'
                   THEN ds.cost_industrial
                        * (1 + COALESCE(q.global_margin_percent, 0) / 100.0)
                        * (1 - COALESCE(q.global_discount_percent, 0) / 100.0)
                   ELSE (SELECT COALESCE(SUM(p.total_price), 0) FROM parts p WHERE p.quote_id = q.id)
              END, 0
            )
          ), 0) AS total
        FROM quotes q
        LEFT JOIN die_specs ds ON ds.quote_id = q.id
        WHERE q.quote_number IS NOT NULL
          {date_filter}
        GROUP BY cat ORDER BY total DESC
        """
    ), params).all()
    by_category = [
        StatsCategoryRow(category_code=(r.cat or '?'), count=int(r.cnt), total=round(float(r.total or 0), 2))
        for r in rows_cat
        if r.cat and r.cat.strip()  # esclude righe con quote_number malformato
    ]

    # ─── 4. Margine medio mensile (solo standard) ─────────────────────
    # Margine medio = (Σ revenue - Σ cost) / Σ cost × 100 per ogni mese.
    rows_margin = db.execute(text(
        f"""
        SELECT strftime('%Y-%m', q.quote_date) AS m,
          COALESCE(SUM(p.unit_price * p.quantity), 0) AS revenue,
          COALESCE(SUM(p.total_cost * p.quantity), 0) AS cost
        FROM parts p
        JOIN quotes q ON q.id = p.quote_id
        WHERE (q.quote_type != 'die' OR q.quote_type IS NULL)
          AND p.total_cost > 0
          {date_filter}
        GROUP BY m ORDER BY m
        """
    ), params).all()
    margin_monthly = []
    for r in rows_margin:
        cost = float(r.cost or 0)
        rev = float(r.revenue or 0)
        m_pct = ((rev - cost) / cost * 100.0) if cost > 0 else 0.0
        margin_monthly.append(StatsMarginPoint(month=r.m, margin_percent=round(m_pct, 2)))

    return StatisticsOut(
        period=period,
        trend_monthly=trend,
        top_customers=top_customers,
        by_category=by_category,
        margin_monthly=margin_monthly,
    )


@router.get("/dashboard/statistics/orders-materials", response_model=MaterialsStatsOut)
def get_materials_stats(
    period: str = 'year',
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
):
    """3 dataset per il tab Materiali della pagina /statistics."""
    date_from, date_to = _period_range(period)
    where_mo = []
    params: dict = {}
    if date_from is not None:
        where_mo.append("mo.created_at >= :date_from")
        params['date_from'] = date_from
    if date_to is not None:
        # +1 giorno per includere il bound finale (timestamp).
        where_mo.append("mo.created_at < date(:date_to, '+1 day')")
        params['date_to'] = date_to
    mo_filter = (' WHERE ' + ' AND '.join(where_mo)) if where_mo else ''

    # 1. Trend ordini per mese
    rows_trend = db.execute(text(
        f"""
        SELECT strftime('%Y-%m', mo.created_at) AS m, COUNT(*) AS n
        FROM material_orders mo
        {mo_filter}
        GROUP BY m ORDER BY m
        """
    ), params).all()
    trend = [StatsCountPoint(month=r.m, count=int(r.n)) for r in rows_trend]

    # 2. Top fornitori materiali: passa per MaterialOrderQuote → Quote → Parts → Material → supplier.
    # Conta n. preventivi distinti (NON parts: l'ordine è "verso il fornitore X
    # con N preventivi"). Aggregazione via supplier_id.
    rows_sup = db.execute(text(
        f"""
        SELECT ms.name AS name, COUNT(DISTINCT moq.quote_id) AS n
        FROM material_orders mo
        JOIN material_order_quotes moq ON moq.material_order_id = mo.id
        JOIN parts p ON p.quote_id = moq.quote_id
        JOIN materials mat ON mat.id = p.material_id
        JOIN material_suppliers ms ON ms.id = mat.supplier_id
        {mo_filter}
        GROUP BY ms.id, ms.name
        ORDER BY n DESC
        LIMIT 10
        """
    ), params).all()
    top_suppliers = [StatsSupplierRow(supplier_name=r.name, count=int(r.n)) for r in rows_sup]

    # 3. Lead time medio "completato → ordine materiale" (giorni).
    # Solo quote con entrambe le date popolate. julianday() è SQLite-specifico.
    where_q = []
    q_params: dict = {}
    if date_from is not None:
        where_q.append("q.material_ordered_at >= :date_from")
        q_params['date_from'] = date_from
    if date_to is not None:
        where_q.append("q.material_ordered_at < date(:date_to, '+1 day')")
        q_params['date_to'] = date_to
    q_filter = (' AND ' + ' AND '.join(where_q)) if where_q else ''
    lt_row = db.execute(text(
        f"""
        SELECT AVG(julianday(q.material_ordered_at) - julianday(q.completed_at)) AS avg_d
        FROM quotes q
        WHERE q.completed_at IS NOT NULL
          AND q.material_ordered_at IS NOT NULL
          {q_filter}
        """
    ), q_params).scalar()
    lead_time_avg = float(lt_row) if lt_row is not None else 0.0

    rows_lt = db.execute(text(
        f"""
        SELECT strftime('%Y-%m', q.material_ordered_at) AS m,
               AVG(julianday(q.material_ordered_at) - julianday(q.completed_at)) AS avg_d
        FROM quotes q
        WHERE q.completed_at IS NOT NULL
          AND q.material_ordered_at IS NOT NULL
          {q_filter}
        GROUP BY m ORDER BY m
        """
    ), q_params).all()
    lead_time_monthly = [
        StatsLeadTimePoint(month=r.m, avg_days=round(float(r.avg_d or 0), 2))
        for r in rows_lt
    ]

    return MaterialsStatsOut(
        period=period,
        trend_monthly=trend,
        top_suppliers=top_suppliers,
        lead_time_avg_days=round(lead_time_avg, 2),
        lead_time_monthly=lead_time_monthly,
    )


@router.get("/dashboard/statistics/tools", response_model=ToolsStatsOut)
def get_tools_stats(
    period: str = 'year',
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
):
    """3 dataset per il tab Utensili della pagina /statistics."""
    date_from, date_to = _period_range(period)
    where = []
    params: dict = {}
    if date_from is not None:
        where.append("toord.created_at >= :date_from")
        params['date_from'] = date_from
    if date_to is not None:
        where.append("toord.created_at < date(:date_to, '+1 day')")
        params['date_to'] = date_to
    flt = (' WHERE ' + ' AND '.join(where)) if where else ''

    # 1. Trend ordini per mese
    rows_trend = db.execute(text(
        f"""
        SELECT strftime('%Y-%m', toord.created_at) AS m, COUNT(*) AS n
        FROM tool_orders toord
        {flt}
        GROUP BY m ORDER BY m
        """
    ), params).all()
    trend = [StatsCountPoint(month=r.m, count=int(r.n)) for r in rows_trend]

    # 2. Top fornitori utensili: aggregazione su supplier_name_snapshot
    # (string, non FK — lo snapshot conserva il nome esatto al momento ordine).
    # Usiamo le stesse condizioni di flt ma con `AND` join semplice.
    where_sup = ["toi.supplier_name_snapshot IS NOT NULL", "toi.supplier_name_snapshot != ''"]
    if date_from is not None:
        where_sup.append("toord.created_at >= :date_from")
    if date_to is not None:
        where_sup.append("toord.created_at < date(:date_to, '+1 day')")
    sup_filter = ' WHERE ' + ' AND '.join(where_sup)
    rows_sup = db.execute(text(
        f"""
        SELECT toi.supplier_name_snapshot AS name, COUNT(*) AS n
        FROM tool_order_items toi
        JOIN tool_orders toord ON toord.id = toi.tool_order_id
        {sup_filter}
        GROUP BY toi.supplier_name_snapshot
        ORDER BY n DESC
        LIMIT 10
        """
    ), params).all()
    top_suppliers = [StatsSupplierRow(supplier_name=r.name, count=int(r.n)) for r in rows_sup]

    # 3. Top utensili: code_snapshot + somma quantity_at_time
    rows_tools = db.execute(text(
        f"""
        SELECT toi.code_snapshot AS code, SUM(toi.quantity_at_time) AS qty
        FROM tool_order_items toi
        JOIN tool_orders toord ON toord.id = toi.tool_order_id
        {flt}
        GROUP BY toi.code_snapshot
        ORDER BY qty DESC
        LIMIT 10
        """
    ), params).all()
    top_tools = [StatsToolRow(code=r.code, total_quantity=int(r.qty or 0)) for r in rows_tools]

    return ToolsStatsOut(
        period=period,
        trend_monthly=trend,
        top_suppliers=top_suppliers,
        top_tools=top_tools,
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
