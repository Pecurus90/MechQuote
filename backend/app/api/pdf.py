"""PDF preventivo (uso interno).

Il preventivo definitivo cliente lo fa il gestionale aziendale separato.
Questo PDF è il documento di lavoro per l'ufficio tecnico: tutte le
fasi, costi gerarchici, analisi margine.

Design: identità "boutique tecnica" — navy + serif elegante (Playfair
Display) per titoli, sans (Inter) per body, monospace (JetBrains Mono)
per numeri. Card per parte con page-break-inside: avoid. Box navy per
il totale finale.

Costi gerarchici (preferenza utente): le spese accessorie vivono nella
sezione di pertinenza:
- Spedizione + taglio grezzo → sotto "Materiale"
- Spedizione trattamento → sotto "Trattamento"
- Trasporto preventivo + imballaggio → riepilogo finale (sono del
  preventivo, non di una parte)
"""
import asyncio
import logging
import math
import os
import tempfile
from typing import Optional

logger = logging.getLogger(__name__)

from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import FileResponse
from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.security import require_permission
from app.models import (
    Quote, Part, ManufacturingPhase, Material, CompanySettings,
)

router = APIRouter(prefix="/api", tags=["pdf"])

_can_pdf = require_permission('quotes.pdf')


# ─── Helpers ────────────────────────────────────────────────────────────────

def _esc(text) -> str:
    """Escape HTML. Accetta None → stringa vuota."""
    if text is None:
        return ""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _fmt_time(hours: float) -> str:
    """Formatta ore come '1h30'' o '45'' o ''."""
    if not hours or hours <= 0:
        return ""
    total_min = round(hours * 60)
    if total_min < 60:
        return f"{total_min}&prime;"
    h = total_min // 60
    m = total_min % 60
    return f"{h}h{m:02d}&prime;" if m else f"{h}h"


def _fmt_eur(value: float, decimals: int = 2) -> str:
    """Formatta come monetario con virgola decimale (stile IT)."""
    if value is None:
        value = 0.0
    s = f"{value:,.{decimals}f}"
    # IT locale: 1.234,56 (oggi è en: 1,234.56) → swap
    return s.replace(",", "§").replace(".", ",").replace("§", ".")


def _fmt_date_it(d) -> str:
    """Formatta date come '08 mag 2026'. None → '—'."""
    if not d:
        return "—"
    months_it = ["gen", "feb", "mar", "apr", "mag", "giu",
                 "lug", "ago", "set", "ott", "nov", "dic"]
    try:
        return f"{d.day:02d} {months_it[d.month - 1]} {d.year}"
    except (AttributeError, IndexError):
        return str(d)[:10]


# ─── SVG icone (inline, niente fetch esterni) ───────────────────────────────

ICON_CUBE = '''<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>'''

ICON_FLAME = '''<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>'''

ICON_GEAR = '''<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'''


# ─── CSS ────────────────────────────────────────────────────────────────────

