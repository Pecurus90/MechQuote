"""Famiglie materiali — slug stabili usati come chiave in EdmCutSpeed/DrillingTime
e come valore validato di Material.family.

⚠️  Non rinominare gli slug senza una migration di normalizzazione: i valori
sono persistiti su DB sia in materials.family sia in edm_cut_speeds/drilling_times.

Mirror lato frontend: frontend/src/lib/materialFamilies.ts (single source of truth
duplicata per evitare un endpoint extra; lista quasi-statica).
"""
from typing import List, Dict, Set

MATERIAL_FAMILIES: List[Dict[str, str]] = [
    {"slug": "acciaio_carbonio", "label": "Acciaio al carbonio"},
    {"slug": "acciaio_inox",     "label": "Acciaio inox"},
    {"slug": "acciaio_utensili", "label": "Acciaio per utensili"},
    {"slug": "alluminio",        "label": "Alluminio"},
    {"slug": "titanio",          "label": "Titanio"},
    {"slug": "ottone",           "label": "Ottone"},
    {"slug": "rame",             "label": "Rame"},
    {"slug": "plastica",         "label": "Plastica"},
    {"slug": "carburi",          "label": "Carburi metallici"},
    {"slug": "altro",            "label": "Altro"},
]

MATERIAL_FAMILY_SLUGS: Set[str] = {f["slug"] for f in MATERIAL_FAMILIES}
