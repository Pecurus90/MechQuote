from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
import tempfile
import os
import math

from app.core.database import get_db
from app.core.security import require_permission
from app.models import Quote, Part, ManufacturingPhase, Material, MaterialSupplier, CompanySettings

router = APIRouter(prefix="/api", tags=["pdf"])

_can_pdf = require_permission('quotes.pdf')


def _esc(text) -> str:
    if text is None:
        return ""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _fmt_time(hours: float) -> str:
    if not hours or hours <= 0:
        return ""
    total_min = round(hours * 60)
    if total_min < 60:
        return f"{total_min}&prime;"
    h = total_min // 60
    m = total_min % 60
    return f"{h}h{m:02d}&prime;" if m else f"{h}h"


# Etichette compatte e classificazione "esterno" sono in app.core.phase_types
# (mirror lato backend di frontend/src/lib/constants.ts PHASE_TYPES).


CSS = """
@page { margin: 18mm 14mm 16mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5px; color: #1e293b; line-height: 1.4; }

/* ── Header ─────────────────────────────── */
.hdr { display: flex; justify-content: space-between; align-items: flex-start;
       border-bottom: 3px solid #1d4ed8; padding-bottom: 14px; margin-bottom: 16px; }
.co-name { font-size: 18px; font-weight: 700; color: #1e3a8a; }
.co-info { font-size: 9.5px; color: #64748b; line-height: 1.7; margin-top: 4px; }
.qbadge { text-align: right; }
.qbadge-pill { display: inline-block; background: #1d4ed8; color: #fff;
               font-size: 9px; font-weight: 700; letter-spacing: 1.5px;
               padding: 3px 10px; border-radius: 20px; }
.qnum { font-family: monospace; font-size: 17px; font-weight: 700;
        color: #1e3a8a; margin-top: 5px; }
.int-tag { color: #dc2626; font-weight: 700; font-size: 10px; margin-top: 3px; }

/* ── Meta bar ────────────────────────────── */
.meta { display: flex; gap: 10px; margin-bottom: 18px; }
.meta-box { flex: 1; border: 1px solid #e2e8f0; border-radius: 6px;
            padding: 8px 11px; background: #f8fafc; }
.ml { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.8px;
      color: #94a3b8; font-weight: 600; }
.mv { font-size: 11.5px; font-weight: 600; color: #0f172a; margin-top: 2px; }
.mv-sm { font-size: 10px; color: #475569; margin-top: 1px; }

/* ── Part card ───────────────────────────── */
.part { border: 1px solid #cbd5e1; border-radius: 7px; margin-bottom: 13px;
        overflow: hidden; page-break-inside: avoid; }
.ph { background: #eff6ff; padding: 7px 12px; border-bottom: 1px solid #bfdbfe;
      display: flex; justify-content: space-between; align-items: center; }
.ph-left { display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap; }
.pc { font-family: monospace; font-size: 12.5px; font-weight: 700; color: #1d4ed8; }
.pd { font-size: 10.5px; color: #475569; }
.prev { background: #e0e7ff; color: #3730a3; font-size: 9px;
        padding: 1px 5px; border-radius: 3px; font-weight: 600; }
.pqty { background: #dbeafe; color: #1d4ed8; font-size: 9.5px; font-weight: 600;
        padding: 2px 9px; border-radius: 20px; white-space: nowrap; }

/* ── Material line ───────────────────────── */
.matl { padding: 5px 12px; font-size: 10px; color: #475569;
        background: #f8fafc; border-bottom: 1px solid #f1f5f9; }
.matl b { color: #334155; }

/* ── Phases table ────────────────────────── */
.ops { width: 100%; border-collapse: collapse; }
.ops-hd td { background: #f1f5f9; font-size: 8px; font-weight: 700; text-transform: uppercase;
             letter-spacing: 0.6px; color: #64748b; padding: 4px 10px;
             border-bottom: 1px solid #e2e8f0; }
.ops td { padding: 5px 10px; font-size: 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
.ops tr:last-child td { border-bottom: none; }
.ops-n { width: 22px; text-align: center; color: #94a3b8; font-size: 8.5px; padding-top: 7px; }
.ops-type { width: 90px; }
.badge { display: inline-block; border-radius: 3px; padding: 2px 6px;
         font-size: 8.5px; font-weight: 700; white-space: nowrap; }
.badge-work { background: #dbeafe; color: #1d4ed8; }
.badge-treat { background: #d1fae5; color: #065f46; }
.badge-ext { background: #f3e8ff; color: #6b21a8; }
.ops-mach { color: #94a3b8; font-size: 8.5px; margin-top: 2px; }
.ops-desc { color: #374151; }
.ops-note { color: #94a3b8; font-style: italic; font-size: 9px; margin-top: 2px; }
.ops-time { text-align: right; color: #64748b; white-space: nowrap; font-size: 9px; width: 90px; }
.ops-cost { text-align: right; font-weight: 700; color: #1e3a8a; white-space: nowrap;
            font-family: monospace; width: 70px; }
.no-ops { padding: 8px 12px; font-size: 10px; color: #94a3b8; font-style: italic; }

/* ── Cost breakdown (internal) ───────────── */
.cbd { background: #fffbeb; border-top: 2px solid #f59e0b; padding: 8px 12px 7px; }
.cbd-title { font-size: 8px; text-transform: uppercase; letter-spacing: 1px;
             color: #92400e; font-weight: 700; margin-bottom: 7px; }
.cbd-body { display: flex; gap: 16px; }
.cbd-costs { flex: 1; }
.cbd-pricing { min-width: 200px; border-left: 1px solid #fde68a; padding-left: 16px; }
.cbd-row { display: flex; justify-content: space-between; align-items: baseline;
           font-size: 10px; color: #374151; font-weight: 600; padding: 1.5px 0; }
.cbd-row span:last-child { font-family: monospace; color: #1e3a8a; }
.cbd-sub { display: flex; justify-content: space-between; font-size: 8.5px;
           color: #b45309; padding: 0 0 1px 10px; }
.cbd-sub span:last-child { font-family: monospace; }
.cbd-sep { border-top: 1px solid #fde68a; margin: 5px 0; }
.cbd-total-row { display: flex; justify-content: space-between; font-size: 10.5px;
                 font-weight: 700; color: #1e3a8a; padding: 2px 0; }
.cbd-total-row span:last-child { font-family: monospace; }
.cbd-pr-row { display: flex; justify-content: space-between; font-size: 10px;
              color: #374151; padding: 1.5px 0; }
.cbd-pr-row span:last-child { font-family: monospace; font-weight: 600; color: #1e3a8a; }
.cbd-pr-final { display: flex; justify-content: space-between; font-size: 12px;
                font-weight: 700; color: #1d4ed8; border-top: 1px solid #fde68a;
                margin-top: 5px; padding-top: 4px; }
.cbd-pr-final span:last-child { font-family: monospace; }

/* ── Price footer ────────────────────────── */
.pfoot { background: #eff6ff; border-top: 1px solid #bfdbfe;
         padding: 7px 12px; display: flex; justify-content: flex-end;
         align-items: center; gap: 18px; }
.pf-unit { font-size: 10.5px; color: #374151; }
.pf-total { font-size: 13px; font-weight: 700; color: #1d4ed8; }

/* ── Totals ──────────────────────────────── */
.totals-wrap { display: flex; justify-content: flex-end; margin-top: 14px; }
.totals-box { min-width: 260px; border: 1px solid #e2e8f0; border-radius: 7px; overflow: hidden; }
.totals-row { display: flex; justify-content: space-between; padding: 5px 14px;
              font-size: 10.5px; border-bottom: 1px solid #f1f5f9; }
.totals-row:last-child { border-bottom: none; }
.totals-label { color: #64748b; }
.totals-val { font-weight: 600; font-family: monospace; }
.totals-disc { color: #dc2626; }
.totals-head { background: #f8fafc; padding: 5px 14px;
               font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.8px;
               color: #94a3b8; font-weight: 600; border-bottom: 1px solid #e2e8f0; }
.totals-final { background: #eff6ff; border-top: 2px solid #1d4ed8;
                padding: 8px 14px; display: flex; justify-content: space-between; align-items: center; }
.totals-final-label { font-size: 10px; font-weight: 600; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.5px; }
.totals-final-val { font-size: 16px; font-weight: 700; color: #1d4ed8; font-family: monospace; }

/* ── Notes / footer ──────────────────────── */
.doc-notes { margin-top: 14px; font-size: 9.5px; color: #475569;
             border-top: 1px solid #e2e8f0; padding-top: 10px; }
.doc-footer { margin-top: 10px; font-size: 8.5px; color: #94a3b8; text-align: center; }
"""


