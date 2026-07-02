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
from app.core.quote_types import is_die
from app.core.security import require_any_permission
from app.models import (
    Quote, Part, ManufacturingPhase, Material, CompanySettings,
    DieSpec, DieNormalizedItem,
)

router = APIRouter(prefix="/api", tags=["pdf"])

# Endpoint condiviso: chi ha `quotes.pdf` può scaricare il PDF di un preventivo
# standard, chi ha `dies.pdf` può scaricare il PDF di un preventivo stampo.
# Backend non distingue al gating: chi ha l'una o l'altra può richiedere il PDF;
# se in pratica l'utente clicca su un quote_type che non corrisponde al suo
# permesso, il bottone PDF sarà nascosto dal frontend (gating UI separato).
_can_pdf = require_any_permission('quotes.pdf', 'dies.pdf')


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


def _fmt_eur_unit(value: float) -> str:
    """Formatta un prezzo unitario: minimo 2 decimali, fino a 4, taglia gli
    zeri finali oltre il 2° decimale. Stile IT (virgola decimale).
    Gemello DRY di `fmtUnitPrice` (frontend/src/lib/utils.ts).
    """
    if value is None:
        value = 0.0
    s = f"{value:,.4f}"
    import re
    s = re.sub(r"(\.\d{2})(\d*?)0+$", r"\1\2", s)
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
    <div class="pricing-row"><span>Prezzo unitario</span><span class="val">{_fmt_eur_unit(part.unit_price or 0)} {cur}</span></div>
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


# ─── Modulo Stampi: PDF dedicato ────────────────────────────────────────────

_PLATE_ROLE_LABELS = {
    'cappello': 'Cappello',
    'porta_punzoni': 'Porta punzoni',
    'premilamiera': 'Premilamiera',
    'matrice': 'Matrice',
    'base': 'Base',
}

_DIFFICULTY_LABELS = {'base': 'Base', 'medium': 'Media', 'hard': 'Alta'}