CSS = """
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');

:root {
  --navy:        #1e3a8a;
  --navy-light:  #3b5bb8;
  --navy-soft:   #eef2ff;
  --gray-900:    #0f172a;
  --gray-700:    #334155;
  --gray-500:    #64748b;
  --gray-400:    #94a3b8;
  --gray-200:    #e2e8f0;
  --gray-100:    #f1f5f9;
  --gray-50:     #f8fafc;
  --gold:        #b45309;
  --gold-soft:   #fef3c7;
}

@page { size: A4; margin: 14mm 12mm 18mm; }

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Inter', -apple-system, sans-serif;
  font-size: 10px;
  color: var(--gray-900);
  line-height: 1.45;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.num { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
.serif { font-family: 'Playfair Display', Georgia, serif; }

/* ─── Header ─────────────────────────────────────── */
.hdr {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding-bottom: 14px; margin-bottom: 4px;
}
.hdr-left { display: flex; gap: 12px; align-items: flex-start; }
.mono-box {
  width: 44px; height: 44px; background: var(--navy);
  color: #fff; display: flex; align-items: center; justify-content: center;
  border-radius: 6px; font-family: 'Playfair Display', serif;
  font-weight: 700; font-size: 18px; letter-spacing: 1px;
  flex-shrink: 0;
}
.co-name { font-family: 'Playfair Display', serif; font-size: 18px;
           font-weight: 700; color: var(--navy); line-height: 1.1; }
.co-tagline { font-size: 9px; color: var(--gray-500); margin-top: 2px;
              text-transform: uppercase; letter-spacing: 1.2px; font-weight: 500; }
.co-info { font-size: 8.5px; color: var(--gray-500); margin-top: 6px; line-height: 1.5; }

.hdr-right { text-align: right; }
.q-tag {
  display: inline-block; background: var(--navy); color: #fff;
  font-size: 8.5px; font-weight: 700; letter-spacing: 2px;
  padding: 3px 11px; border-radius: 3px; text-transform: uppercase;
}
.q-num {
  font-family: 'JetBrains Mono', monospace; font-size: 22px;
  font-weight: 700; color: var(--navy); margin-top: 5px; letter-spacing: -0.5px;
}
.q-date { font-size: 9px; color: var(--gray-500); margin-top: 4px; }

.hdr-band {
  height: 4px; background: linear-gradient(90deg, var(--navy) 0%, var(--navy-light) 100%);
  margin-bottom: 14px; border-radius: 2px;
}

/* ─── Meta bar (cliente + consegna) ────────────────── */
.meta {
  display: flex; gap: 12px; margin-bottom: 16px;
  font-size: 9.5px;
}
.meta-item { flex: 1; }
.meta-label { font-size: 8px; color: var(--gray-400);
              text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
.meta-value { font-size: 10.5px; color: var(--gray-900); margin-top: 2px;
              font-weight: 600; }

/* ─── Part card ─────────────────────────────────────── */
.part-card {
  border: 1px solid var(--gray-200); border-radius: 8px;
  margin-bottom: 14px; overflow: hidden; background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  page-break-inside: avoid; break-inside: avoid;
}

.part-head {
  background: linear-gradient(135deg, var(--navy-soft) 0%, #fff 100%);
  border-bottom: 1px solid var(--gray-200);
  padding: 10px 16px; display: flex; align-items: center;
  gap: 10px; flex-wrap: wrap;
}
.part-code { font-family: 'JetBrains Mono', monospace; font-size: 14px;
             font-weight: 700; color: var(--navy); }
.part-rev { background: var(--navy); color: #fff; font-size: 8.5px;
            font-weight: 700; padding: 2px 7px; border-radius: 3px;
            letter-spacing: 0.5px; }
.part-desc { color: var(--gray-700); font-size: 10.5px; flex: 1; min-width: 0;
             overflow: hidden; text-overflow: ellipsis; }
.part-qty {
  background: var(--navy); color: #fff; font-family: 'JetBrains Mono', monospace;
  font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 18px;
  white-space: nowrap;
}

/* Sezioni interne alla card */
.section { padding: 11px 16px 12px; border-bottom: 1px solid var(--gray-100); }
.section:last-child { border-bottom: none; }

.sec-head {
  display: flex; align-items: center; gap: 7px;
  font-size: 8.5px; font-weight: 700; letter-spacing: 1.5px;
  color: var(--navy); text-transform: uppercase; margin-bottom: 7px;
}
.sec-head svg { width: 12px; height: 12px; color: var(--navy-light); }

.sec-info { font-size: 10px; color: var(--gray-700); margin-bottom: 5px; }
.sec-info .accent { color: var(--gray-500); }

/* Badge "conto lavoro": materiale fornito dal cliente, costi materiale a 0 */
.cl-badge {
  display: inline-block; background: var(--gold-soft); color: var(--gold);
  font-size: 7.5px; font-weight: 700; letter-spacing: 1.2px;
  padding: 2px 7px; border-radius: 3px; text-transform: uppercase;
  margin-left: 8px;
}
.cl-note { font-size: 9px; color: var(--gold); font-style: italic; margin-top: 4px; }

/* Badge "a magazzino": materiale preso dalle scorte officina, override
 * shipping/cutting da CompanySettings. Più sobrio del conto lavoro
 * (grigio chiaro, non oro) — è una nota interna, non per il cliente. */
.stock-badge {
  display: inline-block; background: var(--gray-100); color: var(--gray-500);
  font-size: 7.5px; font-weight: 600; letter-spacing: 1.2px;
  padding: 2px 7px; border-radius: 3px; text-transform: uppercase;
  margin-left: 8px;
}
.stock-note { font-size: 9px; color: var(--gray-500); font-style: italic; margin-top: 4px; }

/* Tabella costi (materiale, trattamento) */
.cost-rows { font-size: 10px; }
.cost-row { display: flex; justify-content: space-between;
            padding: 2.5px 0; color: var(--gray-700); }
.cost-row .label { font-weight: 500; }
.cost-row .val { font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--gray-900); }
.cost-sub { padding-left: 14px; font-size: 9.5px; color: var(--gray-500); }
.cost-sub::before { content: '· '; color: var(--gray-400); }
.cost-divider { border-top: 1px dashed var(--gray-200); margin: 4px 0; }
.cost-total {
  display: flex; justify-content: space-between;
  padding: 5px 0 2px; font-size: 10.5px; color: var(--navy);
  font-weight: 700;
}
.cost-total .val { font-family: 'JetBrains Mono', monospace; }

/* Tabella lavorazioni */
.ops { width: 100%; border-collapse: collapse; font-size: 9.5px; margin-top: 4px; }
.ops thead td {
  background: var(--gray-50); color: var(--gray-500);
  font-size: 7.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.7px; padding: 5px 9px; border-bottom: 1px solid var(--gray-200);
}
.ops tbody td { padding: 6px 9px; border-bottom: 1px solid var(--gray-100); vertical-align: top; }
.ops tbody tr:nth-child(even) td { background: var(--gray-50); }
.ops tbody tr:last-child td { border-bottom: none; }
.ops .c-n   { width: 28px; text-align: center; color: var(--gray-400); font-family: 'JetBrains Mono', monospace; font-size: 8.5px; padding-top: 8px; }
.ops .c-op  { font-weight: 600; color: var(--gray-900); }
.ops .c-mach{ color: var(--gray-500); font-size: 9px; }
.ops .c-time{ width: 130px; color: var(--gray-700); white-space: nowrap; }
.ops .c-time .lbl { color: var(--gray-400); font-size: 8.5px; }
.ops .c-cost{ width: 70px; text-align: right; font-family: 'JetBrains Mono', monospace;
              font-weight: 700; color: var(--navy); }

/* Subtotale lavorazioni (sotto la tabella) */
.ops-sub {
  display: flex; justify-content: flex-end; gap: 22px; padding: 8px 0 0;
  font-size: 9.5px; color: var(--gray-500);
}
.ops-sub-row { display: flex; gap: 7px; align-items: baseline; }
.ops-sub-row .v { font-family: 'JetBrains Mono', monospace; color: var(--gray-900); font-weight: 600; }
.ops-sub-total { color: var(--navy); font-weight: 700; }
.ops-sub-total .v { color: var(--navy); }

/* Costo & margine box */
.pricing-box {
  background: var(--navy-soft); border-left: 3px solid var(--navy);
  padding: 10px 14px; margin-top: 4px; border-radius: 0 6px 6px 0;
}
.pricing-row { display: flex; justify-content: space-between; padding: 2px 0;
               font-size: 10px; color: var(--gray-700); }
.pricing-row .val { font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--gray-900); }
.pricing-sep { border-top: 1px dashed var(--navy-light); margin: 5px 0; opacity: 0.4; }
.pricing-final {
  display: flex; justify-content: space-between; align-items: baseline;
  padding-top: 4px;
}
.pricing-final .lbl {
  font-family: 'Playfair Display', serif; font-size: 11px;
  font-weight: 700; color: var(--navy); text-transform: uppercase; letter-spacing: 0.5px;
}
.pricing-final .val { font-family: 'JetBrains Mono', monospace; font-size: 14px;
                      font-weight: 700; color: var(--navy); }

/* No lavorazioni placeholder */
.no-ops { padding: 8px 0; color: var(--gray-400); font-style: italic; font-size: 9.5px; }

/* ─── Riepilogo finale ─────────────────────────────── */
.summary-wrap { margin-top: 18px; display: flex; justify-content: flex-end; }
.summary { min-width: 320px; border: 1px solid var(--gray-200); border-radius: 8px;
           overflow: hidden; background: #fff; box-shadow: 0 1px 3px rgba(15,23,42,0.06); }
.summary-head {
  background: var(--gray-50); padding: 6px 16px;
  font-size: 8.5px; color: var(--gray-500); text-transform: uppercase;
  letter-spacing: 1.5px; font-weight: 700; border-bottom: 1px solid var(--gray-200);
}
.summary-row { display: flex; justify-content: space-between; padding: 6px 16px;
               font-size: 10.5px; color: var(--gray-700); border-bottom: 1px solid var(--gray-100); }
.summary-row:last-of-type { border-bottom: none; }
.summary-row .val { font-family: 'JetBrains Mono', monospace; font-weight: 600;
                    color: var(--gray-900); }
.summary-row.discount { color: var(--gold); }
.summary-row.discount .val { color: var(--gold); }
.summary-total {
  background: var(--navy); color: #fff;
  padding: 11px 16px; display: flex; justify-content: space-between; align-items: baseline;
}
.summary-total .lbl {
  font-family: 'Playfair Display', serif; font-size: 12px;
  font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px;
}
.summary-total .val {
  font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 700;
}

/* ─── Note + footer ─────────────────────────────────── */
.doc-notes {
  margin-top: 14px; padding: 10px 14px; background: var(--gray-50);
  border-left: 3px solid var(--gray-400); border-radius: 0 4px 4px 0;
  font-size: 9.5px; color: var(--gray-700); line-height: 1.55;
}
.doc-notes strong { color: var(--gray-900); font-weight: 600;
                    display: block; margin-bottom: 3px; font-size: 9px;
                    text-transform: uppercase; letter-spacing: 0.8px; }
.doc-notes.internal { border-left-color: var(--gold); background: var(--gold-soft); }
.doc-notes.internal strong { color: var(--gold); }

.doc-footer {
  margin-top: 18px; padding-top: 8px; border-top: 1px solid var(--gray-200);
  font-size: 8px; color: var(--gray-400); text-align: center;
  letter-spacing: 0.5px;
}
"""


