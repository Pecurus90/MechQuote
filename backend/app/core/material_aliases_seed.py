"""TD-15 — alias (designazioni equivalenti) dei materiali a catalogo.

Mappa {nome_materiale_catalogo → [designazioni equivalenti]}, verificate con
fonti (W.Nr, EN/DIN, AISI/SAE, UNI, nomi commerciali). Usata una-tantum da
`_seed_material_aliases()` in main.py: gli alias servono ad abbinare i nomi che
compaiono in distinte/gestionale al materiale a catalogo (import ordini da file).

Regole applicate nella compilazione:
- nessun alias coincide col nome esatto di un ALTRA voce a catalogo (il seed lo
  ri-verifica comunque a runtime e salta le collisioni);
- solo equivalenze consolidate; le proprietarie (K360/K390) hanno solo il nome
  commerciale; K455 include le equivalenze indicative (~1.2550/~S1);
- il match e l'unicità sono su chiave normalizzata (trim+lower), come l'import.

Bronzo / Ottone / Rame: esclusi finché l'utente non fornisce i gradi esatti a
stock (CuSn.. / CuZn.. / Cu-..), per non creare alias generici fuorvianti.

P20: gli alias condivisi tra 1.2311 e 40CrMnMo7 (stesso acciaio) sono assegnati
a 1.2311 (voce sopravvissuta all'unificazione); 40CrMnMo7 resta senza alias
condivisi per non violare l'unicità globale.
"""
from typing import Dict, List

MATERIAL_ALIASES: Dict[str, List[str]] = {
    # ─ Acciai da bonifica / costruzione / cementazione ─
    "C45":        ["1.0503", "AISI 1045", "1045", "Ck45", "C45E", "1.1191", "080M46"],
    "42CrMo4":    ["1.7225", "AISI 4140", "4140", "42CrMoS4", "708M40", "EN19"],
    "39NiCrMo3":  ["1.6510", "AISI 9840", "9840", "40NCD3"],
    "40NiCrMo7":  ["1.6565", "AISI 4340", "4340", "40NiCrMo8-4", "40NCD7"],
    "18NiCrMo5":  ["1.6566", "17NiCrMo6-4", "817M17", "815M17"],
    "52SiCrNi5":  ["1.7117", "52SCN5"],
    # ─ Acciai automatici (free-cutting) ─
    "11SMnPb37":  ["1.0737", "AISI 12L14", "12L14", "9SMnPb36"],
    "36SMnPb14":  ["1.0765"],
    # ─ Acciai da stampo / utensili ─
    "1.2311":     ["AISI P20", "P20", "40CMD8", "3Cr2Mo", "M238", "Impax", "T51620"],
    "1.2312":     ["40CrMnMoS8-6", "AISI P20+S", "P20+S", "P20S"],
    "K100/1.2080": ["K100", "1.2080", "X210Cr12", "AISI D3", "D3", "SKD1"],
    "K110/1.2379": ["K110", "1.2379", "X153CrMoV12", "AISI D2", "D2", "SKD11"],
    "K720/1.2842": ["K720", "1.2842", "90MnCrV8", "AISI O2", "O2"],
    "W300/1.2343": ["W300", "1.2343", "X37CrMoV5-1", "AISI H11", "H11", "SKD6"],
    "W302/1.2344": ["W302", "1.2344", "X40CrMoV5-1", "AISI H13", "H13", "SKD61"],
    "Wolframio/1.2210": ["1.2210", "115CrV3", "K510", "acciaio argento", "silver steel", "107CrV3"],
    "K360":       ["K360 ISODUR", "ISODUR"],
    "K390":       ["K390 MICROCLEAN", "MICROCLEAN"],
    "K455":       ["1.2550", "60WCrV7", "AISI S1", "S1"],   # equivalenze indicative
    # ─ Inox / alluminii ─
    "Aisi 304":   ["1.4301", "X5CrNi18-10", "304", "SS304", "V2A"],
    "Aisi 316":   ["1.4404", "316L", "X2CrNiMo17-12-2", "316", "SS316", "V4A"],
    "Alluminio 5083": ["5083", "AA5083", "EN AW-5083", "3.3547", "AlMg4,5Mn"],
    "Alluminio 7075": ["7075", "AA7075", "EN AW-7075", "3.4365", "Ergal", "Fortal", "Zicral"],
}
