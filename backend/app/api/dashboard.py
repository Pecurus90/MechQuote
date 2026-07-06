"""Dashboard endpoint — KPI e aggregati mensili.

Implementazione: aggregati via SQL (SUM/COUNT/GROUP BY) invece di caricare
tutti i Quote+Part+Phase in memoria. Per N preventivi × M parti × P fasi
passa da O(N×M×P) row idratate in Python a O(1) lato DB. La differenza
si sente da ~500 preventivi in poi.
"""
from collections import defaultdict
from fastapi import APIRouter, Depends
from sqlalchemy import func, text
from sqlalchemy.orm import Session, joinedload
from datetime import date, timedelta
from typing import List, Optional

from fastapi import HTTPException

from app.core.database import get_db
from app.core.security import require_permission, get_current_user
from app.models import (
    Quote, Part, Material, QuoteSupplierOrder, User, Notification, NotificationRead,
)
from app.schemas import (
    DashboardKPI, MonthlyData, WorkflowStats, DashboardQuoteRow,
    StatisticsOut, StatsTrendPoint, StatsCustomerRow, StatsCategoryRow, StatsMarginPoint,
    StatsHoursRow, MaterialsStatsOut, ToolsStatsOut, StatsCountPoint, StatsSupplierRow,
    StatsLeadTimePoint, StatsToolRow, StatsToolTypeRow,
    StatsMaterialSupplierRow, StatsMaterialRow, StatsToolBrandRow,
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
        quote_type=q.quote_type,
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

    # Split standard vs stampi (die) per il sottotitolo "Standard N · Stampi N".
    total_all = sum(by_status.values())
    die_count = db.query(func.count(Quote.id)).filter(Quote.quote_type == 'die').scalar() or 0
    standard_count = total_all - die_count

    my_drafts = db.query(func.count(Quote.id)).filter(
        Quote.created_by_user_id == current_user.id,
        Quote.status == 'bozza',
    ).scalar() or 0

    my_pending = db.query(func.count(Quote.id)).filter(
        Quote.created_by_user_id == current_user.id,
        Quote.status == 'inviato',
    ).scalar() or 0

    has_confirm = 'quotes.confirm' in getattr(current_user, '_permissions', [])
    to_review = (
        db.query(func.count(Quote.id)).filter(Quote.status.in_(['inviato', 'letto'])).scalar() or 0
    ) if has_confirm else 0

    # Offerte in attesa di risposta del cliente (spec 18): promemoria per chi
    # gestisce gli esiti (amministrazione).
    awaiting_client = (
        db.query(func.count(Quote.id)).filter(Quote.status == 'in_attesa_cliente').scalar() or 0
    ) if has_confirm else 0

    # Ordini completi senza prezzo di vendita: buchi nei dati statistici
    # (marginalità reale). Solo status='completo' con sold_price non compilato.
    missing_price = (
        db.query(func.count(Quote.id)).filter(
            Quote.status == 'completo', Quote.sold_price.is_(None)
        ).scalar() or 0
    ) if has_confirm else 0

    return WorkflowStats(
        by_status=by_status,
        my_drafts_count=my_drafts,
        my_pending_count=my_pending,
        to_review_count=to_review,
        awaiting_client_count=awaiting_client,
        completed_missing_price_count=missing_price,
        standard_count=standard_count,
        die_count=die_count,
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
    quote_type: Optional[str] = None,   # 'standard' | 'die' | None=tutti
    customer_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
):
    """Dataset aggregato per la pagina /statistics (tab Preventivi).
    Param `period`: year (default) | 12m | prev_year | all.
    Filtri opzionali: `quote_type` (standard|die), `customer_id`.
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
    if customer_id is not None:
        where_parts.append("q.customer_id = :customer_id")
        params['customer_id'] = customer_id
    if quote_type == 'die':
        where_parts.append("q.quote_type = 'die'")
    elif quote_type == 'standard':
        where_parts.append("(q.quote_type != 'die' OR q.quote_type IS NULL)")
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

    # ─── 5. Conteggi (KPI) ────────────────────────────────────────────
    cnt_row = db.execute(text(
        f"""
        SELECT
          SUM(CASE WHEN q.quote_type = 'die' THEN 1 ELSE 0 END) AS dies,
          SUM(CASE WHEN q.quote_type != 'die' OR q.quote_type IS NULL THEN 1 ELSE 0 END) AS standard
        FROM quotes q
        WHERE 1=1 {date_filter}
        """
    ), params).first()
    dies_count = int(cnt_row.dies or 0) if cnt_row else 0
    standard_count = int(cnt_row.standard or 0) if cnt_row else 0

    # ─── 6. Distribuzione ore (solo standard: gli stampi non hanno fasi) ──
    # Ore fase = setup + ciclo×qty. Raggruppate per macchina e per lavorazione.
    def _hours_by(join_sql: str, label_expr: str) -> List[StatsHoursRow]:
        rows = db.execute(text(
            f"""
            SELECT {label_expr} AS label,
              COALESCE(SUM(ph.setup_hours + ph.cycle_hours_per_part * COALESCE(p.quantity, 1)), 0) AS h
            FROM manufacturing_phases ph
            JOIN parts p ON p.id = ph.part_id
            JOIN quotes q ON q.id = p.quote_id
            {join_sql}
            WHERE (q.quote_type != 'die' OR q.quote_type IS NULL) {date_filter}
            GROUP BY label
            HAVING h > 0
            ORDER BY h DESC
            LIMIT 20
            """
        ), params).all()
        return [StatsHoursRow(label=r.label or '—', hours=round(float(r.h or 0), 2)) for r in rows]

    hours_by_machine = _hours_by(
        "LEFT JOIN machines m ON m.id = ph.machine_id",
        "COALESCE(m.name, 'Senza macchina')",
    )
    hours_by_operation = _hours_by(
        "LEFT JOIN operations o ON o.id = ph.operation_id",
        "COALESCE(o.name, 'Senza lavorazione')",
    )

    return StatisticsOut(
        period=period,
        standard_count=standard_count,
        dies_count=dies_count,
        trend_monthly=trend,
        top_customers=top_customers,
        by_category=by_category,
        margin_monthly=margin_monthly,
        hours_by_machine=hours_by_machine,
        hours_by_operation=hours_by_operation,
    )


@router.get("/dashboard/statistics/orders-materials", response_model=MaterialsStatsOut)
def get_materials_stats(
    period: str = 'year',
    supplier_id: Optional[int] = None,
    family: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
):
    """Dataset per il tab Materiali. Filtri opzionali: `supplier_id`, `family`
    (applicati a KPI costi/kg e ai breakdown per fornitore/materiale)."""
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

    # 3. Lead time medio "confermato → ordine materiale" (giorni).
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
        SELECT AVG(julianday(q.material_ordered_at) - julianday(q.confirmed_at)) AS avg_d
        FROM quotes q
        WHERE q.confirmed_at IS NOT NULL
          AND q.material_ordered_at IS NOT NULL
          {q_filter}
        """
    ), q_params).scalar()
    lead_time_avg = float(lt_row) if lt_row is not None else 0.0

    rows_lt = db.execute(text(
        f"""
        SELECT strftime('%Y-%m', q.material_ordered_at) AS m,
               AVG(julianday(q.material_ordered_at) - julianday(q.confirmed_at)) AS avg_d
        FROM quotes q
        WHERE q.confirmed_at IS NOT NULL
          AND q.material_ordered_at IS NOT NULL
          {q_filter}
        GROUP BY m ORDER BY m
        """
    ), q_params).all()
    lead_time_monthly = [
        StatsLeadTimePoint(month=r.m, avg_days=round(float(r.avg_d or 0), 2))
        for r in rows_lt
    ]

    # 4. Costi/kg/spedizioni + breakdown per fornitore e per materiale (spec 19).
    # Aggregazione in Python dalle coppie quote_supplier_orders del periodo,
    # riusando _estimate_weight_kg. Filtri supplier_id/family applicati qui.
    from app.api.orders import _estimate_weight_kg
    from app.services.material_status import part_needs_ordering

    qso_q = db.query(QuoteSupplierOrder)
    if date_from is not None:
        qso_q = qso_q.filter(QuoteSupplierOrder.ordered_at >= date_from)
    if date_to is not None:
        qso_q = qso_q.filter(func.date(QuoteSupplierOrder.ordered_at) <= date_to)
    if supplier_id is not None:
        qso_q = qso_q.filter(QuoteSupplierOrder.material_supplier_id == supplier_id)
    qsos = qso_q.all()

    quote_ids = {r.quote_id for r in qsos}
    parts_by_quote: dict = defaultdict(list)
    if quote_ids:
        parts = db.query(Part).options(
            joinedload(Part.material).joinedload(Material.material_supplier)
        ).filter(Part.quote_id.in_(quote_ids)).all()
        for p in parts:
            parts_by_quote[p.quote_id].append(p)

    sup_agg: dict = {}
    mat_agg: dict = {}
    for qso in qsos:
        for p in parts_by_quote.get(qso.quote_id, []):
            if not part_needs_ordering(p) or not p.material:
                continue
            if p.material.supplier_id != qso.material_supplier_id:
                continue
            if family and (p.material.family or '') != family:
                continue
            cost = (p.material_cost or 0.0) * (p.quantity or 1)
            kg = _estimate_weight_kg(p)
            sup = p.material.material_supplier
            s = sup_agg.setdefault(qso.material_supplier_id, {
                'name': sup.name if sup else 'Senza fornitore', 'cost': 0.0, 'kg': 0.0,
            })
            s['cost'] += cost
            s['kg'] += kg
            m = mat_agg.setdefault(p.material_id, {
                'name': p.material.name, 'cost': 0.0, 'kg': 0.0, 'lines': 0,
            })
            m['cost'] += cost
            m['kg'] += kg
            m['lines'] += 1

    # Spedizioni + n° ordini per fornitore (una spedizione per MaterialOrder).
    ship_where = list(where_mo)
    ship_params = dict(params)
    if supplier_id is not None:
        ship_where.append("mo.material_supplier_id = :supplier_id")
        ship_params['supplier_id'] = supplier_id
    ship_filter = (' WHERE ' + ' AND '.join(ship_where)) if ship_where else ''
    ship_rows = db.execute(text(
        f"""
        SELECT mo.material_supplier_id AS sid,
               COALESCE(SUM(ms.shipping_cost), 0) AS shipping,
               COUNT(*) AS n
        FROM material_orders mo
        JOIN material_suppliers ms ON ms.id = mo.material_supplier_id
        {ship_filter}
        GROUP BY mo.material_supplier_id
        """
    ), ship_params).all()
    ship_by_sid = {r.sid: (float(r.shipping or 0), int(r.n)) for r in ship_rows}

    by_supplier = []
    for sid, s in sup_agg.items():
        shipping, n_ord = ship_by_sid.get(sid, (0.0, 0))
        by_supplier.append(StatsMaterialSupplierRow(
            supplier_name=s['name'],
            material_cost=round(s['cost'], 2),
            weight_kg=round(s['kg'], 2),
            shipping_cost=round(shipping, 2),
            orders_count=n_ord,
        ))
    by_supplier.sort(key=lambda r: r.material_cost, reverse=True)

    by_material = [
        StatsMaterialRow(
            material_name=m['name'],
            material_cost=round(m['cost'], 2),
            weight_kg=round(m['kg'], 2),
            lines=m['lines'],
        )
        for m in mat_agg.values()
    ]
    by_material.sort(key=lambda r: r.material_cost, reverse=True)
    by_material = by_material[:10]

    total_material_cost = round(sum(s['cost'] for s in sup_agg.values()), 2)
    total_weight_kg = round(sum(s['kg'] for s in sup_agg.values()), 2)
    total_shipping = round(sum(sh for sh, _ in ship_by_sid.values()), 2)
    orders_count = sum(n for _, n in ship_by_sid.values())

    return MaterialsStatsOut(
        period=period,
        total_material_cost=total_material_cost,
        total_weight_kg=total_weight_kg,
        total_shipping=total_shipping,
        orders_count=orders_count,
        trend_monthly=trend,
        top_suppliers=top_suppliers,
        lead_time_avg_days=round(lead_time_avg, 2),
        lead_time_monthly=lead_time_monthly,
        by_supplier=by_supplier,
        by_material=by_material,
    )