# ─── Render helpers ─────────────────────────────────────────────────────────

def _render_header(quote: Quote, cs) -> str:
    """Header con monogramma FDV + dati azienda + numero preventivo."""
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

    # Monogramma: prime 2-3 lettere maiuscole del nome azienda
    mono_letters = ''.join(w[0] for w in co_name.split()[:3]).upper()[:3] or 'FDV'

    date_str = _fmt_date_it(quote.quote_date)
    validity = quote.validity_days or 30

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
    <div class="q-tag">Preventivo</div>
    <div class="q-num">{_esc(quote.quote_number)}</div>
    <div class="q-date">{date_str} &nbsp;·&nbsp; validità {validity} giorni</div>
  </div>
</div>
<div class="hdr-band"></div>
"""


def _render_meta_bar(quote: Quote) -> str:
    """Riga cliente + riferimento + consegna."""
    items = []
    items.append(('Cliente', _esc(quote.customer_name) or '—'))
    if quote.customer_reference:
        items.append(('Riferimento', _esc(quote.customer_reference)))
    if quote.delivery_text:
        items.append(('Consegna', _esc(quote.delivery_text)))

    blocks = ''.join(
        f'<div class="meta-item"><div class="meta-label">{lbl}</div>'
        f'<div class="meta-value">{val}</div></div>'
        for lbl, val in items
    )
    return f'<div class="meta">{blocks}</div>\n'


def _render_material_section(part: Part, cur: str, cs: Optional[CompanySettings] = None) -> str:
    """Sezione materiale con sotto-voci spedizione + taglio. '' se no material."""
    mat = part.material
    if not mat:
        return ''

    qty = part.quantity or 1

    # Riga descrittiva (nome + famiglia + dimensioni grezzo + pesi)
    mat_label = _esc(mat.name)
    if mat.family:
        mat_label += f' <span class="accent">({_esc(mat.family.replace("_", " "))})</span>'

    dim_str = ''
    weight_kg = None
    if part.raw_diameter_mm:
        r = part.raw_diameter_mm / 2
        l = part.raw_z_mm or 0
        if l:
            dim_str = f'Tondo Ø{part.raw_diameter_mm:g} × {l:g} mm'
            if mat.density_kg_dm3:
                weight_kg = (math.pi * r * r * l / 1_000_000) * mat.density_kg_dm3
        else:
            dim_str = f'Tondo Ø{part.raw_diameter_mm:g} mm'
    elif part.raw_x_mm and part.raw_y_mm and part.raw_z_mm:
        dim_str = f'Prismatico {part.raw_x_mm:g} × {part.raw_y_mm:g} × {part.raw_z_mm:g} mm'
        if mat.density_kg_dm3:
            weight_kg = (part.raw_x_mm * part.raw_y_mm * part.raw_z_mm / 1_000_000) * mat.density_kg_dm3

    info_parts = []
    if dim_str:
        info_parts.append(dim_str)
    if weight_kg:
        info_parts.append(f'<span class="accent">~{weight_kg:.3f} kg grezzo</span>')
    if part.finished_weight_kg:
        info_parts.append(f'<span class="accent">{part.finished_weight_kg:.3f} kg finito</span>')
    info_line = ' &nbsp;·&nbsp; '.join(info_parts) if info_parts else ''

    # Conto lavoro: niente costi materiale, ma il riferimento + dimensioni
    # restano visibili (utili per autocalc EDM, peso finito, info cliente).
    if part.customer_supplied_material:
        return f"""
