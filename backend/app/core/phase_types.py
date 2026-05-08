"""Tipi di fase di lavorazione — slug stabili usati come `ManufacturingPhase.phase_type`.

⚠️  Mirror di frontend/src/lib/constants.ts PHASE_TYPES. Tieni i due file allineati:
sono lo stesso dato in due rappresentazioni (Python qui per PDF, TS lì per UI).

`label`        — etichetta italiana piena, usata in UI (frontend) e per leggibilità log
`label_short`  — etichetta compatta italiana (≤8 char), usata in PDF dove le colonne sono strette
"""
from typing import Dict, List

PHASE_TYPES: List[Dict[str, str]] = [
    {"slug": "raw_material_cutting", "label": "Taglio materiale grezzo",  "label_short": "TAGLIO"},
    {"slug": "cnc_milling",          "label": "Fresatura CNC",            "label_short": "FRES."},
    {"slug": "cnc_turning",          "label": "Tornitura CNC",            "label_short": "TORN."},
    {"slug": "drilling",             "label": "Foratura",                 "label_short": "FOR."},
    {"slug": "tapping",              "label": "Maschiatura",              "label_short": "MASCH."},
    {"slug": "wire_edm",             "label": "EDM a filo",               "label_short": "EDM FILO"},
    {"slug": "sinker_edm",           "label": "EDM a tuffo",              "label_short": "EDM TUFF."},
    {"slug": "grinding",             "label": "Rettifica",                "label_short": "RETT."},
    {"slug": "manual_operation",     "label": "Operazione manuale",       "label_short": "MANUALE"},
    {"slug": "heat_treatment",       "label": "Trattamento termico",      "label_short": "TRATT."},
    {"slug": "surface_treatment",    "label": "Trattamento superficiale", "label_short": "SUPERF."},
    {"slug": "quality_control",      "label": "Controllo qualità",        "label_short": "CTRL"},
    {"slug": "external_supplier",    "label": "Fornitore esterno",        "label_short": "C/LAV."},
    {"slug": "packaging",            "label": "Imballaggio",              "label_short": "IMBALL."},
    {"slug": "transport",            "label": "Trasporto",                "label_short": "TRASP."},
    {"slug": "custom_extra",         "label": "Extra personalizzato",     "label_short": "EXTRA"},
]

_BY_SLUG: Dict[str, Dict[str, str]] = {p["slug"]: p for p in PHASE_TYPES}


def phase_label(slug: str) -> str:
    """Etichetta italiana piena. Fallback: slug rimaiuscolato."""
    p = _BY_SLUG.get(slug)
    return p["label"] if p else slug.upper().replace("_", " ")


def phase_label_short(slug: str) -> str:
    """Etichetta compatta per PDF. Fallback: slug rimaiuscolato troncato."""
    p = _BY_SLUG.get(slug)
    return p["label_short"] if p else slug.upper().replace("_", " ")[:10]


# Slug che identificano fasi "esterne" / "altro" — usato per mostrare un badge speciale nel PDF
EXTERNAL_PHASE_SLUGS = frozenset({"external_supplier", "custom_extra", "transport"})
