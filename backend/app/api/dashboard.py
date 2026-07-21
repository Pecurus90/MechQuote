"""Dashboard endpoint — KPI e aggregati mensili.

Implementazione: aggregati via SQL (SUM/COUNT/GROUP BY) invece di caricare
tutti i Quote+Part+Phase in memoria. Per N preventivi × M parti × P fasi
passa da O(N×M×P) row idratate in Python a O(1) lato DB. La differenza
si sente da ~500 preventivi in poi.
"""
from collections import defaultdict
from fastapi import APIRouter, Depends
from sqlalchemy import func, text, or_
from sqlalchemy.orm import Session, joinedload
from datetime import date, timedelta
from typing import Dict, List, Optional

from fastapi import HTTPException

from app.core.database import get_db
from app.core.security import require_permission, get_current_user
from app.models import (
    Quote, Part, Material, QuoteSupplierOrder, User, Notification, NotificationRead,
)
from app.schemas import (
    MonthlyData, WorkflowStats, DashboardQuoteRow,
    StatisticsOut, StatsTrendPoint, StatsCustomerRow, StatsCategoryRow, StatsMarginPoint,
    StatsHoursRow, MaterialsStatsOut, ToolsStatsOut, StatsCountPoint, StatsSupplierRow,
    StatsLeadTimePoint, StatsToolRow, StatsToolTypeRow,
    StatsMaterialSupplierRow, StatsMaterialRow, StatsToolBrandRow, StatsOutcome,
    MarginStatsOut, MarginMonthlyPoint, MarginProfitPoint, MarginBandRow, MarginWorstRow,
    StatsCmpPoint, StatsQuotesComparison, MarginComparison,
)
from app.api.notifications import serialize_notification
from app.services.costing.primitives import quote_total


router = APIRouter(prefix="/api", tags=["dashboard"])