<div class="section">
  <div class="sec-head">{ICON_CUBE}<span>Materiale</span><span class="cl-badge">Conto lavoro</span></div>
  <div class="sec-info">{mat_label}</div>
  {('<div class="sec-info">' + info_line + '</div>') if info_line else ''}
  <div class="cl-note">Materiale fornito dal cliente — nessun costo materiale a carico dell'officina.</div>
</div>
"""

    # Costi: grezzo + spedizione/pezzo + taglio/pezzo.
    # Per `material_from_stock`: shipping e cutting provengono dagli override
    # CompanySettings (già scritti dal cost engine in part.material_delivery_cost
    # e applicati alla quotazione). Mostriamo i valori effettivi che il backend
    # ha calcolato — la differenza nel PDF è solo la nota "a magazzino".
    delivery_pp = (part.material_delivery_cost or 0.0) / qty
    if part.material_from_stock:
        # Override globale: cutting da CompanySettings (non dal supplier).
        cutting_pp = (cs.stock_cutting_cost_per_part or 0.0) if cs else 0.0
    else:
        cutting_pp = (mat.material_supplier.cutting_cost_per_part or 0.0) if mat.material_supplier else 0.0
    raw_cost = part.material_cost or 0.0
    total_mat = raw_cost + delivery_pp + cutting_pp

    sub_rows = ''
    if delivery_pp > 0.005:
        sub_rows += f'<div class="cost-row cost-sub"><span class="label">Spedizione</span><span class="val">{_fmt_eur(delivery_pp)} {cur}</span></div>'
    if cutting_pp > 0.005:
        sub_rows += f'<div class="cost-row cost-sub"><span class="label">Taglio grezzo</span><span class="val">{_fmt_eur(cutting_pp)} {cur}</span></div>'

    badge = '<span class="stock-badge">A magazzino</span>' if part.material_from_stock else ''
    note = ('<div class="stock-note">Materiale prelevato dalle scorte officina.</div>'
            if part.material_from_stock else '')

    return f"""
