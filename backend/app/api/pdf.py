from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import tempfile

from app.core.database import get_db
from app.models import Quote, Part, ManufacturingPhase, CostRule

router = APIRouter(prefix="/api", tags=["pdf"])


def _esc(text) -> str:
    """Minimal HTML escape to prevent injection in PDF."""
    if text is None:
        return ""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def generate_quote_pdf(quote_id: int, internal: bool, db: Session) -> str:
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")

    parts = db.query(Part).filter(Part.quote_id == quote_id).all()

    company_rules = db.query(CostRule).filter(CostRule.key.like('company_%')).all()
    company = {r.key: r.value for r in company_rules}
    company_name = company.get('company_name', 'Fratelli Dalla Via')
    company_address = company.get('company_address', 'Officina Meccanica di Precisione')
    company_vat = company.get('company_vat', '')
    company_phone = company.get('company_phone', '')
    company_email = company.get('company_email', '')

    quote_date_str = str(quote.quote_date) if quote.quote_date else "-"

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
.info-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }}
.info-box {{ background: #f9fafb; padding: 12px; border-radius: 6px; border: 1px solid #e5e7eb; }}
.info-label {{ font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }}
.info-value {{ font-size: 13px; font-weight: 600; margin-top: 2px; }}
table {{ width: 100%; border-collapse: collapse; margin: 16px 0; }}
th {{ background: #f3f4f6; padding: 9px 10px; text-align: left; font-size: 10px; text-transform: uppercase; color: #666; border-bottom: 2px solid #e5e7eb; }}
td {{ padding: 9px 10px; border-bottom: 1px solid #f3f4f6; font-size: 12px; }}
tr:last-child td {{ border-bottom: none; }}
.total-section {{ text-align: right; margin-top: 20px; padding: 16px; background: #f9fafb; border-radius: 8px; }}
.total-label {{ font-size: 11px; color: #888; text-transform: uppercase; }}
.total-value {{ font-size: 22px; font-weight: bold; color: #1e40af; }}
.footer {{ margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #888; }}
.badge {{ background: #dbeafe; color: #1e40af; padding: 2px 7px; border-radius: 4px; font-size: 10px; }}
.cycle-detail {{ margin: 8px 0; padding: 10px; background: #f9fafb; border-radius: 4px; border-left: 3px solid #2563eb; }}
.phase-row {{ font-size: 11px; padding: 3px 0; }}
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
    {"<div class='quote-number' style='color:#e53e3e;font-weight:bold;'>USO INTERNO</div>" if internal else ""}
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

<table>
<thead>
<tr>
  <th>Codice</th>
  <th>Descrizione</th>
  <th>Qtà</th>
  <th>Materiale</th>
"""

    if internal:
        html += "  <th>Costo</th>\n  <th>Margine</th>\n"

    html += "  <th>Prezzo Unit.</th>\n  <th>Totale</th>\n</tr>\n</thead>\n<tbody>\n"

    for part in parts:
        mat_name = part.material.name if part.material else "-"
        html += "<tr>\n"
        html += f"  <td><strong>{_esc(part.part_code)}</strong></td>\n"
        html += f"  <td>{_esc(part.description) or '-'}</td>\n"
        html += f"  <td>{part.quantity}</td>\n"
        html += f"  <td>{_esc(mat_name)}</td>\n"
        if internal:
            html += f"  <td>{part.total_cost or 0:.2f} €</td>\n"
            margin = part.margin_percent or 20
            html += f"  <td>{margin:.1f}%</td>\n"
        html += f"  <td>{part.unit_price or 0:.2f} €</td>\n"
        html += f"  <td><strong>{part.total_price or 0:.2f} €</strong></td>\n"
        html += "</tr>\n"

        if internal:
            phases = db.query(ManufacturingPhase).filter(
                ManufacturingPhase.part_id == part.id
            ).order_by(ManufacturingPhase.sequence_number).all()
            if phases:
                colspan = 8
                html += f'<tr><td colspan="{colspan}">\n'
                html += '<div class="cycle-detail">\n'
                html += '<strong style="font-size:11px;">Ciclo di lavorazione:</strong>\n'
                for ph in phases:
                    vis = "visibile" if ph.customer_visible else "nascosto"
                    html += f'<div class="phase-row">'
                    html += f'<span class="badge">{ph.sequence_number}</span> '
                    html += f'{_esc(ph.phase_type)} — {_esc(ph.description)} '
                    html += f'({ph.calculated_cost:.2f} €) [{vis}]'
                    html += '</div>\n'
                html += '</div></td></tr>\n'

    html += "</tbody>\n</table>\n"

    subtotal = sum(p.total_price or 0 for p in parts)
    transport = quote.transport_cost or 0
    packaging = quote.packaging_cost or 0
    discount_pct = quote.global_discount_percent or 0
    after_extras = subtotal + transport + packaging
    discount_amount = after_extras * discount_pct / 100
    total = round(after_extras - discount_amount, 2)

    total_rows = ""
    if transport:
        total_rows += f'<div style="font-size:12px;color:#555;">Trasporto: {transport:.2f} {_esc(quote.currency) or "EUR"}</div>\n'
    if packaging:
        total_rows += f'<div style="font-size:12px;color:#555;">Imballaggio: {packaging:.2f} {_esc(quote.currency) or "EUR"}</div>\n'
    if discount_pct:
        total_rows += f'<div style="font-size:12px;color:#e53e3e;">Sconto {discount_pct:.1f}%: -{discount_amount:.2f} {_esc(quote.currency) or "EUR"}</div>\n'

    html += f"""
<div class="total-section">
  {total_rows}
  <div class="total-label">Totale Preventivo</div>
  <div class="total-value">{total:.2f} {_esc(quote.currency) or 'EUR'}</div>
</div>
"""

    if quote.notes_customer:
        html += f'<div class="footer"><strong>Note per il cliente:</strong><br>{_esc(quote.notes_customer)}</div>\n'

    if internal and quote.notes_internal:
        html += f'<div class="footer"><strong>Note interne:</strong><br>{_esc(quote.notes_internal)}</div>\n'

    html += f'<div class="footer">Generato da MechQuote — {_esc(company_name)}</div>\n'
    html += "</body>\n</html>"

    try:
        import weasyprint
        pdf_bytes = weasyprint.HTML(string=html).write_pdf()
        suffix = "_interno" if internal else "_cliente"
        tmp = tempfile.NamedTemporaryFile(
            delete=False, suffix=suffix + ".pdf",
            prefix=f"preventivo_{quote_id}_"
        )
        tmp.write(pdf_bytes)
        tmp.close()
        return tmp.name
    except ImportError:
        tmp = tempfile.NamedTemporaryFile(
            delete=False, suffix=".html",
            prefix=f"preventivo_{quote_id}_"
        )
        tmp.write(html.encode('utf-8'))
        tmp.close()
        return tmp.name


@router.get("/quotes/{quote_id}/pdf/customer")
def get_customer_pdf(quote_id: int, db: Session = Depends(get_db)):
    path = generate_quote_pdf(quote_id, internal=False, db=db)
    return FileResponse(
        path=path,
        media_type='application/pdf',
        filename=f"preventivo_{quote_id}_cliente.pdf"
    )


@router.get("/quotes/{quote_id}/pdf/internal")
def get_internal_pdf(quote_id: int, db: Session = Depends(get_db)):
    path = generate_quote_pdf(quote_id, internal=True, db=db)
    return FileResponse(
        path=path,
        media_type='application/pdf',
        filename=f"preventivo_{quote_id}_interno.pdf"
    )
