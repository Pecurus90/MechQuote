"""Script una-tantum: importa utensili dal MySQL legacy (Lavoro.sql) in MechQuote.

Uso (dalla cartella `backend/`, con venv attivo):

    venv/bin/python -m scripts.migrate_tools_from_mysql <path/to/Lavoro.sql>

Esempio:
    venv/bin/python -m scripts.migrate_tools_from_mysql ../prv/Lavoro.sql

Cosa fa:
- Decodifica il file SQL (encoding latin1, CRLF) — il dump phpMyAdmin
  italiano non è UTF-8.
- Parsifica le righe INSERT della tabella `utensili`.
- Normalizza i campi:
  - **code**: strip + uppercase
  - **tool_type / brand / model**: smart-title case (acronimi ≤4 lettere
    in maiuscolo preservati; idem alla logica `customers._smart_title`)
  - **diameter_mm / toroidal_mm**: parse virgola italiana ("6,00" → 6.0)
  - **fornitore**: lookup case-insensitive su `Supplier` esistente, se
    manca lo crea automatico con quel nome
- Upsert su `code` (UNIQUE): aggiorna se esiste, crea se nuovo.
- Output: report Created / Updated / Skipped con motivi.

Idempotente: rilanciato N volte produce lo stesso stato (no duplicati).
"""
import re
import sys
from pathlib import Path
from typing import Iterator, Optional, Tuple

from sqlalchemy.orm import Session

from app.core.database import SessionLocal, engine
from app.models import Tool, ToolSupplier


# ─── Smart-title (riusato dalla logica di customers.py) ──────────────────────

_SHORT_ACRONYM_LEN = 4


def _smart_title(s: str) -> str:
    """Title case con acronimi ≤4 lettere maiuscoli preservati."""
    if not s:
        return s
    s = re.sub(r'\s+', ' ', s).strip()

    def fix_word(w: str) -> str:
        letters = ''.join(c for c in w if c.isalpha())
        if letters and letters == letters.upper() and len(letters) <= _SHORT_ACRONYM_LEN:
            return w
        return w.title()

    parts = re.split(r'(\s+|-|/)', s)
    return ''.join(fix_word(p) for p in parts)


def _parse_decimal_it(s: str) -> Optional[float]:
    """'6,00' → 6.0, '1,50' → 1.5, '' → None."""
    if not s:
        return None
    s = s.strip().replace(',', '.')
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _parse_int_safe(s: str) -> int:
    try:
        return int(s.strip()) if s and s.strip() else 0
    except ValueError:
        return 0


# ─── Parser SQL INSERT ──────────────────────────────────────────────────────

def _read_sql_file(path: Path) -> str:
    """Legge il file SQL provando vari encoding (gestionali italiani usano latin1)."""
    data = path.read_bytes()
    for enc in ('utf-8-sig', 'utf-8', 'cp1252', 'latin1'):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    raise RuntimeError(f"Impossibile decodificare {path}")


def _extract_utensili_inserts(sql_text: str) -> str:
    """Estrae solo il blocco INSERT INTO `utensili` ... VALUES (...);"""
    # Match dello statement INSERT INTO `utensili` ... seguito da VALUES (...) ... ;
    pattern = re.compile(
        r"INSERT\s+INTO\s+`utensili`\s*\([^)]*\)\s*VALUES\s*(.+?);",
        re.IGNORECASE | re.DOTALL,
    )
    match = pattern.search(sql_text)
    if not match:
        return ""
    return match.group(1)


def _parse_value_tuples(values_block: str) -> Iterator[Tuple[Optional[str], ...]]:
    """Yield ogni tupla (col1, col2, ..., col11) come strings o None.

    Le tuple sono separate da `),(`, ognuna ha 11 campi quotati o NULL.
    Gestione semplice con regex (no nested parentheses).
    """
    # Rimuovi spazi e newline extra
    block = values_block.strip().rstrip(';').strip()
    # Split sulle tuple: pattern '(' ... ')'
    tuple_pattern = re.compile(r"\(([^)]*)\)", re.DOTALL)
    for tm in tuple_pattern.finditer(block):
        inner = tm.group(1)
        # Split sui campi: campi sono 'string' o NULL, separati da `,`.
        # Stringhe possono contenere apostrofi escapati `\'` ma in questo
        # dump non sembra. Robusto con regex semplice:
        fields = []
        # Suddivide rispettando le stringhe quotate
        current = []
        in_str = False
        i = 0
        while i < len(inner):
            ch = inner[i]
            if ch == "'":
                if in_str and i + 1 < len(inner) and inner[i + 1] == "'":
                    current.append("'")
                    i += 2
                    continue
                in_str = not in_str
                i += 1
                continue
            if ch == ',' and not in_str:
                fields.append(''.join(current).strip())
                current = []
                i += 1
                continue
            current.append(ch)
            i += 1
        if current:
            fields.append(''.join(current).strip())
        # Pulisci ogni campo: rimuovi virgolette esterne, gestisci NULL
        cleaned = []
        for f in fields:
            if f.upper() == 'NULL':
                cleaned.append(None)
            elif f.startswith("'") and f.endswith("'"):
                cleaned.append(f[1:-1])
            else:
                cleaned.append(f)
        yield tuple(cleaned)