def generate_quote_pdf(quote_id: int, internal: bool, db: Session) -> str:
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")

    parts = db.query(Part).options(
        joinedload(Part.material).joinedload(Material.material_supplier),
        joinedload(Part.phases).options(
            joinedload(ManufacturingPhase.machine),
            joinedload(ManufacturingPhase.supplier),
            joinedload(ManufacturingPhase.treatment),
        ),
    ).filter(Part.quote_id == quote_id).order_by(Part.id).all()

    cs = db.query(CompanySettings).filter(CompanySettings.id == 1).first()
    company_name    = (cs.name    if cs and cs.name    else 'Fratelli Dalla Via')
    company_address = (cs.address if cs and cs.address else 'Officina Meccanica di Precisione')
    company_vat     = (cs.vat     if cs else '')
    company_phone   = (cs.phone   if cs else '')
    company_email   = (cs.email   if cs else '')

    quote_date_str = str(quote.quote_date)[:10] if quote.quote_date else "—"
    cur = _esc(quote.currency) or "EUR"

    # ── Company info lines ──
    co_lines = f'<div class="co-info">{_esc(company_address)}'
    if company_vat:
        co_lines += f'<br>P.IVA: {_esc(company_vat)}'
    if company_phone:
        co_lines += f'<br>Tel: {_esc(company_phone)}'
    if company_email:
        co_lines += f'<br>{_esc(company_email)}'
    co_lines += '</div>'

    int_tag = '<div class="int-tag">▶ USO INTERNO</div>' if internal else ""

    # ── Meta boxes ──
    meta_boxes = f"""
<div class="meta-box">
  <div class="ml">Cliente</div>
  <div class="mv">{_esc(quote.customer_name) or "—"}</div>
  {"<div class='ml' style='margin-top:6px;'>Rif. cliente</div><div class='mv-sm'>" + _esc(quote.customer_reference) + "</div>" if quote.customer_reference else ""}
</div>
<div class="meta-box">
  <div class="ml">Data</div>
  <div class="mv">{quote_date_str}</div>
  <div class="ml" style="margin-top:5px;">Validità</div>
  <div class="mv-sm">{quote.validity_days or 30} giorni</div>
</div>"""
    if quote.delivery_text:
        meta_boxes += f"""
<div class="meta-box">
  <div class="ml">Consegna</div>
  <div class="mv-sm">{_esc(quote.delivery_text)}</div>
</div>"""

    html = f"""<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"><style>{CSS}</style></head>
<body>

<div class="hdr">
  <div>
    <div class="co-name">{_esc(company_name)}</div>
    {co_lines}
  </div>
  <div class="qbadge">
    <div class="qbadge-pill">PREVENTIVO</div>
    <div class="qnum">{_esc(quote.quote_number)}</div>
    {int_tag}
  </div>
</div>

<div class="meta">{meta_boxes}
</div>
"""

    # ── Parts ──
    for part in parts:
        mat = part.material
        qty = part.quantity or 1

        # Part header
        rev = part.revision or ""
        rev_span = f'<span class="prev">Rev.{_esc(rev)}</span> ' if rev and rev != "A" else ""
        desc_span = f'<span class="pd">— {_esc(part.description)}</span>' if part.description else ""
        html += f"""
<div class="part">
  <div class="ph">
    <div class="ph-left">
      <span class="pc">{_esc(part.part_code)}</span>
      {rev_span}{desc_span}
    </div>
    <span class="pqty">Qtà &nbsp;{qty}</span>
  </div>
"""

        # Material line
        if mat:
            mat_str = _esc(mat.name)
            if mat.family:
                mat_str += f" <span style='color:#94a3b8;'>({_esc(mat.family)})</span>"

            dim_str = ""
            weight_kg = None
            if part.raw_diameter_mm:
                r = part.raw_diameter_mm / 2
                l = part.raw_z_mm or 0
                dim_str = f"Tondo &thinsp;Ø&thinsp;{part.raw_diameter_mm:g}&thinsp;&times;&thinsp;{l:g}&thinsp;mm" if l else f"Tondo &thinsp;Ø&thinsp;{part.raw_diameter_mm:g}&thinsp;mm"
                if l and mat.density_kg_dm3:
                    weight_kg = (math.pi * r * r * l / 1_000_000) * mat.density_kg_dm3
            elif part.raw_x_mm and part.raw_y_mm and part.raw_z_mm:
                dim_str = f"Prismatico &thinsp;{part.raw_x_mm:g}&thinsp;&times;&thinsp;{part.raw_y_mm:g}&thinsp;&times;&thinsp;{part.raw_z_mm:g}&thinsp;mm"
                if mat.density_kg_dm3:
                    weight_kg = (part.raw_x_mm * part.raw_y_mm * part.raw_z_mm / 1_000_000) * mat.density_kg_dm3

            extras = ""
            if dim_str:
                extras += f" &nbsp;&middot;&nbsp; <b>Grezzo:</b> {dim_str}"
            if weight_kg:
                extras += f" &nbsp;&middot;&nbsp; ~{weight_kg:.3f}&thinsp;kg/pz"
            if part.finished_weight_kg:
                extras += f" &nbsp;&middot;&nbsp; Finito: {part.finished_weight_kg:.3f}&thinsp;kg"

            html += f'  <div class="matl"><b>Materiale:</b> {mat_str}{extras}</div>\n'

        # ── Phases table ──
        visible = [ph for ph in part.phases if ph.customer_visible or internal]
        if visible:
            hd_cost = '<td class="ops-cost">€/pz</td>' if internal else ""
            html += f'  <table class="ops"><tr class="ops-hd"><td class="ops-n">#</td><td class="ops-type">Tipo</td><td>Descrizione</td><td class="ops-time">Tempi</td>{hd_cost}</tr>\n'
            for ph in visible:
                setup_str = _fmt_time(ph.setup_hours or 0)
                cycle_str = _fmt_time(ph.cycle_hours_per_part or 0)
                times = []
                if setup_str:
                    times.append(f"Attr.&nbsp;{setup_str}")
                if cycle_str:
                    times.append(f"Ciclo&nbsp;{cycle_str}/pz")
                time_cell = " &nbsp;·&nbsp; ".join(times)

                is_treat = bool(ph.treatment_id)
                # Operation è il catalogo libero: niente più classificazione
                # "esterno" automatica. Resta solo treat vs work (dato dal
                # treatment_id, indipendente dal phase_type).
                badge_cls = "badge-treat" if is_treat else "badge-work"
                # Label compatta: se la fase ha un'operation, usa il suo name
                # (truncato); fallback su description o phase_type legacy.
                op_label = (ph.operation.name if ph.operation else None) or ph.description or ph.phase_type or ''
                badge_label = (op_label[:10] or '—').upper()

                sub = ph.machine.name if ph.machine else (ph.supplier.name if ph.supplier else "")
                mach_div = f'<div class="ops-mach">{_esc(sub)}</div>' if sub else ""

                desc_text = _esc(ph.description or "")
                note = _esc(ph.customer_notes or "") if not internal else _esc(ph.internal_notes or "")
                note_div = f'<div class="ops-note">{note}</div>' if note else ""

                cost_td = f'<td class="ops-cost">{ph.calculated_cost:.2f}</td>' if internal else ""

                html += f"""    <tr>
      <td class="ops-n">{ph.sequence_number}</td>
      <td class="ops-type"><span class="badge {badge_cls}">{badge_label}</span>{mach_div}</td>
      <td class="ops-desc">{desc_text}{note_div}</td>
      <td class="ops-time">{time_cell}</td>
      {cost_td}
    </tr>
"""
            html += '  </table>\n'
        else:
            html += '  <div class="no-ops">Nessuna lavorazione definita.</div>\n'

        # ── Internal cost breakdown (after phases) ──
        if internal:
            delivery_pp = (part.material_delivery_cost or 0.0) / qty
            cutting_pp = (mat.material_supplier.cutting_cost_per_part or 0.0) if (mat and mat.material_supplier) else 0.0
            mat_total = (part.material_cost or 0.0) + delivery_pp + cutting_pp

            work_phases = [ph for ph in part.phases if not ph.treatment_id]
            treat_phases = [ph for ph in part.phases if ph.treatment_id]
            work_cost = sum(ph.calculated_cost for ph in work_phases)
            treat_cost = sum(ph.calculated_cost for ph in treat_phases)
            treat_ship_pp = sum((ph.fixed_cost or 0.0) for ph in treat_phases) / qty

            # Left: cost items
            costs_html = f'<div class="cbd-row"><span>Materiale</span><span>{mat_total:.2f}&nbsp;{cur}/pz</span></div>'
            if delivery_pp > 0.005:
                costs_html += f'<div class="cbd-sub"><span>di cui spedizione</span><span>{delivery_pp:.2f}</span></div>'
            if cutting_pp > 0.005:
                costs_html += f'<div class="cbd-sub"><span>di cui taglio grezzo</span><span>{cutting_pp:.2f}</span></div>'
            if work_cost > 0.005:
                costs_html += f'<div class="cbd-row"><span>Lavorazioni</span><span>{work_cost:.2f}&nbsp;{cur}/pz</span></div>'
            if treat_cost > 0.005:
                costs_html += f'<div class="cbd-row"><span>Trattamenti</span><span>{treat_cost:.2f}&nbsp;{cur}/pz</span></div>'
                if treat_ship_pp > 0.005:
                    costs_html += f'<div class="cbd-sub"><span>di cui spedizione</span><span>{treat_ship_pp:.2f}</span></div>'
            costs_html += f'<div class="cbd-sep"></div>'
            costs_html += f'<div class="cbd-total-row"><span>Costo/pz</span><span>{part.total_cost or 0:.2f}&nbsp;{cur}</span></div>'

            # Right: pricing
            margin = part.margin_percent if part.margin_percent is not None else (quote.global_margin_percent or 0.0)
            margin_lbl = f"{margin:.0f}%"
            pricing_html = f'<div class="cbd-pr-row"><span>Costo/pz</span><span>{part.total_cost or 0:.2f}&nbsp;{cur}</span></div>'
            pricing_html += f'<div class="cbd-pr-row"><span>Margine</span><span>{margin_lbl}</span></div>'
            pricing_html += f'<div class="cbd-pr-row"><span>Prezzo/pz</span><span>{part.unit_price or 0:.2f}&nbsp;{cur}</span></div>'
            pricing_html += f'<div class="cbd-pr-final"><span>Totale &times;&thinsp;{qty}</span><span>{part.total_price or 0:.2f}&nbsp;{cur}</span></div>'

            html += f"""  <div class="cbd">
    <div class="cbd-title">Analisi costi &mdash; uso interno</div>
    <div class="cbd-body">
      <div class="cbd-costs">{costs_html}</div>
      <div class="cbd-pricing">{pricing_html}</div>
    </div>
  </div>
"""

        # ── Price footer ──
        html += f"""  <div class="pfoot">
    <span class="pf-unit">{part.unit_price or 0:.2f}&nbsp;{cur}&nbsp;/&nbsp;pz</span>
    <span class="pf-total">{part.total_price or 0:.2f}&nbsp;{cur}</span>
  </div>
</div>
"""

    # ── Totals ──
    subtotal = sum(p.total_price or 0 for p in parts)
    transport = quote.transport_cost or 0
    packaging = quote.packaging_cost or 0
    discount_pct = quote.global_discount_percent or 0
    after_extras = subtotal + transport + packaging
    discount_amount = round(after_extras * discount_pct / 100, 2)
    total = round(after_extras - discount_amount, 2)

    rows = f'<div class="totals-row"><span class="totals-label">Subtotale parti</span><span class="totals-val">{subtotal:.2f}&nbsp;{cur}</span></div>'
    if transport:
        rows += f'<div class="totals-row"><span class="totals-label">Trasporto</span><span class="totals-val">{transport:.2f}&nbsp;{cur}</span></div>'
    if packaging:
        rows += f'<div class="totals-row"><span class="totals-label">Imballaggio</span><span class="totals-val">{packaging:.2f}&nbsp;{cur}</span></div>'
    if discount_pct:
        rows += f'<div class="totals-row"><span class="totals-label">Sconto&nbsp;{discount_pct:.1f}%</span><span class="totals-val totals-disc">- {discount_amount:.2f}&nbsp;{cur}</span></div>'

    html += f"""
<div class="totals-wrap">
  <div class="totals-box">
    <div class="totals-head">Riepilogo</div>
    {rows}
    <div class="totals-final">
      <span class="totals-final-label">Totale</span>
      <span class="totals-final-val">{total:.2f}&nbsp;{cur}</span>
    </div>
  </div>
</div>
"""

    if quote.notes_customer:
        html += f'<div class="doc-notes"><strong>Note:</strong><br>{_esc(quote.notes_customer)}</div>\n'
    if internal and quote.notes_internal:
        html += f'<div class="doc-notes"><strong>Note interne:</strong><br>{_esc(quote.notes_internal)}</div>\n'

    html += f'<div class="doc-footer">{_esc(company_name)} &mdash; Generato da MechQuote</div>\n'
    html += "</body>\n</html>"

    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.set_content(html, wait_until="networkidle")
        pdf_bytes = page.pdf(format="A4", margin={
            "top": "18mm", "bottom": "16mm", "left": "14mm", "right": "14mm"
        })
        browser.close()

    suffix = "_interno" if internal else "_cliente"
    tmp = tempfile.NamedTemporaryFile(
        delete=False, suffix=suffix + ".pdf",
        prefix=f"preventivo_{quote_id}_"
    )
    tmp.write(pdf_bytes)
    tmp.close()
    return tmp.name


@router.get("/quotes/{quote_id}/pdf/customer")
def get_customer_pdf(quote_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), _=_can_pdf):
    path = generate_quote_pdf(quote_id, internal=False, db=db)
    background_tasks.add_task(os.unlink, path)
    return FileResponse(
        path=path,
        media_type='application/pdf',
        filename=f"preventivo_{quote_id}_cliente.pdf"
    )


@router.get("/quotes/{quote_id}/pdf/internal")
def get_internal_pdf(quote_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), _=_can_pdf):
    path = generate_quote_pdf(quote_id, internal=True, db=db)
    background_tasks.add_task(os.unlink, path)
    return FileResponse(
        path=path,
        media_type='application/pdf',
        filename=f"preventivo_{quote_id}_interno.pdf"
    )
