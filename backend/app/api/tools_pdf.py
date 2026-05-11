"""PDF ordine utensili low-stock — stesso look del PDF preventivo/materiali.

Aggregato per fornitore: una card per fornitore con tabella di utensili
sotto la quantità minima. Quantità da ordinare = max(min - corrente, 1).

Niente storico/snapshot: il PDF rigenera ogni volta lo stato corrente
del magazzino. Lo "storico" sarà eventualmente un'evoluzione futura.
"""
import tempfile
from collections import defaultdict
from typing import Dict, List

from sqlalchemy.orm import Session, joinedload

from app.api.pdf import CSS, ICON_CUBE, _esc, _fmt_date_it
from app.core.database import utc_now
from app.models import CompanySettings, Tool


# CSS aggiuntivo per le colonne specifiche dell'ordine utensili
EXTRA_CSS = """
.tool-code  { width: 130px; font-family: 'JetBrains Mono', monospace; font-size: 9px; color: var(--gray-900); font-weight: 600; }
.tool-spec  { color: var(--gray-700); }
.tool-spec .accent { color: var(--gray-500); font-size: 9px; }
.tool-loc   { width: 60px; font-family: 'JetBrains Mono', monospace; font-size: 9px; color: var(--gray-500); }
.tool-qty   { width: 55px; text-align: right; font-family: 'JetBrains Mono', monospace; }
.tool-qty.low { color: #b91c1c; font-weight: 700; }
.tool-min   { width: 50px; text-align: right; font-family: 'JetBrains Mono', monospace; color: var(--gray-500); }
.tool-order { width: 65px; text-align: right; font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--navy); }
"""


def _render_header(cs) -> str:
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
    date_str = _fmt_date_it(utc_now().date())
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
    <div class="q-num">{date_str.replace(' ', '-').upper()}</div>
    <div class="q-date">Utensili sotto quantità minima</div>
  </div>
</div>
<div class="hdr-band"></div>
"""


def _render_meta(total_tools: int, total_qty_to_order: int) -> str:
    return f"""
<div class="meta">
  <div class="meta-item">
    <div class="meta-label">Utensili</div>
    <div class="meta-value">{total_tools}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Quantità totale</div>
    <div class="meta-value">{total_qty_to_order} pz</div>
  </div>
  <div class="meta-item" style="flex: 2;">
    <div class="meta-label">Stato</div>
    <div class="meta-value" style="font-size: 9.5px; color: var(--gold);">
      Tutti gli utensili sotto la quantità minima configurata
    </div>
  </div>
</div>
"""


def _render_supplier_card(supplier_name: str, tools: List[Tool]) -> str:
    rows = []
    for i, t in enumerate(tools, start=1):
        qty_order = max(t.minimum_quantity - t.quantity, 1)
        spec_parts = []
        if t.brand or t.model:
            top = ' '.join(filter(None, [t.brand, t.model]))
            spec_parts.append(f'<div>{_esc(top)}</div>')
        sub_parts = []
        if t.tool_type:
            sub_parts.append(_esc(t.tool_type))
        if t.diameter_mm:
            sub_parts.append(f'Ø{t.diameter_mm:g} mm')
        if t.material:
            sub_parts.append(_esc(t.material))
        if sub_parts:
            spec_parts.append(f'<div class="accent">{" · ".join(sub_parts)}</div>')
        spec_html = ''.join(spec_parts) or '—'

        rows.append(f"""
<tr>
  <td class="c-n">{i}</td>
  <td class="tool-code">{_esc(t.code)}</td>
  <td class="tool-spec">{spec_html}</td>
  <td class="tool-loc">{_esc(t.location or '')}</td>
  <td class="tool-qty low">{t.quantity}</td>
  <td class="tool-min">{t.minimum_quantity}</td>
  <td class="tool-order">{qty_order}</td>
</tr>
""")
    return f"""
<div class="part-card">
  <div class="part-head">
    <span class="part-code">{_esc(supplier_name)}</span>
    <span class="part-desc">{len(tools)} {'utensile' if len(tools) == 1 else 'utensili'}</span>
  </div>
  <div class="section">
    <div class="sec-head">{ICON_CUBE}<span>Utensili da ordinare</span></div>
    <table class="ops">
      <thead>
        <tr>
          <td class="c-n">#</td>
          <td class="tool-code">Codice</td>
          <td>Tipo / Marchio / Modello</td>
          <td class="tool-loc">Pos.</td>
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


def generate_tools_low_stock_pdf(db: Session) -> str:
    """Genera il PDF dell'ordine utensili sotto-minimo, raggruppato per fornitore."""
    low_stock = db.query(Tool).options(joinedload(Tool.supplier)).filter(
        Tool.active == True,  # noqa: E712
        Tool.quantity < Tool.minimum_quantity,
        Tool.minimum_quantity > 0,
    ).order_by(Tool.code).all()

    cs = db.query(CompanySettings).filter(CompanySettings.id == 1).first()
    co_name = (cs.name if cs and cs.name else 'Fratelli Dalla Via')

    # Raggruppo per supplier
    by_supplier: Dict[str, List[Tool]] = defaultdict(list)
    for t in low_stock:
        name = t.supplier.name if t.supplier else 'Senza fornitore'
        by_supplier[name].append(t)

    total_qty = sum(max(t.minimum_quantity - t.quantity, 1) for t in low_stock)

    html_parts = [
        '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">',
        f'<style>{CSS}{EXTRA_CSS}</style></head><body>',
        _render_header(cs),
        _render_meta(len(low_stock), total_qty),
    ]

    if not low_stock:
        html_parts.append(
            '<div class="part-card"><div class="section">'
            '<div class="no-ops">Nessun utensile sotto la quantità minima. '
            'Tutti gli utensili in stock sono sopra soglia configurata.</div>'
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
        prefix=f"ordine_utensili_",
    )
    tmp.write(pdf_bytes)
    tmp.close()
    return tmp.name
