"""Vocabolario iniziale di Lavorazioni — usato SOLO come seed di `Operation`
al primo boot (vedi `main._seed_operations`).

Dopo il seed la tabella `Operation` è la single source of truth. L'utente
modifica/aggiunge/disattiva voci da UI (Settings → Catalogo → Lavorazioni).
Cambiare questo file non ha effetto retroattivo sui DB già seedati.

Il modulo conserva storicamente il nome `phase_types` per evitare di
toccare l'import in `main.py`. Le voci `slug`/`label_short` restano per
eventuale rebuild da zero in dev, ma il cost engine non le legge più.
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