<div class="section">
  <div class="sec-head">{ICON_CUBE}<span>Materiale</span>{badge}</div>
  <div class="sec-info">{mat_label}</div>
  {('<div class="sec-info">' + info_line + '</div>') if info_line else ''}
  {note}
  <div class="cost-rows">
    <div class="cost-row"><span class="label">Costo grezzo</span><span class="val">{_fmt_eur(raw_cost)} {cur}/pz</span></div>
    {sub_rows}
    <div class="cost-divider"></div>
    <div class="cost-total"><span>Totale materiale</span><span class="val">{_fmt_eur(total_mat)} {cur}/pz</span></div>
  </div>
</div>
"""


def _render_treatment_section(part: Part, cur: str) -> str:
    """Sezione trattamento. '' se la parte non ha fasi treatment."""
    treat_phases = [ph for ph in part.phases if ph.treatment_id]
    if not treat_phases:
        return ''

    qty = part.quantity or 1
    blocks = []
    for ph in treat_phases:
        t = ph.treatment
        name = _esc(t.name) if t else _esc(ph.description or '—')
        supplier = ''
        if t and t.supplier:
            supplier = f' <span class="accent">— {_esc(t.supplier.name)}</span>'

        var_cost = ph.variable_cost_per_part or 0.0
        ship_pp = (ph.fixed_cost or 0.0) / qty
        total_t = var_cost + ship_pp

        sub_rows = ''
        if ship_pp > 0.005:
            sub_rows += f'<div class="cost-row cost-sub"><span class="label">Spedizione</span><span class="val">{_fmt_eur(ship_pp)} {cur}</span></div>'

        blocks.append(f"""
  <div class="sec-info">{name}{supplier}</div>
  <div class="cost-rows" style="margin-bottom: 4px;">
    <div class="cost-row"><span class="label">Costo trattamento</span><span class="val">{_fmt_eur(var_cost)} {cur}/pz</span></div>
    {sub_rows}
    <div class="cost-divider"></div>
    <div class="cost-total"><span>Totale trattamento</span><span class="val">{_fmt_eur(total_t)} {cur}/pz</span></div>
  </div>
""")

    return f"""
<div class="section">
  <div class="sec-head">{ICON_FLAME}<span>Trattamento</span></div>
  {''.join(blocks)}
</div>
"""


def _render_phases_table(part: Part, cur: str) -> str:
    """Tabella lavorazioni (esclude fasi treatment, che vivono nella sezione dedicata).

    Sotto la tabella: subtotale separato Attrezzaggio + Lavorazione + Totale.
    """
    work_phases = [ph for ph in part.phases if not ph.treatment_id]
    if not work_phases:
        return f"""
<div class="section">
  <div class="sec-head">{ICON_GEAR}<span>Lavorazioni</span></div>
  <div class="no-ops">Nessuna lavorazione definita.</div>
</div>
"""

    qty = part.quantity or 1
    n_parts_in_quote = len(part.quote.parts) if part.quote else 1

    rows = []
    setup_total = 0.0
    cycle_total = 0.0

    for ph in work_phases:
        # Calcolo split setup vs lavorazione (mirror della formula del cost engine).
        work_rate = ph.hourly_rate_override
        if work_rate is None:
            work_rate = ph.machine.hourly_rate if ph.machine else 0.0
        if ph.machine and ph.machine.setup_hourly_rate is not None:
            setup_rate = ph.machine.setup_hourly_rate
        else:
            setup_rate = work_rate
        divisor = qty  # is_shared rimosso dal cost engine

        setup_cost_pp = (ph.setup_hours or 0.0) * setup_rate / divisor
        cycle_cost_pp = (ph.cycle_hours_per_part or 0.0) * work_rate
        fixed_pp = (ph.fixed_cost or 0.0) / divisor
        var_pp = ph.variable_cost_per_part or 0.0
        total_pp = setup_cost_pp + cycle_cost_pp + fixed_pp + var_pp

        setup_total += setup_cost_pp
        cycle_total += cycle_cost_pp + fixed_pp + var_pp  # tutto il "non-setup" qui

        # Etichetta lavorazione: operation.name → description → '—'
        op_name = (ph.operation.name if ph.operation else None) or ph.description or '—'

        mach_name = ph.machine.name if ph.machine else (ph.supplier.name if ph.supplier else '')

        setup_str = _fmt_time(ph.setup_hours or 0)
        cycle_str = _fmt_time(ph.cycle_hours_per_part or 0)

        time_html = ''
        if setup_str:
            time_html += f'<div><span class="lbl">Attr.</span> {setup_str}</div>'
        if cycle_str:
            time_html += f'<div><span class="lbl">Ciclo</span> {cycle_str}/pz</div>'
        if not time_html:
            time_html = '<div class="lbl">—</div>'

        rows.append(f"""
