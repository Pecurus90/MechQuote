from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
import tempfile
import os
import math

from app.core.database import get_db
from app.models import Quote, Part, ManufacturingPhase, CostRule

router = APIRouter(prefix="/api", tags=["pdf"])


def _esc(text) -> str:
    if text is None:
        return ""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _fmt_time(hours: float) -> str:
    if not hours or hours <= 0:
        return ""
    total_min = round(hours * 60)
    if total_min < 60:
        return f"{total_min} min"
    h = total_min // 60
    m = total_min % 60
    return f"{h}h {m}min" if m else f"{h}h"


def generate_quote_pdf(quote_id: int, internal: bool, db: Session) -> str:
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")

    parts = db.query(Part).options(
        joinedload(Part.material),
        joinedload(Part.phases).options(
            joinedload(ManufacturingPhase.machine),
            joinedload(ManufacturingPhase.supplier),
        ),
    ).filter(Part.quote_id == quote_id).order_by(Part.id).all()

    company_rules = db.query(CostRule).filter(CostRule.key.like('company_%')).all()
    company = {r.key: r.value for r in company_rules}
    company_name = company.get('company_name', 'Fratelli Dalla Via')
    company_address = company.get('company_address', 'Officina Meccanica di Precisione')
    company_vat = company.get('company_vat', '')
    company_phone = company.get('company_phone', '')
    company_email = company.get('company_email', '')

    quote_date_str = str(quote.quote_date) if quote.quote_date else "-"
    cur = _esc(quote.currency) or "EUR"

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
@page {{ margin: 2cm; }}
body {{ font-family: Arial, sans-serif; font-size: 12px; color: #333; }}
.header {{ display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 20px; }}
.company-name {{ font-size: 22px; font-weight: bold; color: #1e40af; }}
.company-info {{ font-size: 11px; color: #555; margin-top: 4px; }}
.quote-title {{ font-size: 20px; font-weight: bold; text-align: right; color: #1e40af; }}
.quote-number {{ text-align: right; color: #666; margin-top: 4px; font-size: 13px; }}
.info-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0 20px; }}
.info-box {{ background: #f9fafb; padding: 12px; border-radius: 6px; border: 1px solid #e5e7eb; }}
.info-label {{ font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }}
.info-value {{ font-size: 13px; font-weight: 600; margin-top: 2px; }}
/* Part cards */
.part-block {{ border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 16px; overflow: hidden; page-break-inside: avoid; }}
.part-head {{ background: #f0f4ff; padding: 9px 14px; border-bottom: 1px solid #dbeafe; display: flex; justify-content: space-between; align-items: center; }}
.part-head-left {{ display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }}
.part-code {{ font-family: monospace; font-weight: 700; color: #1e40af; font-size: 13px; }}
.part-rev {{ background: #dbeafe; color: #1e40af; padding: 1px 5px; border-radius: 3px; font-size: 10px; }}
.part-desc {{ color: #374151; font-size: 12px; }}
.part-qty {{ font-size: 12px; color: #6b7280; white-space: nowrap; }}
.mat-row {{ padding: 6px 14px; font-size: 11px; color: #555; background: #fafafa; border-bottom: 1px solid #f0f0f0; }}
.mat-label {{ font-weight: 600; color: #374151; }}
.ops-table {{ width: 100%; border-collapse: collapse; }}
.ops-table td {{ padding: 6px 12px; font-size: 11px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }}
.ops-table tr:last-child td {{ border-bottom: none; }}
.ops-seq {{ width: 28px; color: #9ca3af; font-size: 10px; padding-top: 8px; text-align: center; }}
.ops-badge {{ display: inline-block; background: #eff6ff; color: #2563eb; border-radius: 4px; padding: 2px 7px; font-size: 10px; font-weight: 700; }}
.ops-machine {{ color: #6b7280; font-size: 10px; margin-top: 2px; }}
.ops-desc {{ color: #374151; }}
.ops-notes {{ color: #6b7280; font-style: italic; font-size: 10px; margin-top: 2px; }}
.ops-time {{ color: #374151; font-size: 10px; white-space: nowrap; text-align: right; }}
.part-price-row {{ padding: 10px 14px; display: flex; justify-content: flex-end; align-items: center; gap: 24px; border-top: 1px solid #dbeafe; background: #f0f4ff; }}
.price-unit {{ font-size: 12px; color: #6b7280; }}
.price-total {{ font-size: 14px; font-weight: 700; color: #1e40af; }}
.price-cost {{ font-size: 11px; color: #9ca3af; }}
.total-section {{ text-align: right; margin-top: 20px; padding: 16px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; }}
.total-label {{ font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }}
.total-value {{ font-size: 24px; font-weight: bold; color: #1e40af; margin-top: 4px; }}
.footer {{ margin-top: 28px; padding-top: 14px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #888; }}
.no-phases {{ padding: 8px 14px; font-size: 11px; color: #9ca3af; font-style: italic; }}
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="company-name">{_esc(company_name)}</div>
    <div class="company-info">{_esc(company_address)}</div>
    {"<div class='company-info'>P.IVA: " + _esc(company_vat) + "</div>" if company_vat else ""}
    {"<div class='company-info'>Tel: " + _esc(company_phone) + "</div>" if company_phone else ""}
    {"<div class='company-info'>Email: " + _esc(company_email) + "</div>" if company_email else ""}
  </div>
  <div>
    <div class="quote-title">PREVENTIVO</div>
    <div class="quote-number">{_esc(quote.quote_number)}</div>
    {"<div class='quote-number' style='color:#e53e3e;font-weight:bold;margin-top:4px;'>USO INTERNO</div>" if internal else ""}
  </div>
</div>

<div class="info-grid">
  <div class="info-box">
    <div class="info-label">Cliente</div>
    <div class="info-value">{_esc(quote.customer_name) or "-"}</div>
    {"<div class='info-label' style='margin-top:8px;'>Rif. Cliente</div><div class='info-value'>" + _esc(quote.customer_reference) + "</div>" if quote.customer_reference else ""}
  </div>
  <div class="info-box">
    <div class="info-label">Data</div>
    <div class="info-value">{quote_date_str}</div>
    <div class="info-label" style="margin-top:8px;">Validità</div>
    <div class="info-value">{quote.validity_days or 30} giorni</div>
    {"<div class='info-label' style='margin-top:8px;'>Consegna</div><div class='info-value'>" + _esc(quote.delivery_text) + "</div>" if quote.delivery_text else ""}
  </div>
</div>
"""

    for part in parts:
        mat = part.material
        rev = part.revision or "A"

        # Header
        rev_badge = f'<span class="part-rev">Rev. {_esc(rev)}</span>' if rev != "A" else ""
        desc_span = f'<span class="part-desc">— {_esc(part.description)}</span>' if part.description else ""
        html += f"""
<div class="part-block">
  <div class="part-head">
    <div class="part-head-left">
      <span class="part-code">{_esc(part.part_code)}</span>
      {rev_badge}{desc_span}
    </div>
    <span class="part-qty">Qtà: {part.quantity}</span>
  </div>
"""

        # Material row
        if mat:
            mat_label = _esc(mat.name)
            if mat.family:
                mat_label += f" ({_esc(mat.family)})"

            dim_str = ""
            weight_kg = None
            if part.raw_diameter_mm:
                r = part.raw_diameter_mm / 2
                l = part.raw_z_mm or 0
                dim_str = f"Tondo &nbsp;Ø {part.raw_diameter_mm:g} &times; {l:g} mm" if l else f"Tondo &nbsp;Ø {part.raw_diameter_mm:g} mm"
                if l and mat.density_kg_dm3:
                    weight_kg = (math.pi * r * r * l / 1_000_000) * mat.density_kg_dm3
            elif part.raw_x_mm and part.raw_y_mm and part.raw_z_mm:
                dim_str = f"Prismatico &nbsp;{part.raw_x_mm:g} &times; {part.raw_y_mm:g} &times; {part.raw_z_mm:g} mm"
                if mat.density_kg_dm3:
                    weight_kg = (part.raw_x_mm * part.raw_y_mm * part.raw_z_mm / 1_000_000) * mat.density_kg_dm3

            weight_str = f" &nbsp;&bull;&nbsp; ~{weight_kg:.3f} kg/pz" if weight_kg else ""
            dim_part = f" &nbsp;&bull;&nbsp; <span class='mat-label'>Grezzo:</span> {dim_str}{weight_str}" if dim_str else ""

            html += f'  <div class="mat-row"><span class="mat-label">Materiale:</span> {mat_label}{dim_part}</div>\n'

        # Phases table
        visible_phases = [ph for ph in part.phases if ph.customer_visible or internal]
        if visible_phases:
            html += '  <table class="ops-table">\n'
            for ph in visible_phases:
                setup_str = _fmt_time(ph.setup_hours or 0)
                cycle_str = _fmt_time(ph.cycle_hours_per_part or 0)
                time_parts = []
                if setup_str:
                    time_parts.append(f"Attr.: {setup_str}")
                if cycle_str:
                    time_parts.append(f"Ciclo: {cycle_str}/pz")
                time_cell = " &nbsp;|&nbsp; ".join(time_parts)

                machine_name = ph.machine.name if ph.machine else ""
                supplier_name = ph.supplier.name if ph.supplier else ""
                sub_info = machine_name or supplier_name
                machine_span = f'<div class="ops-machine">{_esc(sub_info)}</div>' if sub_info else ""

                desc_text = _esc(ph.description or "")
                notes_text = _esc(ph.customer_notes or "") if not internal else _esc(ph.internal_notes or "")
                desc_cell = desc_text
                if notes_text:
                    desc_cell += f'<div class="ops-notes">{notes_text}</div>'

                cost_cell = ""
                if internal:
                    cost_cell = f'<td style="text-align:right;font-size:10px;color:#6b7280;white-space:nowrap;">{ph.calculated_cost:.2f} {cur}</td>'

                html += f"""    <tr>
      <td class="ops-seq">{ph.sequence_number}</td>
      <td><span class="ops-badge">{_esc(ph.phase_type)}</span>{machine_span}</td>
      <td class="ops-desc">{desc_cell}</td>
      <td class="ops-time">{time_cell}</td>
      {cost_cell}
    </tr>
"""
            html += '  </table>\n'
        else:
            html += '  <div class="no-phases">Nessuna lavorazione definita</div>\n'

        # Price row
        cost_info = f'<span class="price-cost">Costo: {part.total_cost or 0:.2f} {cur}</span>' if internal else ""
        html += f"""  <div class="part-price-row">
    {cost_info}
    <span class="price-unit">{part.unit_price or 0:.2f} {cur} / pz</span>
    <span class="price-total">{part.total_price or 0:.2f} {cur}</span>
  </div>
</div>
"""

    # Totals
    subtotal = sum(p.total_price or 0 for p in parts)
    transport = quote.transport_cost or 0
    packaging = quote.packaging_cost or 0
    discount_pct = quote.global_discount_percent or 0
    after_extras = subtotal + transport + packaging
    discount_amount = after_extras * discount_pct / 100
    total = round(after_extras - discount_amount, 2)

    total_rows = ""
    if transport:
        total_rows += f'<div style="font-size:12px;color:#555;margin-bottom:4px;">Trasporto: {transport:.2f} {cur}</div>\n'
    if packaging:
        total_rows += f'<div style="font-size:12px;color:#555;margin-bottom:4px;">Imballaggio: {packaging:.2f} {cur}</div>\n'
    if discount_pct:
        total_rows += f'<div style="font-size:12px;color:#e53e3e;margin-bottom:4px;">Sconto {discount_pct:.1f}%: -{discount_amount:.2f} {cur}</div>\n'

    html += f"""
<div class="total-section">
  {total_rows}
  <div class="total-label">Totale Preventivo</div>
  <div class="total-value">{total:.2f} {cur}</div>
</div>
"""

    if quote.notes_customer:
        html += f'<div class="footer"><strong>Note:</strong><br>{_esc(quote.notes_customer)}</div>\n'

    if internal and quote.notes_internal:
        html += f'<div class="footer"><strong>Note interne:</strong><br>{_esc(quote.notes_internal)}</div>\n'

    html += f'<div class="footer" style="margin-top:16px;">Generato da MechQuote &mdash; {_esc(company_name)}</div>\n'
    html += "</body>\n</html>"

    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.set_content(html, wait_until="networkidle")
        pdf_bytes = page.pdf(format="A4", margin={
            "top": "20mm", "bottom": "20mm", "left": "15mm", "right": "15mm"
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
def get_customer_pdf(quote_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    path = generate_quote_pdf(quote_id, internal=False, db=db)
    background_tasks.add_task(os.unlink, path)
    return FileResponse(
        path=path,
        media_type='application/pdf',
        filename=f"preventivo_{quote_id}_cliente.pdf"
    )


@router.get("/quotes/{quote_id}/pdf/internal")
def get_internal_pdf(quote_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    path = generate_quote_pdf(quote_id, internal=True, db=db)
    background_tasks.add_task(os.unlink, path)
    return FileResponse(
        path=path,
        media_type='application/pdf',
        filename=f"preventivo_{quote_id}_interno.pdf"
    )
