"""PDF dell'ordine materiali — stesso look del PDF preventivo.

Riusa CSS + helpers + monogramma + palette navy + tipografia mista dal
modulo `pdf.py`. Aggiunge solo i `_render_*` specifici per la struttura
dell'ordine (tabella materiali per fornitore).

Struttura output:
- Header: monogramma azienda + tag "ORDINE MATERIALE" + #MO-N + data
- Meta bar: creato da, N preventivi inclusi
- Per ogni fornitore: card con tabella materiali (nome, dimensioni,
  qty, peso, riferimenti preventivi)
- Footer: nome azienda + "Generato da MechQuote"
"""
import tempfile
from typing import List

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.api.orders import aggregate_materials
from app.api.pdf import (
    CSS, ICON_CUBE,
    _esc, _fmt_date_it,
)
from app.models import CompanySettings, MaterialOrder


def _render_order_header(order: MaterialOrder, cs) -> str:
    """Header: monogramma + dati azienda a sinistra, tag/numero/data a destra."""
    co_name = (cs.name if cs and cs.name else 'Fratelli Dalla Via')
    co_addr = (cs.address if cs and cs.address else 'Officina Meccanica di Precisione')

    info_lines = []
    if cs and cs.vat:
        info_lines.append(f'P.IVA {_esc(cs.vat)}')
    if cs and cs.phone:
        info_lines.append(f'Tel {_esc(cs.phone)}')
    if cs and cs.email:
        info_lines.append(_esc(cs.email))
    co_info = ' &nbsp;·&nbsp; '.join(info_lines)

    mono_letters = ''.join(w[0] for w in co_name.split()[:3]).upper()[:3] or 'FDV'

    date_str = _fmt_date_it(order.created_at.date() if order.created_at else None)
    order_num = f"MO-{order.id:04d}"

    return f"""
<div class="hdr">
  <div class="hdr-left">
    <div class="mono-box">{_esc(mono_letters)}</div>
    <div>
      <div class="co-name">{_esc(co_name)}</div>
      <div class="co-tagline">{_esc(co_addr)}</div>
      <div class="co-info">{co_info}</div>
    </div>
  </div>
  <div class="hdr-right">
    <div class="q-tag">Ordine materiali</div>
    <div class="q-num">{order_num}</div>
    <div class="q-date">{date_str}</div>
  </div>
</div>
<div class="hdr-band"></div>
"""


def _render_order_meta(order: MaterialOrder) -> str:
    """Riga meta: creato da + N preventivi inclusi."""
    creator = order.created_by
    creator_name = (creator.full_name or creator.username) if creator else '—'
    quote_count = len(order.quotes)
    quote_numbers = sorted([q.quote_number for q in order.quotes])
    quotes_str = ', '.join(quote_numbers[:8])
    if len(quote_numbers) > 8:
        quotes_str += f' e altri {len(quote_numbers) - 8}'

    return f"""
<div class="meta">
  <div class="meta-item">
    <div class="meta-label">Creato da</div>
    <div class="meta-value">{_esc(creator_name)}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Preventivi inclusi</div>
    <div class="meta-value">{quote_count}</div>
  </div>
  <div class="meta-item" style="flex: 2;">
    <div class="meta-label">Riferimenti</div>
    <div class="meta-value" style="font-size: 9.5px; font-family: 'JetBrains Mono', monospace;">{_esc(quotes_str)}</div>
  </div>
</div>
"""


def _render_supplier_card(group) -> str:
    """Card con tabella materiali per un singolo fornitore."""
    rows = []
    for i, item in enumerate(group.items, start=1):
        fam = f' <span class="accent">({_esc(item.family.replace("_", " "))})</span>' if item.family else ''
        refs_html = '<br>'.join(_esc(r) for r in item.quote_refs)
        rows.append(f"""
<tr>
  <td class="c-n">{i}</td>
  <td>
    <div class="c-op">{_esc(item.material_name)}{fam}</div>
    <div class="c-mach">{_esc(item.dim_str)}</div>
  </td>
  <td class="ord-qty">{item.total_qty}</td>
  <td class="ord-weight">{item.total_weight_kg:.3f} kg</td>
  <td class="ord-refs">{refs_html}</td>
</tr>
""")

    return f"""
<div class="part-card">
  <div class="part-head">
    <span class="part-code">{_esc(group.supplier_name)}</span>
    <span class="part-desc">{len(group.items)} {'materiale' if len(group.items) == 1 else 'materiali'}</span>
  </div>
  <div class="section">
    <div class="sec-head">{ICON_CUBE}<span>Materiali da ordinare</span></div>
    <table class="ops">
      <thead>
        <tr>
          <td class="c-n">#</td>
          <td>Materiale · Dimensioni</td>
          <td class="ord-qty">Qty</td>
          <td class="ord-weight">Peso totale</td>
          <td class="ord-refs">Rif. preventivi</td>
        </tr>
      </thead>
      <tbody>{''.join(rows)}</tbody>
    </table>
  </div>
</div>
"""


# CSS aggiuntivo specifico per il PDF ordine (estende il base di pdf.py)
EXTRA_CSS = """
.ord-qty   { width: 50px;  text-align: right; font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--navy); }
.ord-weight{ width: 80px;  text-align: right; font-family: 'JetBrains Mono', monospace; color: var(--gray-700); }
.ord-refs  { width: 180px; font-size: 9px; color: var(--gray-500); font-family: 'JetBrains Mono', monospace; line-height: 1.4; }
"""


def generate_order_pdf(order_id: int, db: Session) -> str:
    """Genera il PDF dell'ordine e ritorna il path del file temp.

    Il chiamante è responsabile della pulizia (via BackgroundTasks).
    """
    order = db.query(MaterialOrder).options(
        joinedload(MaterialOrder.created_by),
        joinedload(MaterialOrder.quotes),
    ).filter(MaterialOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")

    quote_ids = [q.id for q in order.quotes]
    aggregate = aggregate_materials(quote_ids, db)

    cs = db.query(CompanySettings).filter(CompanySettings.id == 1).first()
    co_name = (cs.name if cs and cs.name else 'Fratelli Dalla Via')

    html_parts = [
        '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">',
        f'<style>{CSS}{EXTRA_CSS}</style></head><body>',
        _render_order_header(order, cs),
        _render_order_meta(order),
    ]

    if aggregate.groups:
        for group in aggregate.groups:
            html_parts.append(_render_supplier_card(group))
    else:
        html_parts.append(
            '<div class="part-card"><div class="section">'
            '<div class="no-ops">Nessun materiale da ordinare per i preventivi selezionati '
            '(potrebbero essere tutti in conto lavoro o senza materiale configurato).</div>'
            '</div></div>'
        )

    html_parts.append(
        f'<div class="doc-footer">{_esc(co_name)} &nbsp;·&nbsp; Ordine materiali generato da MechQuote</div>'
    )
    html_parts.append('</body></html>')

    html = ''.join(html_parts)

    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.set_content(html, wait_until="networkidle")
        pdf_bytes = page.pdf(format="A4", margin={
            "top": "14mm", "bottom": "18mm", "left": "12mm", "right": "12mm"
        }, print_background=True)
        browser.close()

    tmp = tempfile.NamedTemporaryFile(
        delete=False, suffix=".pdf",
        prefix=f"ordine_materiali_{order_id}_",
    )
    tmp.write(pdf_bytes)
    tmp.close()
    return tmp.name