<tr>
  <td class="c-n">{ph.sequence_number}</td>
  <td>
    <div class="c-op">{_esc(op_name)}</div>
    {('<div class="c-mach">' + _esc(mach_name) + '</div>') if mach_name else ''}
  </td>
  <td class="c-time">{time_html}</td>
  <td class="c-cost">{_fmt_eur(total_pp)}</td>
</tr>
""")

    grand_total = setup_total + cycle_total

    return f"""
<div class="section">
  <div class="sec-head">{ICON_GEAR}<span>Lavorazioni</span></div>
  <table class="ops">
    <thead>
      <tr>
        <td class="c-n">#</td>
        <td>Lavorazione</td>
        <td class="c-time">Tempi</td>
        <td class="c-cost">€/pz</td>
      </tr>
    </thead>
    <tbody>{''.join(rows)}</tbody>
  </table>
  <div class="ops-sub">
    <div class="ops-sub-row"><span>Attrezzaggio</span><span class="v">{_fmt_eur(setup_total)} {cur}/pz</span></div>
    <div class="ops-sub-row"><span>Lavorazione</span><span class="v">{_fmt_eur(cycle_total)} {cur}/pz</span></div>
    <div class="ops-sub-row ops-sub-total"><span>Totale</span><span class="v">{_fmt_eur(grand_total)} {cur}/pz</span></div>
  </div>
</div>
"""


def _render_part_pricing(part: Part, quote: Quote, cur: str) -> str:
    """Box costo & margine finale per la singola parte."""
    qty = part.quantity or 1
    margin = part.margin_percent if part.margin_percent is not None else (quote.global_margin_percent or 0.0)

    return f"""
<div class="section">
  <div class="pricing-box">
    <div class="pricing-row"><span>Costo/pz</span><span class="val">{_fmt_eur(part.total_cost or 0)} {cur}</span></div>
    <div class="pricing-row"><span>Margine</span><span class="val">{margin:.0f}%</span></div>
    <div class="pricing-row"><span>Prezzo unitario</span><span class="val">{_fmt_eur(part.unit_price or 0)} {cur}</span></div>
    <div class="pricing-sep"></div>
    <div class="pricing-final">
      <span class="lbl">Totale × {qty} pz</span>
      <span class="val">{_fmt_eur(part.total_price or 0)} {cur}</span>
    </div>
  </div>
</div>
"""


def _render_part(part: Part, quote: Quote, cur: str, cs: Optional[CompanySettings] = None) -> str:
    """Card completa di una parte: header + sezioni + pricing."""
    qty = part.quantity or 1
    rev = part.revision or ""
    rev_html = f'<span class="part-rev">Rev. {_esc(rev)}</span>' if rev and rev != 'A' else ''
    desc_html = f'<span class="part-desc">{_esc(part.description)}</span>' if part.description else ''

    return f"""
<div class="part-card">
  <div class="part-head">
    <span class="part-code">{_esc(part.part_code)}</span>
    {rev_html}
    {desc_html}
    <span class="part-qty">Qtà × {qty}</span>
  </div>
  {_render_material_section(part, cur, cs)}
  {_render_treatment_section(part, cur)}
  {_render_phases_table(part, cur)}
  {_render_part_pricing(part, quote, cur)}
</div>
"""


def _render_totals(parts, quote: Quote, cur: str) -> str:
    """Riepilogo finale con subtotale + extra preventivo + box totale navy."""
    subtotal = sum((p.total_price or 0) for p in parts)
    transport = quote.transport_cost or 0
    packaging = quote.packaging_cost or 0
    discount_pct = quote.global_discount_percent or 0
    after_extras = subtotal + transport + packaging
    discount_amount = round(after_extras * discount_pct / 100, 2)
    total = round(after_extras - discount_amount, 2)

    rows = [f'<div class="summary-row"><span>Subtotale parti</span><span class="val">{_fmt_eur(subtotal)} {cur}</span></div>']
    if transport:
        rows.append(f'<div class="summary-row"><span>Trasporto preventivo</span><span class="val">{_fmt_eur(transport)} {cur}</span></div>')
    if packaging:
        rows.append(f'<div class="summary-row"><span>Imballaggio</span><span class="val">{_fmt_eur(packaging)} {cur}</span></div>')
    if discount_pct:
        rows.append(f'<div class="summary-row discount"><span>Sconto {discount_pct:g}%</span><span class="val">− {_fmt_eur(discount_amount)} {cur}</span></div>')

    return f"""