def _render_die_quote(quote: Quote, spec: DieSpec, parts, items, cur: str) -> str:
    """Render contenuto specifico stampo: dati, piastre, normalizzati, L1-L7.

    Pensato per essere chiamato DOPO header + meta-bar, e PRIMA di
    notes + footer. Restituisce frammento HTML.
    """
    margin = quote.global_margin_percent or 0.0
    discount = quote.global_discount_percent or 0.0

    eff_material    = spec.override_material    if spec.override_material    is not None else spec.cost_material
    eff_normalized  = spec.override_normalized  if spec.override_normalized  is not None else spec.cost_normalized
    eff_machining   = spec.override_machining   if spec.override_machining   is not None else spec.cost_machining
    eff_accessories = spec.override_accessories if spec.override_accessories is not None else spec.cost_accessories

    industrial = eff_material + eff_normalized + eff_machining + eff_accessories
    with_margin = industrial * (1 + margin / 100)
    final_price = with_margin * (1 - discount / 100)

    def _override_marker(override) -> str:
        return ' <span style="color:#d97706;font-size:9px;">[manuale]</span>' if override is not None else ''

    # ── Box dati stampo
    parts_html = [
        '<div class="part-card">',
        '<div class="part-card-header"><span class="part-card-title">Dati stampo</span></div>',
        '<table class="data-table" style="width:100%;border-collapse:collapse;">',
        f'<tr><td><strong>Tipo</strong></td><td>{_esc(spec.die_subtype)}</td>'
        f'<td><strong>Difficoltà</strong></td><td colspan="3">{_esc(_DIFFICULTY_LABELS.get(spec.difficulty or "base"))}</td></tr>',
        f'<tr><td><strong>Pezzo X×Y</strong></td>'
        f'<td>{_fmt_eur(spec.bbox_x_mm or 0, 1)} × {_fmt_eur(spec.bbox_y_mm or 0, 1)} mm</td>'
        f'<td><strong>Spessore</strong></td><td>{_fmt_eur(spec.sheet_thickness_mm or 0, 2)} mm</td>'
        f'<td><strong>Consegna</strong></td><td>{spec.delivery_days or "—"} gg</td></tr>',
        f'<tr><td><strong>Pieghe</strong></td>'
        f'<td colspan="2">{spec.n_bends_simple or 0} sempl. + {spec.n_bends_medium or 0} med. + {spec.n_bends_complex or 0} compl.</td>'
        f'<td><strong>Punzoni</strong></td>'
        f'<td colspan="2">{spec.n_punches_simple or 0} sempl. + {spec.n_punches_medium or 0} med. + {spec.n_punches_complex or 0} compl.</td></tr>',
        '</table>',
        '</div>',
    ]

    # ── Box piastre
    if parts:
        parts_html.append('<div class="part-card">')
        parts_html.append('<div class="part-card-header"><span class="part-card-title">Piastre castello</span></div>')
        parts_html.append('<table class="phases-table" style="width:100%;border-collapse:collapse;font-size:11px;">')
        parts_html.append(
            '<thead><tr style="background:#f9fafb;">'
            '<th style="text-align:left;padding:6px 8px;">Ruolo</th>'
            '<th style="text-align:left;padding:6px 8px;">Materiale</th>'
            '<th style="text-align:right;padding:6px 8px;">X × Y × Z (mm)</th>'
            '<th style="text-align:right;padding:6px 8px;">Costo (€)</th>'
            '</tr></thead><tbody>'
        )
        for p in parts:
            role = _PLATE_ROLE_LABELS.get(p.plate_role or '', p.plate_role or '—')
            mat = p.material.name if p.material else '—'
            dims = (
                f"{_fmt_eur(p.raw_x_mm or 0, 1)} × {_fmt_eur(p.raw_y_mm or 0, 1)} × {_fmt_eur(p.raw_z_mm or 0, 1)}"
            )
            parts_html.append(
                f'<tr style="border-top:1px solid #e5e7eb;">'
                f'<td style="padding:5px 8px;">{_esc(role)}</td>'
                f'<td style="padding:5px 8px;">{_esc(mat)}</td>'
                f'<td style="padding:5px 8px;text-align:right;">{dims}</td>'
                f'<td style="padding:5px 8px;text-align:right;">{_fmt_eur(p.total_cost or 0)} {cur}</td>'
                f'</tr>'
            )
        parts_html.append('</tbody></table></div>')

    # ── Box normalizzati (raggruppati per supplier)
    if items:
        from collections import defaultdict
        groups: dict = defaultdict(list)
        for it in items:
            key = it.supplier.name if it.supplier else 'Senza fornitore'
            groups[key].append(it)
        parts_html.append('<div class="part-card">')
        parts_html.append('<div class="part-card-header"><span class="part-card-title">Normalizzati</span></div>')
        for supplier_name, group in groups.items():
            parts_html.append(f'<div style="font-weight:600;margin:8px 0 4px;">{_esc(supplier_name)}</div>')
            parts_html.append('<table class="phases-table" style="width:100%;border-collapse:collapse;font-size:11px;">')
            parts_html.append(
                '<thead><tr style="background:#f9fafb;">'
                '<th style="text-align:left;padding:5px 8px;">Descrizione</th>'
                '<th style="text-align:right;padding:5px 8px;width:60px;">Qty</th>'
                '<th style="text-align:right;padding:5px 8px;width:90px;">€/u</th>'
                '<th style="text-align:right;padding:5px 8px;width:90px;">Totale</th>'
                '</tr></thead><tbody>'
            )
            for it in group:
                tot = (it.quantity or 0) * (it.unit_price or 0.0)
                parts_html.append(
                    f'<tr style="border-top:1px solid #e5e7eb;">'
                    f'<td style="padding:4px 8px;">{_esc(it.description)}</td>'
                    f'<td style="padding:4px 8px;text-align:right;">{it.quantity or 0}</td>'
                    f'<td style="padding:4px 8px;text-align:right;">{_fmt_eur(it.unit_price or 0)}</td>'
                    f'<td style="padding:4px 8px;text-align:right;">{_fmt_eur(tot)}</td>'
                    f'</tr>'
                )
            parts_html.append('</tbody></table>')
        parts_html.append('</div>')

    # ── Riepilogo costi L1-L7
    parts_html.append('<div class="part-card">')
    parts_html.append('<div class="part-card-header"><span class="part-card-title">Riepilogo costi</span></div>')
    parts_html.append('<table class="cost-table" style="width:100%;border-collapse:collapse;font-size:12px;">')
    rows = [
        ('L1 Materiale piastre',   eff_material,   spec.override_material),
        ('L2 Normalizzati + spedizione', eff_normalized, spec.override_normalized),
        ('L3 Lavorazione stampo', eff_machining, spec.override_machining),
        ('L4 Accessori (design + montaggio + extras)', eff_accessories, spec.override_accessories),
    ]
    for label, value, override in rows:
        parts_html.append(
            f'<tr style="border-bottom:1px solid #e5e7eb;">'
            f'<td style="padding:6px 8px;">{label}{_override_marker(override)}</td>'
            f'<td style="padding:6px 8px;text-align:right;">{_fmt_eur(value)} {cur}</td>'
            f'</tr>'
        )
        # Sprint F4 — sotto la riga L3, breakdown mech/EDM se presenti.
        if label == 'L3 Lavorazione stampo' and override is None:
            mech = spec.cost_machining_mech or 0.0
            edm = spec.cost_machining_edm or 0.0
            if mech > 0:
                parts_html.append(
                    f'<tr style="border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:11px;">'
                    f'<td style="padding:3px 8px 3px 24px;">↳ Lavorazione meccanica piastre</td>'
                    f'<td style="padding:3px 8px;text-align:right;">{_fmt_eur(mech)} {cur}</td>'
                    f'</tr>'
                )
            if edm > 0:
                parts_html.append(
                    f'<tr style="border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:11px;">'
                    f'<td style="padding:3px 8px 3px 24px;">↳ EDM filo (matrice + estrattore)</td>'
                    f'<td style="padding:3px 8px;text-align:right;">{_fmt_eur(edm)} {cur}</td>'
                    f'</tr>'
                )
    parts_html.append(
        f'<tr style="background:#f3f4f6;font-weight:600;">'
        f'<td style="padding:7px 8px;">L5 Costo industriale</td>'
        f'<td style="padding:7px 8px;text-align:right;">{_fmt_eur(industrial)} {cur}</td>'
        f'</tr>'
    )
    parts_html.append(
        f'<tr><td style="padding:5px 8px;">L6 Margine ({_fmt_eur(margin, 1)}%)</td>'
        f'<td style="padding:5px 8px;text-align:right;">+ {_fmt_eur(with_margin - industrial)} {cur}</td></tr>'
    )
    if discount > 0:
        parts_html.append(
            f'<tr><td style="padding:5px 8px;">L7 Sconto ({_fmt_eur(discount, 1)}%)</td>'
            f'<td style="padding:5px 8px;text-align:right;color:#6b7280;">− {_fmt_eur(with_margin - final_price)} {cur}</td></tr>'
        )
    parts_html.append('</table></div>')

    # ── Prezzo finale (grande)
    parts_html.append(
        f'<div class="totals" style="padding:18px 24px;display:flex;justify-content:space-between;align-items:baseline;background:#1e293b;color:#fff;border-radius:6px;">'
        f'<span style="font-size:13px;opacity:.85;">Prezzo finale</span>'
        f'<span style="font-size:26px;font-weight:700;">{_fmt_eur(final_price)} {cur}</span>'
        f'</div>'
    )

    return ''.join(parts_html)