_can_view = require_permission('dashboard')
# Statistiche (costi/margini aggregati) hanno una chiave propria, separata dalla
# Dashboard: l'ufficio tecnico "normale" non deve vedere i costi di tutta
# l'azienda. Solo i 4 endpoint /dashboard/statistics* usano questo gate.
_can_stats = require_permission('statistics')




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
    if q.final_total is not None:
        # B1: totale persistito (fonte unica, allineato ad archivio e PDF).
        total = q.final_total
    else:
        # F9: fallback per quote storiche mai ricalcolate (final_total NULL).
        # Include trasporto/imballaggio/sconto via la formula autoritativa
        # (quote_total, gemello di calcQuoteTotal) invece della sola somma parti.
        parts_sum = sum((p.total_price or 0.0) for p in q.parts) if q.parts else 0.0
        total = quote_total(
            parts_total_price_sum=parts_sum,
            transport_cost=q.transport_cost,
            packaging_cost=q.packaging_cost,
            global_discount_percent=q.global_discount_percent,
        )
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

    standard_count = sum(by_status.values())

    # Visibilità pipeline: chi accede all'archivio (ufficio tecnico E
    # amministrazione) vede gli stessi KPI. La conferma resta gated altrove.
    has_archive = 'quotes.archive' in getattr(current_user, '_permissions', [])
    to_review = (
        db.query(func.count(Quote.id)).filter(Quote.status.in_(['inviato', 'letto'])).scalar() or 0
    ) if has_archive else 0

    # Offerte in attesa di risposta del cliente (spec 18).
    awaiting_client = (
        db.query(func.count(Quote.id)).filter(Quote.status == 'in_attesa_cliente').scalar() or 0
    ) if has_archive else 0

    # Ordini completi senza prezzo di vendita: buchi nei dati statistici
    # (marginalità reale). Solo status='completo' con sold_price non compilato.
    missing_price = (
        db.query(func.count(Quote.id)).filter(
            Quote.status == 'completo', Quote.sold_price.is_(None),
        ).scalar() or 0
    ) if has_archive else 0

    return WorkflowStats(
        by_status=by_status,
        to_review_count=to_review,
        awaiting_client_count=awaiting_client,
        completed_missing_price_count=missing_price,
        standard_count=standard_count,
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


def _comparison_range(compare: str, date_from, date_to):
    """Finestra di confronto per il toggle MoM/YoY.
    - 'prev' = finestra immediatamente precedente della stessa lunghezza.
    - 'yoy'  = stessa finestra shiftata di ~1 anno (365 giorni, robusto ai
      bisestili).
    Richiede un periodo con bound espliciti: su 'Tutto' (date_from None) il
    confronto non è definito → (None, None).
    """
    if date_from is None or date_to is None:
        return (None, None)
    if compare == 'yoy':
        return (date_from - timedelta(days=365), date_to - timedelta(days=365))
    if compare == 'prev':
        length = (date_to - date_from).days
        cmp_to = date_from - timedelta(days=1)
        return (cmp_to - timedelta(days=length), cmp_to)
    return (None, None)


def _quotes_where(date_from, date_to, customer_id):
    """Costruisce (date_filter, params) per le query della tab Preventivi.
    Riusato da periodo corrente e finestra di confronto."""
    parts: list = []
    params: dict = {}
    if date_from is not None:
        parts.append("q.quote_date >= :date_from")
        params['date_from'] = date_from
    if date_to is not None:
        parts.append("q.quote_date <= :date_to")
        params['date_to'] = date_to
    if customer_id is not None:
        parts.append("q.customer_id = :customer_id")
        params['customer_id'] = customer_id
    date_filter = (' AND ' + ' AND '.join(parts)) if parts else ''
    return date_filter, params


# F2: valore € di un preventivo = final_total persistito (include trasporto/
# imballaggio/sconto globale), con fallback alla somma parti per le quote
# storiche mai ricalcolate (final_total NULL). Fonte unica, allineata ad
# archivio e a _quote_to_row. Usato in tutte le aggregazioni "preventivato".
_QUOTE_VALUE_SQL = (
    "COALESCE(q.final_total, "
    "(SELECT COALESCE(SUM(p.total_price), 0) FROM parts p WHERE p.quote_id = q.id))"
)


def _quotes_comparison(db: Session, date_from, date_to, customer_id) -> StatsQuotesComparison:
    """Aggregati della finestra di confronto (tab Preventivi): € totale e
    margine % per mese (per la serie `cmp`) + scalari per i delta KPI."""
    df, params = _quotes_where(date_from, date_to, customer_id)
    rows = db.execute(text(
        f"""
        SELECT strftime('%Y-%m', q.quote_date) AS m,
          COALESCE(SUM(
            {_QUOTE_VALUE_SQL}
          ), 0) AS total
        FROM quotes q
        WHERE 1=1 {df}
        GROUP BY m ORDER BY m
        """
    ), params).all()
    trend_total = [StatsCmpPoint(month=r.m, value=round(float(r.total or 0), 2)) for r in rows]
    total_value = round(sum(float(r.total or 0) for r in rows), 2)

    count = db.execute(text(f"SELECT COUNT(*) FROM quotes q WHERE 1=1 {df}"), params).scalar() or 0

    mrows = db.execute(text(
        f"""
        SELECT strftime('%Y-%m', q.quote_date) AS m,
          COALESCE(SUM(p.total_price), 0) AS revenue,
          COALESCE(SUM(p.total_cost * p.quantity), 0) AS cost
        FROM parts p JOIN quotes q ON q.id = p.quote_id
        WHERE p.total_cost > 0 {df}
        GROUP BY m ORDER BY m
        """
    ), params).all()
    margin_by_month = []
    msum, mn = 0.0, 0
    for r in mrows:
        cost = float(r.cost or 0)
        pct = ((float(r.revenue or 0) - cost) / cost * 100.0) if cost > 0 else 0.0
        margin_by_month.append(StatsCmpPoint(month=r.m, value=round(pct, 2)))
        msum += pct
        mn += 1
    # None (non 0.0) quando non c'è margine confrontabile: la query margine non
    # restituisce righe → il KPI di confronto non mostra una pill "0pt"
    # fuorviante.
    avg_margin = round(msum / mn, 2) if mn else None

    orow = db.execute(text(
        f"""
        SELECT
          SUM(CASE WHEN q.status IN ('confermato', 'completo') THEN 1 ELSE 0 END) AS won,
          SUM(CASE WHEN q.status = 'non_ordinato' THEN 1 ELSE 0 END) AS lost
        FROM quotes q WHERE 1=1 {df}
        """
    ), params).first()
    won = int(orow.won or 0) if orow else 0
    lost = int(orow.lost or 0) if orow else 0
    conv = round(won / (won + lost) * 100.0, 1) if (won + lost) > 0 else 0.0

    return StatsQuotesComparison(
        total_value=total_value, count=int(count),
        conversion_rate=conv, avg_margin=avg_margin,
        trend_total=trend_total, margin_by_month=margin_by_month,
    )


@router.get("/dashboard/statistics", response_model=StatisticsOut)
def get_statistics(
    period: str = 'year',
    customer_id: Optional[int] = None,
    compare: Optional[str] = None,      # 'prev' | 'yoy' | None
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_stats,
):
    """Dataset aggregato per la pagina /statistics (tab Preventivi).
    Param `period`: year (default) | 12m | prev_year | all.
    Filtro opzionale: `customer_id`.
    `compare` (prev|yoy) aggiunge gli aggregati della finestra di confronto.
    """
    date_from, date_to = _period_range(period)
    date_filter, params = _quotes_where(date_from, date_to, customer_id)

    # ─── 1. Trend mensile (€ preventivato) ────────────────────────────
    rows_std = db.execute(text(
        f"""
        SELECT strftime('%Y-%m', q.quote_date) AS m,
          COALESCE(SUM({_QUOTE_VALUE_SQL}), 0) AS v
        FROM quotes q
        WHERE 1=1
          {date_filter}
        GROUP BY m ORDER BY m
        """
    ), params).all()
    trend = [StatsTrendPoint(month=r.m, standard=float(r.v or 0)) for r in rows_std]

    # ─── 2. Top 10 clienti ─────────────────────────────────────────────
    rows_cust = db.execute(text(
        f"""
        SELECT q.customer_id, q.customer_name,
          COALESCE(
            {_QUOTE_VALUE_SQL}, 0
          ) AS total
        FROM quotes q
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
    # quote_number formato: CUST-YY<CAT>_PROG con CUST a lunghezza variabile
    # (1–3 cifre) e CAT di 1–2 lettere → la posizione della lettera NON è fissa.
    # Estraiamo il segmento CAT = testo tra le 2 cifre dell'anno (dopo '-') e '_':
    #   pre = quote_number fino a '_'  → CUST-YY<CAT>
    #   dopo '-' → YY<CAT>,  poi SUBSTR(..,3) scarta le 2 cifre anno → <CAT>
    rows_cat = db.execute(text(
        f"""
        SELECT
          SUBSTR(
            SUBSTR(
              SUBSTR(q.quote_number, 1, INSTR(q.quote_number, '_') - 1),
              INSTR(SUBSTR(q.quote_number, 1, INSTR(q.quote_number, '_') - 1), '-') + 1
            ), 3
          ) AS cat,
          COUNT(*) AS cnt,
          COALESCE(SUM(
            {_QUOTE_VALUE_SQL}
          ), 0) AS total
        FROM quotes q
        WHERE q.quote_number IS NOT NULL
          {date_filter}
        GROUP BY cat ORDER BY total DESC
        """
    ), params).all()
    # C4 — la lettera estratta dal quote_number viene validata contro il catalogo
    # QuoteCategory (unica fonte dei codici ammessi). Tutto ciò che non matcha
    # (numerazioni legacy/manuali, quote_number malformati) confluisce in 'Altro'
    # invece di sparire: così la somma per categoria riconcilia col totale e
    # nessun preventivo viene scartato in silenzio.
    valid_codes = {
        (code or '').strip().upper()
        for (code,) in db.execute(text("SELECT code FROM quote_categories")).all()
    }
    cat_agg: dict[str, list] = {}
    for r in rows_cat:
        raw = (r.cat or '').strip().upper()
        code = raw if raw and raw in valid_codes else 'Altro'
        agg = cat_agg.setdefault(code, [0, 0.0])
        agg[0] += int(r.cnt)
        agg[1] += float(r.total or 0)
    by_category = [
        StatsCategoryRow(category_code=code, count=cnt, total=round(tot, 2))
        for code, (cnt, tot) in sorted(cat_agg.items(), key=lambda x: x[1][1], reverse=True)
    ]

    # ─── 4. Margine medio mensile (solo standard) ─────────────────────
    # Margine medio = (Σ revenue - Σ cost) / Σ cost × 100 per ogni mese.
    rows_margin = db.execute(text(
        f"""
        SELECT strftime('%Y-%m', q.quote_date) AS m,
          COALESCE(SUM(p.total_price), 0) AS revenue,
          COALESCE(SUM(p.total_cost * p.quantity), 0) AS cost
        FROM parts p
        JOIN quotes q ON q.id = p.quote_id
        WHERE p.total_cost > 0
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
        f"SELECT COUNT(*) AS n FROM quotes q WHERE 1=1 {date_filter}"
    ), params).first()
    standard_count = int(cnt_row.n or 0) if cnt_row else 0

    # ─── 6. Distribuzione ore ─────────────────────────────────────────
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
            WHERE 1=1 {date_filter}
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

    # ─── 7. Esito commerciale: vinto/perso/aperto (conteggio + valore €) ──
    # Valore per preventivo = Σ parts.total_price. Bucket per stato.
    rows_outcome = db.execute(text(
        f"""
        SELECT
          CASE
            WHEN q.status IN ('confermato', 'completo') THEN 'won'
            WHEN q.status = 'non_ordinato' THEN 'lost'
            ELSE 'open'
          END AS outcome,
          COUNT(*) AS n,
          COALESCE(SUM(
            {_QUOTE_VALUE_SQL}
          ), 0) AS value
        FROM quotes q
        WHERE 1=1 {date_filter}
        GROUP BY outcome
        """
    ), params).all()
    oc = {r.outcome: (int(r.n), float(r.value or 0)) for r in rows_outcome}
    won_n, won_v = oc.get('won', (0, 0.0))
    lost_n, lost_v = oc.get('lost', (0, 0.0))
    open_n, open_v = oc.get('open', (0, 0.0))
    decided_n = won_n + lost_n
    decided_v = won_v + lost_v
    outcome = StatsOutcome(
        won_count=won_n, lost_count=lost_n, open_count=open_n,
        won_value=round(won_v, 2), lost_value=round(lost_v, 2), open_value=round(open_v, 2),
        conversion_rate=round(won_n / decided_n * 100.0, 1) if decided_n > 0 else 0.0,
        conversion_rate_value=round(won_v / decided_v * 100.0, 1) if decided_v > 0 else 0.0,
    )

    comparison = None
    if compare in ('prev', 'yoy'):
        cmp_from, cmp_to = _comparison_range(compare, date_from, date_to)
        if cmp_from is not None:
            comparison = _quotes_comparison(db, cmp_from, cmp_to, customer_id)

    return StatisticsOut(
        period=period,
        standard_count=standard_count,
        outcome=outcome,
        trend_monthly=trend,
        top_customers=top_customers,
        by_category=by_category,
        margin_monthly=margin_monthly,
        hours_by_machine=hours_by_machine,
        hours_by_operation=hours_by_operation,
        comparison=comparison,
    )


def _margin_where(date_from, date_to):
    """(where, params) per la tab Marginalità: solo preventivi completi,
    con bound di periodo. Riusato da periodo corrente e finestra di confronto."""
    parts = ["q.status = 'completo'"]
    params: dict = {}
    if date_from is not None:
        parts.append("q.quote_date >= :date_from")
        params['date_from'] = date_from
    if date_to is not None:
        parts.append("q.quote_date <= :date_to")
        params['date_to'] = date_to
    return ' AND '.join(parts), params


def _margin_core(db: Session, date_from, date_to):
    """KPI marginalità + guadagno mensile per una finestra temporale.
    Ritorna (guadagno_reale, taratura_prezzo, taratura_costo,
    (completed, with_sold, with_cost), profit_monthly)."""
    where, params = _margin_where(date_from, date_to)
    est_cost = "(SELECT COALESCE(SUM(p.total_cost * p.quantity), 0) FROM parts p WHERE p.quote_id = q.id)"
    agg = db.execute(text(
        f"""
        SELECT
          COUNT(*) AS completed,
          SUM(CASE WHEN q.sold_price IS NOT NULL THEN 1 ELSE 0 END) AS with_sold,
          SUM(CASE WHEN q.actual_cost IS NOT NULL THEN 1 ELSE 0 END) AS with_cost,
          COALESCE(SUM(CASE WHEN q.sold_price IS NOT NULL THEN q.sold_price END), 0) AS sold_sum,
          COALESCE(SUM(CASE WHEN q.sold_price IS NOT NULL THEN q.final_total END), 0) AS quoted_for_sold,
          COALESCE(SUM(CASE WHEN q.actual_cost IS NOT NULL THEN q.actual_cost END), 0) AS cost_sum,
          COALESCE(SUM(CASE WHEN q.actual_cost IS NOT NULL THEN {est_cost} END), 0) AS est_for_cost,
          COALESCE(SUM(CASE WHEN q.sold_price IS NOT NULL AND q.actual_cost IS NOT NULL
                           THEN (q.sold_price - q.actual_cost) END), 0) AS profit_sum
        FROM quotes q
        WHERE {where}
        """
    ), params).first()
    completed = int(agg.completed or 0) if agg else 0
    with_sold = int(agg.with_sold or 0) if agg else 0
    with_cost = int(agg.with_cost or 0) if agg else 0
    quoted_for_sold = float(agg.quoted_for_sold or 0) if agg else 0.0
    sold_sum = float(agg.sold_sum or 0) if agg else 0.0
    cost_sum = float(agg.cost_sum or 0) if agg else 0.0
    est_for_cost = float(agg.est_for_cost or 0) if agg else 0.0
    profit_sum = float(agg.profit_sum or 0) if agg else 0.0

    taratura_prezzo = round(sold_sum / quoted_for_sold, 4) if (with_sold and quoted_for_sold > 0) else None
    taratura_costo = round(cost_sum / est_for_cost, 4) if (with_cost and est_for_cost > 0) else None
    guadagno_reale = round(profit_sum, 2) if with_cost else None

    rows_p = db.execute(text(
        f"""
        SELECT strftime('%Y-%m', q.quote_date) AS m,
          COALESCE(SUM(q.sold_price - q.actual_cost), 0) AS profit
        FROM quotes q
        WHERE {where} AND q.sold_price IS NOT NULL AND q.actual_cost IS NOT NULL
        GROUP BY m ORDER BY m
        """
    ), params).all()
    profit_monthly = [MarginProfitPoint(month=r.m, profit=round(float(r.profit or 0), 2)) for r in rows_p]

    return guadagno_reale, taratura_prezzo, taratura_costo, (completed, with_sold, with_cost), profit_monthly


@router.get("/dashboard/statistics/margin", response_model=MarginStatsOut)
def get_margin_stats(
    period: str = 'year',
    compare: Optional[str] = None,      # 'prev' | 'yoy' | None
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_stats,
):
    """Tab Marginalità & taratura: guadagno reale e taratura prezzo/costo sui
    preventivi in stato 'completo'.

    - Guadagno reale  = venduto (sold_price) − costo reale (actual_cost)
    - Taratura prezzo = venduto ÷ preventivato (final_total)
    - Taratura costo  = costo reale ÷ costo stimato (Σ parti total_cost×qty)

    I KPI degradano a None quando manca il dato (nessun costo reale compilato):
    il frontend mostra la sola parte prezzo + avviso. `with_*_count` danno la
    copertura per valutare l'affidabilità delle medie. `compare` (prev|yoy)
    aggiunge gli aggregati della finestra di confronto.
    """
    date_from, date_to = _period_range(period)
    where, params = _margin_where(date_from, date_to)

    # ─── KPI + guadagno mensile (via core riusabile) ──────────────────
    guadagno_reale, taratura_prezzo, taratura_costo, counts, profit_monthly = _margin_core(db, date_from, date_to)
    completed, with_sold, with_cost = counts

    # ─── Andamento preventivato / venduto / costo reale (mensile) ─────
    rows_m = db.execute(text(
        f"""
        SELECT strftime('%Y-%m', q.quote_date) AS m,
          COALESCE(SUM(q.final_total), 0) AS preventivato,
          COALESCE(SUM(q.sold_price), 0) AS venduto,
          COALESCE(SUM(q.actual_cost), 0) AS costo
        FROM quotes q
        WHERE {where}
        GROUP BY m ORDER BY m
        """
    ), params).all()
    monthly = [
        MarginMonthlyPoint(
            month=r.m, preventivato=round(float(r.preventivato or 0), 2),
            venduto=round(float(r.venduto or 0), 2), costo=round(float(r.costo or 0), 2),
        ) for r in rows_m
    ]

    # ─── Distribuzione scostamento prezzo (venduto ÷ preventivato) ────
    rows_r = db.execute(text(
        f"""
        SELECT q.sold_price * 1.0 / q.final_total AS ratio
        FROM quotes q
        WHERE {where} AND q.sold_price IS NOT NULL AND q.final_total > 0
        """
    ), params).all()
    bands = [
        ('<0,80', lambda x: x < 0.80),
        ('0,80–0,85', lambda x: 0.80 <= x < 0.85),
        ('0,85–0,90', lambda x: 0.85 <= x < 0.90),
        ('0,90–0,95', lambda x: 0.90 <= x < 0.95),
        ('0,95–1,00', lambda x: 0.95 <= x < 1.00),
        ('≥1,00', lambda x: x >= 1.00),
    ]
    band_counts = {label: 0 for label, _ in bands}
    for r in rows_r:
        ratio = float(r.ratio or 0)
        for label, pred in bands:
            if pred(ratio):
                band_counts[label] += 1
                break
    distribution = [MarginBandRow(band=label, count=band_counts[label]) for label, _ in bands]

    # ─── Peggiori scostamenti (venduto molto sotto il preventivato) ───
    rows_w = db.execute(text(
        f"""
        SELECT q.quote_number, q.customer_name, q.final_total, q.sold_price, q.actual_cost,
          (q.sold_price - q.final_total) * 100.0 / q.final_total AS delta_pct
        FROM quotes q
        WHERE {where} AND q.sold_price IS NOT NULL AND q.final_total > 0
        ORDER BY delta_pct ASC
        LIMIT 10
        """
    ), params).all()
    worst = [
        MarginWorstRow(
            quote_number=r.quote_number or '—',
            customer_name=r.customer_name or '—',
            preventivato=round(float(r.final_total or 0), 2),
            venduto=round(float(r.sold_price or 0), 2),
            costo_reale=round(float(r.actual_cost), 2) if r.actual_cost is not None else None,
            delta_percent=round(float(r.delta_pct or 0), 1),
        ) for r in rows_w
    ]

    comparison = None
    if compare in ('prev', 'yoy'):
        cmp_from, cmp_to = _comparison_range(compare, date_from, date_to)
        if cmp_from is not None:
            c_g, c_tp, c_tc, _c_counts, c_profit = _margin_core(db, cmp_from, cmp_to)
            comparison = MarginComparison(
                guadagno_reale=c_g, taratura_prezzo=c_tp, taratura_costo=c_tc,
                profit_by_month=c_profit,
            )

    return MarginStatsOut(
        period=period,
        guadagno_reale=guadagno_reale,
        taratura_prezzo=taratura_prezzo,
        taratura_costo=taratura_costo,
        completed_count=completed,
        with_sold_count=with_sold,
        with_cost_count=with_cost,
        monthly=monthly,
        profit_monthly=profit_monthly,
        distribution=distribution,
        worst=worst,
        comparison=comparison,
    )


@router.get("/dashboard/statistics/orders-materials", response_model=MaterialsStatsOut)
def get_materials_stats(
    period: str = 'year',
    supplier_id: Optional[int] = None,
    family: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_stats,
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
          AND julianday(q.material_ordered_at) >= julianday(q.confirmed_at)
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
          AND julianday(q.material_ordered_at) >= julianday(q.confirmed_at)
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
    _=_can_stats,
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


@router.get("/dashboard/my-quotes", response_model=List[DashboardQuoteRow])
def get_my_quotes(
    status: Optional[str] = None,
    open_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
    limit: int = 10,
):
    """Lista preventivi del utente corrente. `status` opzionale (uno preciso);
    `open_only=true` filtra ai soli stati aperti/modificabili (bozza/inviato/
    letto/in_attesa_cliente) — la sezione "I miei preventivi" mostra gli aperti,
    non i chiusi (confermato/completo/non_ordinato).
    """
    if status is not None and status not in (
        'bozza', 'in_revisione', 'inviato', 'letto', 'in_attesa_cliente',
        'confermato', 'completo', 'non_ordinato',
    ):
        raise HTTPException(status_code=400, detail="Stato non valido")
    from app.services import quote_workflow as wf
    q = db.query(Quote).options(
        joinedload(Quote.parts),
        joinedload(Quote.submitted_by),
    ).filter(Quote.created_by_user_id == current_user.id)
    if status is not None:
        q = q.filter(Quote.status == status)
    elif open_only:
        q = q.filter(Quote.status.in_(list(wf.EDITABLE_STATUSES)))
    quotes = q.order_by(Quote.updated_at.desc()).limit(limit).all()
    return [_quote_to_row(q) for q in quotes]


@router.get("/dashboard/to-review", response_model=List[DashboardQuoteRow])
def get_to_review(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
    limit: int = 10,
):
    # Visibile a chi accede all'archivio (ufficio tecnico E amministrazione):
    # è una panoramica pipeline, la conferma resta gated in editor.
    if 'quotes.archive' not in getattr(current_user, '_permissions', []):
        raise HTTPException(status_code=403, detail="Permesso negato")
    quotes = db.query(Quote).options(
        joinedload(Quote.parts),
        joinedload(Quote.submitted_by),
    ).filter(
        Quote.status.in_(['inviato', 'letto']),
    ).order_by(Quote.submitted_at.desc().nullslast()).limit(limit).all()
    return [_quote_to_row(q) for q in quotes]


@router.get("/dashboard/queue-counts")
def get_queue_counts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
) -> Dict[str, int]:
    """Conteggi leggeri per i badge della sidebar (coda di lavoro).

    - `to_review`: preventivi inviati/letti in attesa di conferma. Solo COUNT
      (nessun join): pensato per essere chiamato a ogni render della sidebar.
      Visibile a chi vede l'archivio o conferma i preventivi.
    """
    perms = getattr(current_user, '_permissions', [])
    to_review = 0
    if 'quotes.archive' in perms or 'quotes.confirm' in perms:
        to_review = db.query(Quote).filter(Quote.status.in_(['inviato', 'letto'])).count()
    return {"to_review": to_review}


@router.get("/dashboard/awaiting-materials", response_model=List[DashboardQuoteRow])
def get_awaiting_materials(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
    limit: int = 30,
):
    """Materiale da ordinare (spec 18/19): preventivi confermati con materiale
    non ancora totalmente evaso + richieste materiale manuali (RM) inviate con
    righe ancora aperte. TD-11: la dashboard mostra entrambe le fonti."""
    # Espone dati di preventivi (cliente, numero, totale): gate come il gemello
    # to-review. Visibile a chi vede l'archivio O gestisce gli ordini materiale
    # (allineato al frontend: canSeeQuotes || canOrderMaterials).
    perms = getattr(current_user, '_permissions', [])
    if 'quotes.archive' not in perms and 'orders.materials' not in perms:
        raise HTTPException(status_code=403, detail="Permesso negato")
    quotes = db.query(Quote).options(
        joinedload(Quote.parts),
        joinedload(Quote.submitted_by),
    ).filter(
        Quote.status == 'confermato',
        Quote.material_ordered_at.is_(None),
    ).order_by(Quote.confirmed_at.desc().nullslast()).limit(limit).all()
    # Stato materiale reale per riga: `material_ordered_at` è NULL anche per i
    # PARZIALI (viene valorizzato solo a evasione totale), quindi il badge non
    # è sempre "non ordinato" — può essere "parziale". Lo calcoliamo qui.
    from app.services import quote_workflow as wf
    rows = []
    for q in quotes:
        row = _quote_to_row(q)
        row.material_status = wf.quote_material_status(db, q)
        rows.append(row)

    # TD-11: richieste materiale manuali (RM) inviate con almeno una riga aperta
    # (non ancora evasa in un ordine). Riga in shape DashboardQuoteRow, kind
    # 'request': il frontend le porta al pool /orders/materials.
    from app.models import MaterialRequest
    reqs = db.query(MaterialRequest).options(
        joinedload(MaterialRequest.items),
    ).filter(MaterialRequest.status == 'inviato').order_by(
        MaterialRequest.sent_at.desc().nullslast()
    ).limit(limit).all()
    for r in reqs:
        if not any(it.material_order_id is None for it in r.items):
            continue
        rows.append(DashboardQuoteRow(
            id=r.id,
            quote_number=f"RM-{r.id:04d}",
            customer_name=r.title,
            status='inviato',
            total_price=0.0,
            material_status='non_ordinato',
            kind='request',
        ))
    return rows


@router.get("/dashboard/monthly", response_model=List[MonthlyData])
def get_monthly(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_view,
):
    """Aggregati mensili per il grafico dashboard "Costo preventivato vs Venduto".

    Sui soli preventivi VENDUTI (sold_price valorizzato), per mese di chiusura
    (completed_at, fallback quote_date), somma:
    - costo stimato: Σ parts.total_cost × qty + trasporto + imballo
    - venduto: Σ sold_price (prezzo di vendita reale)
    Confronto mese per mese di quanto è costato vs quanto ha reso. Le
    statistiche più profonde (per stato/categoria) vivono nella sezione
    Statistiche, non qui.

    Convenzione (B4): preventivi con `sold_price` e vendite dirette sono
    sorgenti MUTUAMENTE ESCLUSIVE per lo stesso ricavo — un preventivo venduto
    NON va anche registrato come vendita diretta, altrimenti il mese conta due
    volte. Non c'è un vincolo tecnico che lo impedisca: è una regola d'uso.
    """
    rows = db.execute(text(
        """
        SELECT
          CAST(strftime('%Y', COALESCE(q.completed_at, q.quote_date), 'localtime') AS INTEGER) AS y,
          CAST(strftime('%m', COALESCE(q.completed_at, q.quote_date), 'localtime') AS INTEGER) AS m,
          COALESCE(SUM(
            (SELECT COALESCE(SUM(p.total_cost * p.quantity), 0)
             FROM parts p WHERE p.quote_id = q.id)
            + COALESCE(q.transport_cost, 0) + COALESCE(q.packaging_cost, 0)
          ), 0) AS quoted_cost,
          COALESCE(SUM(q.sold_price), 0) AS sold
        FROM quotes q
        WHERE q.sold_price IS NOT NULL
          AND COALESCE(q.completed_at, q.quote_date) IS NOT NULL
        GROUP BY y, m
        ORDER BY y, m
        """
    )).fetchall()

    # Vendite dirette (extra-preventivo) per mese di vendita: confluiscono nel
    # 'venduto'/'costo' insieme ai preventivi. Totale riga = unit × quantity.
    sale_rows = db.execute(text(
        """
        SELECT
          CAST(strftime('%Y', sale_date, 'localtime') AS INTEGER) AS y,
          CAST(strftime('%m', sale_date, 'localtime') AS INTEGER) AS m,
          COALESCE(SUM(unit_cost * quantity), 0) AS quoted_cost,
          COALESCE(SUM(unit_price * quantity), 0) AS sold
        FROM direct_sales
        WHERE sale_date IS NOT NULL
        GROUP BY y, m
        """
    )).fetchall()

    # Merge preventivi + vendite dirette per (anno, mese).
    agg: dict = {}
    for r in list(rows) + list(sale_rows):
        key = (int(r.y), int(r.m))
        cur = agg.setdefault(key, [0.0, 0.0])
        cur[0] += float(r.quoted_cost or 0.0)
        cur[1] += float(r.sold or 0.0)

    # Senza permesso 'statistics' il costo aggregato non è visibile (né qui né
    # via network tab): azzeriamo quoted_cost. Il venduto resta. Il frontend
    # nasconde comunque la serie Costo per questi utenti.
    show_cost = 'statistics' in getattr(current_user, '_permissions', [])
    return [
        MonthlyData(month=f"{y}-{m:02d}", year=y,
                    quoted_cost=round(c, 2) if show_cost else 0.0,
                    sold=round(s, 2))
        for (y, m), (c, s) in sorted(agg.items())
    ]