<div class="summary-wrap">
  <div class="summary">
    <div class="summary-head">Riepilogo</div>
    {''.join(rows)}
    <div class="summary-total">
      <span class="lbl">Totale preventivo</span>
      <span class="val">{_fmt_eur(total)} {cur}</span>
    </div>
  </div>
</div>
"""


def _render_notes(quote: Quote) -> str:
    """Blocchi note (cliente + interne) se presenti."""
    out = ''
    if quote.notes_customer:
        out += f'<div class="doc-notes"><strong>Note</strong>{_esc(quote.notes_customer)}</div>\n'
    if quote.notes_internal:
        out += f'<div class="doc-notes internal"><strong>Note interne</strong>{_esc(quote.notes_internal)}</div>\n'
    return out


def _render_footer(cs) -> str:
    co_name = (cs.name if cs and cs.name else 'Fratelli Dalla Via')
    return f'<div class="doc-footer">{_esc(co_name)} &nbsp;·&nbsp; Documento generato da MechQuote</div>\n'


# ─── Generazione PDF ────────────────────────────────────────────────────────

def _render_die_section(quote: Quote, cur: str) -> str:
    """Sezione PDF dedicata ai preventivi stampo (quote_type='die'):
    parametri dello stampo + tabella costi L1-L7 + prezzo finale.
    """
    spec = quote.die_spec
    if not spec:
        return ''
    subtype = 'a passo (progressivo)' if spec.die_subtype == 'passo' else 'a blocco'
    diff_label = {'base': 'Base', 'medium': 'Medio', 'hard': 'Difficile'}.get(spec.difficulty, spec.difficulty)
    margin = quote.global_margin_percent or 0
    discount = quote.global_discount_percent or 0
    industrial = spec.cost_industrial or 0
    markup = industrial * margin / 100
    lordo = industrial + markup
    sconto = lordo * discount / 100
    finale = lordo - sconto

    return f'''
<section style="margin:18px 0">
  <h2 style="font-size:13px;border-bottom:1px solid #e5e7eb;padding-bottom:4px;color:#9f1239">Stampo {subtype}</h2>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:11px;margin:8px 0">
    <div><strong>Pezzo:</strong> {spec.bbox_x_mm:.1f}×{spec.bbox_y_mm:.1f}×{spec.sheet_thickness_mm:.1f} mm</div>
    <div><strong>Difficoltà:</strong> {diff_label}</div>
    <div><strong>Pieghe:</strong> {spec.n_bends_simple + spec.n_bends_medium + spec.n_bends_complex}
      <span style="color:#999">({spec.n_bends_simple}S+{spec.n_bends_medium}M+{spec.n_bends_complex}C)</span></div>
    <div><strong>Punzoni:</strong> {spec.n_punches_simple + spec.n_punches_medium + spec.n_punches_complex}
      <span style="color:#999">({spec.n_punches_simple}S+{spec.n_punches_medium}M+{spec.n_punches_complex}C)</span></div>
    {f'<div><strong>N° stazioni:</strong> {spec.n_stations}</div>' if spec.die_subtype == 'passo' and spec.n_stations else ''}
    {f'<div><strong>Passo:</strong> {spec.pitch_mm:.1f} mm</div>' if spec.die_subtype == 'passo' and spec.pitch_mm else ''}
    {f'<div><strong>Consegna:</strong> {spec.delivery_days} gg lavorativi</div>' if spec.delivery_days else ''}
  </div>
  {f'<p style="font-size:11px;margin:6px 0"><strong>Note tecniche:</strong> {_esc(spec.technical_notes)}</p>' if spec.technical_notes else ''}
  <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:12px">
    <tr><td style="padding:4px 8px">Materiale piastre</td><td style="text-align:right;padding:4px 8px">{_fmt_eur(spec.cost_material)} {cur}</td></tr>
    <tr><td style="padding:4px 8px">Normalizzati</td><td style="text-align:right;padding:4px 8px">{_fmt_eur(spec.cost_normalized)} {cur}</td></tr>
    <tr><td style="padding:4px 8px">Lavorazioni meccaniche</td><td style="text-align:right;padding:4px 8px">{_fmt_eur(spec.cost_machining)} {cur}</td></tr>
    <tr><td style="padding:4px 8px">Accessori (progettazione + montaggio + extras)</td><td style="text-align:right;padding:4px 8px">{_fmt_eur(spec.cost_accessories)} {cur}</td></tr>
    <tr style="border-top:2px solid #ccc"><td style="padding:6px 8px;font-weight:bold">Costo industriale</td><td style="text-align:right;padding:6px 8px;font-weight:bold">{_fmt_eur(industrial)} {cur}</td></tr>
    <tr><td style="padding:4px 8px;color:#666">Margine {margin:.0f}%</td><td style="text-align:right;padding:4px 8px;color:#666">{_fmt_eur(markup)} {cur}</td></tr>
    <tr style="border-top:1px solid #ccc"><td style="padding:4px 8px">Prezzo lordo</td><td style="text-align:right;padding:4px 8px">{_fmt_eur(lordo)} {cur}</td></tr>
    {f'<tr><td style="padding:4px 8px;color:#999">Sconto cliente {discount:.0f}%</td><td style="text-align:right;padding:4px 8px;color:#dc2626">-{_fmt_eur(sconto)} {cur}</td></tr>' if discount > 0 else ''}
    <tr style="border-top:2px solid #9f1239;background:#fff1f2"><td style="padding:8px;font-weight:bold;color:#9f1239;text-transform:uppercase;font-size:11px">Prezzo finale</td><td style="text-align:right;padding:8px;font-weight:bold;color:#9f1239;font-size:16px">{_fmt_eur(finale)} {cur}</td></tr>
  </table>
</section>
'''


def generate_quote_pdf(quote_id: int, db: Session) -> str:
    """Genera il PDF preventivo (uso interno) e ritorna il path del file temp.

    Il chiamante è responsabile di pulire il file (via BackgroundTasks).
    """
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")

    parts = db.query(Part).options(
        joinedload(Part.material).joinedload(Material.material_supplier),
        joinedload(Part.phases).options(
            joinedload(ManufacturingPhase.machine),
            joinedload(ManufacturingPhase.supplier),
            joinedload(ManufacturingPhase.treatment),
            joinedload(ManufacturingPhase.operation),
        ),
        joinedload(Part.normalized_items),
    ).filter(Part.quote_id == quote_id).order_by(Part.id).all()

    cs = db.query(CompanySettings).filter(CompanySettings.id == 1).first()
    cur = _esc(quote.currency) or "EUR"

    # Pre-popola la relazione quote in sessione: alcune query downstream
    # accedono a part.quote per ottenere quote_number/customer_name senza
    # un roundtrip extra. is_shared/n_parts non più rilevanti (rimossi).
    for p in parts:
        p.quote = quote

    html_parts = [
        '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">',
        f'<style>{CSS}</style></head><body>',
        _render_header(quote, cs),
        _render_meta_bar(quote),
    ]
    # Preventivatore Stampi: sezione dedicata coi parametri + tabella L1-L7
    # PRIMA delle parti standard. Le piastre (Part) sono renderizzate dopo
    # con il pattern generico (materiali, trattamenti, costo unitario).
    if quote.quote_type == 'die':
        html_parts.append(_render_die_section(quote, cur))
    if not parts:
        # Avviso esplicito invece di un PDF muto: senza questo blocco l'utente
        # scarica un PDF con solo intestazione + totali a zero, senza capire
        # che mancano le parti.
        logger.warning("PDF richiesto su quote vuoto: id=%s number=%r", quote_id, quote.quote_number)
        html_parts.append(
            '<div style="margin:40px 20px;padding:20px;border:2px dashed #d97706;'
            'background:#fffbeb;border-radius:6px;color:#92400e;">'
            '<strong>⚠ Preventivo senza componenti.</strong> '
            'Aggiungi almeno una parte per ottenere costi e prezzi calcolati.'
            '</div>'
        )
    else:
        for part in parts:
            html_parts.append(_render_part(part, quote, cur, cs))

    html_parts.append(_render_totals(parts, quote, cur))
    html_parts.append(_render_notes(quote))
    html_parts.append(_render_footer(cs))
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
        prefix=f"preventivo_{quote_id}_"
    )
    tmp.write(pdf_bytes)
    tmp.close()
    return tmp.name


# `generate_quote_pdf` usa Playwright sync_api: ~2-5s di rendering Chromium
# bloccante. Wrappato in `asyncio.to_thread`: il worker uvicorn resta libero
# a servire altre richieste mentre il PDF si genera in un thread separato.

@router.get("/quotes/{quote_id}/pdf")
async def get_quote_pdf(quote_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), _=_can_pdf):
    path = await asyncio.to_thread(generate_quote_pdf, quote_id, db)
    background_tasks.add_task(os.unlink, path)
    return FileResponse(
        path=path,
        media_type='application/pdf',
        filename=f"preventivo_{quote_id}.pdf"
    )
