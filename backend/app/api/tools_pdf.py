"""PDF ordine utensili dallo snapshot di un ToolOrder.

Stesso look del PDF preventivo/materiali. Aggregato per fornitore.
"""
import tempfile
from collections import defaultdict
from typing import Dict, List

from sqlalchemy.orm import Session, joinedload

from app.api.pdf import CSS, ICON_CUBE, _esc, _fmt_date_it
from app.models import CompanySettings, ToolOrder, ToolOrderItem


# CSS aggiuntivo per le colonne specifiche
EXTRA_CSS = """
.tool-code  { width: 130px; font-family: 'JetBrains Mono', monospace; font-size: 9px; color: var(--gray-900); font-weight: 600; }
.tool-spec  { color: var(--gray-700); }
.tool-spec .accent { color: var(--gray-500); font-size: 9px; }
.tool-qty   { width: 55px; text-align: right; font-family: 'JetBrains Mono', monospace; }
.tool-qty.low { color: #b91c1c; font-weight: 700; }
.tool-min   { width: 50px; text-align: right; font-family: 'JetBrains Mono', monospace; color: var(--gray-500); }
.tool-order { width: 65px; text-align: right; font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--navy); }
"""


def _render_header(order: ToolOrder, cs) -> str:
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
    <div class="q-tag">Ordine utensili</div>
    <div class="q-num">UO-{order.id:04d}</div>
    <div class="q-date">{date_str}</div>
  </div>
</div>
<div class="hdr-band"></div>
"""


def _render_meta(order: ToolOrder, items: List[ToolOrderItem]) -> str:
    creator = order.created_by
    creator_name = (creator.full_name or creator.username) if creator else '—'
    total_qty = sum(it.quantity_to_order for it in items)
    return f"""
<div class="meta">
  <div class="meta-item">
    <div class="meta-label">Creato da</div>
    <div class="meta-value">{_esc(creator_name)}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Utensili</div>
    <div class="meta-value">{len(items)}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Quantità totale</div>
    <div class="meta-value">{total_qty} pz</div>
  </div>
</div>
"""


def _render_supplier_card(supplier_name: str, items: List[ToolOrderItem]) -> str:
    rows = []
    for i, it in enumerate(items, start=1):
        spec_parts = []
        if it.brand_snapshot or it.model_snapshot:
            top = ' '.join(filter(None, [it.brand_snapshot, it.model_snapshot]))
            spec_parts.append(f'<div>{_esc(top)}</div>')
        sub_parts = []
        if it.tool_type_snapshot:
            sub_parts.append(_esc(it.tool_type_snapshot))
        if it.diameter_snapshot:
            sub_parts.append(f'Ø{it.diameter_snapshot:g} mm')
        if sub_parts:
            spec_parts.append(f'<div class="accent">{" · ".join(sub_parts)}</div>')
        spec_html = ''.join(spec_parts) or '—'

        rows.append(f"""
<tr>
  <td class="c-n">{i}</td>
  <td class="tool-code">{_esc(it.code_snapshot)}</td>
  <td class="tool-spec">{spec_html}</td>
  <td class="tool-qty low">{it.quantity_at_time}</td>
  <td class="tool-min">{it.minimum_at_time}</td>
  <td class="tool-order">{it.quantity_to_order}</td>
</tr>
""")
    return f"""
<div class="part-card">
  <div class="part-head">
    <span class="part-code">{_esc(supplier_name)}</span>
    <span class="part-desc">{len(items)} {'utensile' if len(items) == 1 else 'utensili'}</span>
  </div>
  <div class="section">
    <div class="sec-head">{ICON_CUBE}<span>Utensili da ordinare</span></div>
    <table class="ops">
      <thead>
        <tr>
          <td class="c-n">#</td>
          <td class="tool-code">Codice</td>
          <td>Tipo / Marchio / Modello</td>
          <td class="tool-qty">Qtà</td>
          <td class="tool-min">Min</td>
          <td class="tool-order">Ord.</td>
        </tr>
      </thead>
      <tbody>{''.join(rows)}</tbody>
    </table>
  </div>
</div>
"""


def generate_tool_order_pdf(order_id: int, db: Session) -> str:
    """Genera il PDF di un ToolOrder dal suo snapshot (sempre lo stesso PDF
    se l'ordine non viene modificato — gli items sono dati storici)."""
    order = db.query(ToolOrder).options(
        joinedload(ToolOrder.created_by),
        joinedload(ToolOrder.items),
    ).filter(ToolOrder.id == order_id).first()
    if not order:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Ordine utensili non trovato")

    cs = db.query(CompanySettings).filter(CompanySettings.id == 1).first()
    co_name = (cs.name if cs and cs.name else 'Fratelli Dalla Via')

    # Raggruppo per supplier_name_snapshot
    by_supplier: Dict[str, List[ToolOrderItem]] = defaultdict(list)
    for it in order.items:
        name = it.supplier_name_snapshot or 'Senza fornitore'
        by_supplier[name].append(it)

    html_parts = [
        '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">',
        f'<style>{CSS}{EXTRA_CSS}</style></head><body>',
        _render_header(order, cs),
        _render_meta(order, list(order.items)),
    ]

    if not order.items:
        html_parts.append(
            '<div class="part-card"><div class="section">'
            '<div class="no-ops">Nessun utensile in questo ordine.</div>'
            '</div></div>'
        )
    else:
        for supplier_name in sorted(by_supplier.keys(), key=lambda s: (s == 'Senza fornitore', s.lower())):
            html_parts.append(_render_supplier_card(supplier_name, by_supplier[supplier_name]))

    html_parts.append(
        f'<div class="doc-footer">{_esc(co_name)} &nbsp;·&nbsp; Ordine utensili generato da MechQuote</div>'
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
        prefix=f"ordine_utensili_{order_id}_",
    )
    tmp.write(pdf_bytes)
    tmp.close()
    return tmp.name