@router.get("/dashboard/statistics/tools", response_model=ToolsStatsOut)
def get_tools_stats(
    period: str = 'year',
    tool_type: Optional[str] = None,
    supplier: Optional[str] = None,     # nome fornitore (snapshot)
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
):
    """Dataset per il tab Utensili (solo quantità, nessun costo). Filtri
    opzionali: `tool_type`, `supplier` (nome snapshot)."""
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

    # 4. KPI + quantità per tipo (solo quantità, spec 19). Filtri opzionali
    # tool_type/supplier applicati a livello item.
    item_where = []
    item_params: dict = {}
    if date_from is not None:
        item_where.append("toord.created_at >= :date_from")
        item_params['date_from'] = date_from
    if date_to is not None:
        item_where.append("toord.created_at < date(:date_to, '+1 day')")
        item_params['date_to'] = date_to
    if tool_type:
        item_where.append("toi.tool_type_snapshot = :tool_type")
        item_params['tool_type'] = tool_type
    if supplier:
        item_where.append("toi.supplier_name_snapshot = :supplier")
        item_params['supplier'] = supplier
    item_filter = (' WHERE ' + ' AND '.join(item_where)) if item_where else ''

    kpi = db.execute(text(
        f"""
        SELECT COUNT(DISTINCT toord.id) AS orders,
               COALESCE(SUM(toi.quantity_to_order), 0) AS qty,
               COUNT(DISTINCT toi.tool_id) AS distinct_tools
        FROM tool_order_items toi
        JOIN tool_orders toord ON toord.id = toi.tool_order_id
        {item_filter}
        """
    ), item_params).first()

    rows_type = db.execute(text(
        f"""
        SELECT COALESCE(toi.tool_type_snapshot, 'Senza tipo') AS label,
               COALESCE(SUM(toi.quantity_to_order), 0) AS qty
        FROM tool_order_items toi
        JOIN tool_orders toord ON toord.id = toi.tool_order_id
        {item_filter}
        GROUP BY label
        HAVING qty > 0
        ORDER BY qty DESC
        LIMIT 20
        """
    ), item_params).all()
    by_type = [StatsToolTypeRow(label=r.label or '—', quantity=int(r.qty or 0)) for r in rows_type]

    # 5. Sotto scorta per marca (inventario ATTUALE, non filtrato per periodo:
    # è lo stato di magazzino corrente). quantity < minimum, minimum > 0.
    rows_low = db.execute(text(
        """
        SELECT COALESCE(NULLIF(TRIM(brand), ''), 'Senza marca') AS name, COUNT(*) AS n
        FROM tools
        WHERE quantity < minimum_quantity AND minimum_quantity > 0
        GROUP BY name
        ORDER BY n DESC
        LIMIT 10
        """
    )).all()
    low_stock_by_brand = [StatsToolBrandRow(name=r.name, value=int(r.n)) for r in rows_low]
    low_stock_total = db.execute(text(
        "SELECT COUNT(*) FROM tools WHERE quantity < minimum_quantity AND minimum_quantity > 0"
    )).scalar() or 0

    return ToolsStatsOut(
        period=period,
        orders_count=int(kpi.orders or 0) if kpi else 0,
        total_quantity=int(kpi.qty or 0) if kpi else 0,
        distinct_tools=int(kpi.distinct_tools or 0) if kpi else 0,
        low_stock_total=low_stock_total,
        trend_monthly=trend,
        top_suppliers=top_suppliers,
        top_tools=top_tools,
        by_type=by_type,
        low_stock_by_brand=low_stock_by_brand,
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
        "SELECT COUNT(*) FROM quotes WHERE status = 'confermato' AND material_ordered_at IS NULL"
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
    tutti gli stati (bozza/inviato/letto/confermato/completo).
    """
    if status is not None and status not in (
        'bozza', 'inviato', 'letto', 'in_attesa_cliente',
        'confermato', 'completo', 'non_ordinato',
    ):
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
    if 'quotes.confirm' not in getattr(current_user, '_permissions', []):
        raise HTTPException(status_code=403, detail="Permesso negato")
    quotes = db.query(Quote).options(
        joinedload(Quote.parts),
        joinedload(Quote.submitted_by),
    ).filter(
        Quote.status.in_(['inviato', 'letto']),
    ).order_by(Quote.submitted_at.desc().nullslast()).limit(limit).all()
    return [_quote_to_row(q) for q in quotes]


@router.get("/dashboard/awaiting-materials", response_model=List[DashboardQuoteRow])
def get_awaiting_materials(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
    limit: int = 10,
):
    """Preventivi confermati in attesa di ordine materiale (spec 18/19):
    status 'confermato' con materiale non ancora totalmente evaso."""
    quotes = db.query(Quote).options(
        joinedload(Quote.parts),
        joinedload(Quote.submitted_by),
    ).filter(
        Quote.status == 'confermato',
        Quote.material_ordered_at.is_(None),
    ).order_by(Quote.confirmed_at.desc().nullslast()).limit(limit).all()
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

    # Conteggi preventivi per mese: creati (per quote_date), confermati (per
    # confirmed_at). Alimentano il grafico Andamento (linee creati/confermati).
    created_rows = db.execute(text(
        "SELECT CAST(strftime('%Y', quote_date) AS INTEGER) AS y, "
        "CAST(strftime('%m', quote_date) AS INTEGER) AS m, COUNT(*) AS n "
        "FROM quotes WHERE quote_date IS NOT NULL GROUP BY y, m"
    )).fetchall()
    confirmed_rows = db.execute(text(
        "SELECT CAST(strftime('%Y', confirmed_at) AS INTEGER) AS y, "
        "CAST(strftime('%m', confirmed_at) AS INTEGER) AS m, COUNT(*) AS n "
        "FROM quotes WHERE confirmed_at IS NOT NULL GROUP BY y, m"
    )).fetchall()
    created_by_key = {(int(r.y), int(r.m)): int(r.n) for r in created_rows}
    confirmed_by_key = {(int(r.y), int(r.m)): int(r.n) for r in confirmed_rows}
    value_by_key = {(int(r.y), int(r.m)): r for r in materials_rows}

    all_keys = sorted(set(value_by_key) | set(created_by_key) | set(confirmed_by_key))
    out: List[MonthlyData] = []
    for (y, m) in all_keys:
        r = value_by_key.get((y, m))
        value = float(r.value or 0.0) if r else 0.0
        cost_total = float(r.cost_total or 0.0) if r else 0.0
        material = float(r.material or 0.0) if r else 0.0
        labor = labor_by_key.get((y, m), 0.0)
        out.append(MonthlyData(
            month=f"{y}-{m:02d}",
            year=y,
            value=round(value, 2),
            margin=round(value - cost_total, 2),
            material=round(material, 2),
            labor=round(labor, 2),
            created_count=created_by_key.get((y, m), 0),
            confirmed_count=confirmed_by_key.get((y, m), 0),
        ))
    return out