# ─── Supplier helper ────────────────────────────────────────────────────────

def _get_or_create_supplier(db: Session, name: str) -> Optional[int]:
    """Lookup case-insensitive ToolSupplier per nome. Crea se manca.

    NB: i fornitori di utensili sono distinti da quelli di trattamenti
    (tabella `suppliers`) e di materiale (`material_suppliers`).
    """
    if not name or not name.strip():
        return None
    name_norm = _smart_title(name.strip())
    existing = db.query(ToolSupplier).filter(
        ToolSupplier.name.ilike(name_norm)
    ).first()
    if existing:
        return existing.id
    # Crea nuovo
    sup = ToolSupplier(name=name_norm, active=True)
    db.add(sup)
    db.flush()
    print(f"  [+tool-supplier] '{name_norm}' creato (id={sup.id})")
    return sup.id


# ─── Main ───────────────────────────────────────────────────────────────────

def migrate(sql_path: Path) -> None:
    print(f"=== Migrazione utensili da {sql_path} ===")
    if not sql_path.exists():
        raise SystemExit(f"File non trovato: {sql_path}")

    text = _read_sql_file(sql_path)
    inserts = _extract_utensili_inserts(text)
    if not inserts:
        raise SystemExit("Nessun INSERT INTO `utensili` trovato nel file SQL.")

    created, updated, skipped = 0, 0, 0
    skipped_reasons = []

    db: Session = SessionLocal()
    try:
        for tup in _parse_value_tuples(inserts):
            # Schema legacy `utensili`:
            # (Tipo, Materiale, Marchio, Modello, Codice, Diametro, Torico,
            #  Quantita, Posizione, Minima, Fornitore)
            if len(tup) < 11:
                skipped += 1
                skipped_reasons.append(f"tupla con {len(tup)} campi (atteso 11)")
                continue
            (tipo, materiale, marchio, modello, codice, diametro, torico,
             quantita, posizione, minima, fornitore) = tup

            if not codice or not codice.strip():
                skipped += 1
                skipped_reasons.append("codice vuoto")
                continue

            code_norm = codice.strip().upper()
            tool_type = _smart_title(tipo) if tipo else None
            brand = _smart_title(marchio) if marchio else None
            model = (modello or '').strip() or None  # tieni come è (codici alfanumerici)
            material = (materiale or '').strip() or None
            diameter = _parse_decimal_it(diametro) if diametro else None
            toroidal = _parse_decimal_it(torico) if torico else None
            qty = _parse_int_safe(quantita) if quantita else 0
            min_qty = _parse_int_safe(minima) if minima else 0
            location = (posizione or '').strip() or None
            supplier_id = _get_or_create_supplier(db, fornitore) if fornitore else None

            existing = db.query(Tool).filter(Tool.code == code_norm).first()
            if existing:
                existing.tool_type = tool_type
                existing.brand = brand
                existing.model = model
                existing.material = material
                existing.diameter_mm = diameter
                existing.toroidal_mm = toroidal
                existing.quantity = qty
                existing.minimum_quantity = min_qty
                existing.location = location
                existing.tool_supplier_id = supplier_id
                updated += 1
            else:
                db.add(Tool(
                    code=code_norm,
                    tool_type=tool_type,
                    brand=brand,
                    model=model,
                    material=material,
                    diameter_mm=diameter,
                    toroidal_mm=toroidal,
                    quantity=qty,
                    minimum_quantity=min_qty,
                    location=location,
                    tool_supplier_id=supplier_id,
                    active=True,
                ))
                created += 1

        db.commit()
    finally:
        db.close()

    print(f"\nFatto: created={created}, updated={updated}, skipped={skipped}")
    if skipped_reasons:
        print(f"\nMotivi skip (primi 5):")
        for r in skipped_reasons[:5]:
            print(f"  - {r}")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    migrate(Path(sys.argv[1]))
