from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from io import BytesIO
import tempfile

from app.core.database import get_db
from app.models import Quote, Part, ManufacturingPhase, Material, CostRule

router = APIRouter(prefix="/api", tags=["pdf"])


def generate_quote_pdf(quote_id: int, internal: bool, db: Session):
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")

    parts = db.query(Part).filter(Part.quote_id == quote_id).all()

    # Load company settings from cost rules
    company_rules = db.query(CostRule).filter(CostRule.key.like('company_%')).all()
    company = {r.key: r.value for r in company_rules}
    company_name = company.get('company_name', 'MECHQUOTE')
    company_address = company.get('company_address', 'Fratelli Dalla Via - Officina Meccanica di Precisione')
    company_vat = company.get('company_vat', '')
    company_phone = company.get('company_phone', '')
    company_email = company.get('company_email', '')

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
@page {{ margin: 2cm; }}
body {{ font-family: Arial, sans-serif; font-size: 12px; color: #333; }}
.header {{ display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 20px; }}
.company-name {{ font-size: 24px; font-weight: bold; color: #1e40af; }}
.company-desc {{ font-size: 12px; color: #666; }}
.quote-title {{ font-size: 20px; font-weight: bold; text-align: right; }}
.info-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }}
.info-box {{ background: #f9fafb; padding: 15px; border-radius: 8px; }}
.info-label {{ font-size: 10px; color: #666; text-transform: uppercase; }}
.info-value {{ font-size: 14px; font-weight: bold; }}
table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
th {{ background: #f3f4f6; padding: 10px; text-align: left; font-size: 11px; text-transform: uppercase; color: #666; }}
td {{ padding: 10px; border-bottom: 1px solid #e5e7eb; }}
.total-row {{ font-weight: bold; font-size: 14px; }}
.footer {{ margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #666; }}
.phase-detail {{ font-size: 10px; color: #666; margin-top: 5px; }}
.badge {{ background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 4px; font-size: 10px; }}
</style>
</head>
<body>
<div class="header">
<div>
<div class="company-name">{company_name}</div>
<div class="company-desc">{company_address}</div>
{company_vat and f'<div class="company-desc">P.IVA: {company_vat}</div>' or ''}
{company_phone and f'<div class="company-desc">Tel: {company_phone}</div>' or ''}
{company_email and f'<div class="company-desc">Email: {company_email}</div>' or ''}
</div>
<div>
<div class="quote-title">PREVENTIVO</div>
<div style="text-align: right; color: #666; margin-top: 5px;">{quote.quote_number or ""}</div>
</div>
</div>

<div class="info-grid">
<div class="info-box">
<div class="info-label">Cliente</div>
<div class="info-value">""" + (quote.customer_name or "-") + """</div>
<div class="info-label" style="margin-top: 10px;">Riferimento</div>
<div class="info-value">""" + (quote.customer_reference or "-") + """</div>
</div>
<div class="info-box">
<div class="info-label">Data</div>
<div class="info-value">""" + str(quote.date) + """</div>
<div class="info-label" style="margin-top: 10px;">Validità</div>
<div class="info-value">""" + str(quote.validity_days) + """ giorni</div>
</div>
</div>
"""

    html += """<table>
<thead>
<tr>
<th>Codice</th>
<th>Descrizione</th>
<th>Qtà</th>
<th>Materiale</th>
"""
    if internal:
        html += "<th>Costo</th>"
    html += "<th>Prezzo Unit.</th><th>Totale</th></tr></thead><tbody>"

    for part in parts:
        mat_name = part.material.name if part.material else "-"
        html += "<tr>"
        html += "<td>" + part.part_code + "</td>"
        html += "<td>" + (part.description or "-") + "</td>"
        html += "<td>" + str(part.quantity) + "</td>"
        html += "<td>" + mat_name + "</td>"
        if internal:
            html += "<td>" + str(part.total_cost or 0) + " €</td>"
        html += "<td>" + str(part.unit_price or 0) + " €</td>"
        html += "<td class='total-row'>" + str(part.total_price or 0) + " €</td>"
        html += "</tr>"

        if internal and part.id:
            phases = db.query(ManufacturingPhase).filter(
                ManufacturingPhase.part_id == part.id
            ).order_by(ManufacturingPhase.sequence_number).all()
            if phases:
                html += '<tr><td colspan="7"><div style="margin: 10px 0; padding: 10px; background: #f9fafb; border-radius: 4px;">'
                html += '<div style="font-weight: bold; margin-bottom: 5px;">Ciclo di Lavorazione:</div>'
                for ph in phases:
                    vis = "Visible" if ph.customer_visible else "Nascosto"
                    html += '<div style="font-size: 11px; margin: 3px 0;">'
                    html += '<span class="badge">' + str(ph.sequence_number) + '</span> '
                    html += ph.phase_type + ' - ' + (ph.description or "") + ' '
                    html += '(' + str(ph.calculated_cost) + ' €) [' + vis + ']'
                    html += '</div>'
                html += '</div></td></tr>'

    html += "</tbody></table>"

    total = sum(p.total_price or 0 for p in parts)
    html += '<div style="text-align: right; margin-top: 20px;">'
    html += '<div style="font-size: 16px; font-weight: bold;">'
    html += 'TOTALE PREVENTIVO: ' + str(round(total, 2)) + ' ' + (quote.currency or "EUR") + '</div></div>'

    if quote.notes_customer:
        html += '<div class="footer"><div style="font-weight: bold; margin-bottom: 5px;">Note per il cliente:</div>'
        html += '<div>' + quote.notes_customer + '</div></div>'

    if internal and quote.notes_internal:
        html += '<div class="footer"><div style="font-weight: bold; margin-bottom: 5px;">Note interne:</div>'
        html += '<div>' + quote.notes_internal + '</div></div>'

    html += '<div class="footer">Preventivo generato da MechQuote - Fratelli Dalla Via</div>'
    html += '</body></html>'

    try:
        import weasyprint
        pdf_bytes = weasyprint.HTML(string=html).write_pdf()
        suffix = "_internal" if internal else "_customer"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix+".pdf", prefix="quote_"+str(quote_id)+"_")
        tmp.write(pdf_bytes)
        tmp.close()
        return tmp.name
    except ImportError:
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".html", prefix="quote_"+str(quote_id)+"_")
        tmp.write(html.encode('utf-8'))
        tmp.close()
        return tmp.name


@router.get("/quotes/{quote_id}/pdf/customer")
def get_customer_pdf(quote_id: int, db: Session = Depends(get_db)):
    path = generate_quote_pdf(quote_id, internal=False, db=db)
    return FileResponse(
        path=path,
        media_type='application/pdf',
        filename="preventivo_"+str(quote_id)+"_cliente.pdf"
    )


@router.get("/quotes/{quote_id}/pdf/internal")
def get_internal_pdf(quote_id: int, db: Session = Depends(get_db)):
    path = generate_quote_pdf(quote_id, internal=True, db=db)
    return FileResponse(
        path=path,
        media_type='application/pdf',
        filename="preventivo_"+str(quote_id)+"_interno.pdf"
    )