# ─── Generazione PDF ────────────────────────────────────────────────────────

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

    # Modulo Stampi: branch dedicato. Salta tutto il rendering standard
    # (parti × fasi × totali) e usa il layout L1-L7 specifico.
    if is_die(quote):
        spec = db.query(DieSpec).filter(DieSpec.quote_id == quote_id).first()
        norm_items = db.query(DieNormalizedItem).options(
            joinedload(DieNormalizedItem.supplier)
        ).filter(DieNormalizedItem.quote_id == quote_id).all()
        if spec:
            html_parts.append(_render_die_quote(quote, spec, parts, norm_items, cur))
        html_parts.append(_render_notes(quote))
        html_parts.append(_render_footer(cs))
        html_parts.append('</body></html>')
        # Skip standard rendering pipeline below.
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.set_content(''.join(html_parts), wait_until="networkidle")
            pdf_bytes = page.pdf(format="A4", margin={
                "top": "14mm", "bottom": "18mm", "left": "12mm", "right": "12mm"
            }, print_background=True)
            browser.close()
        tmp = tempfile.NamedTemporaryFile(
            delete=False, suffix=".pdf",
            prefix=f"preventivo_stampo_{quote_id}_"
        )
        tmp.write(pdf_bytes)
        tmp.close()
        return tmp.name

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
