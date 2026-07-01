"""Motore di import CSV condiviso per i cataloghi.

Generalizza il pattern collaudato in `api/customers.py import_csv` per
qualunque catalogo (Materiali, Utensili, Trattamenti, Macchine,
Normalizzati, Fornitori grezzi, Fornitori esterni, Lavorazioni).

L'import clienti **NON** usa questo motore: ha semantica diversa (upsert
per `customer_number`) e resta sul suo endpoint storico (vedi
`api/customers.py`).

Regola operativa di questo motore (vale per tutti i cataloghi):
- match per "chiave" della riga (es. il nome): se la chiave esiste già
  nel DB -> conteggiata come `skipped_existing`, MAI update
- duplicati interni al file -> prima vince, successive `skipped_existing`
- mai delete, mai svuotamento -> reimportare lo stesso file è idempotente
  (secondo giro: 0 created, N skipped_existing, 0 skipped_invalid)

Layout:
- `CsvRowSkip`            — eccezione che il mapper solleva per scartare
- `CsvImportConfig`       — config per un singolo catalogo
- `CsvImportResult`       — dataclass con i contatori + helper `to_dict()`
- `import_catalog_csv`    — engine principale (parse + dedup + insert)
- `csv_template_response` — genera un FileResponse di modello scaricabile
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from typing import Any, Callable, List, Optional, Sequence, Tuple

from fastapi import HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session


# ---------------------------------------------------------------------------
# Eccezione del mapper per scartare una riga con motivo leggibile
# ---------------------------------------------------------------------------

class CsvRowSkip(Exception):
    """Sollevata dal mapper per scartare una riga di dati.

    Il `reason` viene aggregato in `examples` della risposta (prime 5)
    per dare un toast informativo al frontend.
    """

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


# ---------------------------------------------------------------------------
# Helper numerico condiviso fra i mapper dei vari cataloghi
# ---------------------------------------------------------------------------

def parse_decimal_it(
    raw: Any, label: str, *, required: bool = True,
) -> Optional[float]:
    """Parsa un valore decimale tollerando la virgola italiana (`"7,85"`).

    Pensato per essere chiamato dentro un mapper di catalogo:

        density = parse_decimal_it(row['Densità (kg/dm³)'], 'Densità')

    Argomenti:
        raw: valore stringa (o convertibile) letto dal CSV.
        label: nome leggibile della colonna, usato nei messaggi di errore.
        required: se True (default), un valore vuoto solleva
            `CsvRowSkip(f"{label} mancante")`; se False ritorna `None`.

    Ritorna `float` oppure `None` (solo se `required=False` e valore vuoto).
    Solleva `CsvRowSkip` con messaggio in italiano se il valore è
    obbligatorio e mancante, oppure se non è convertibile a `float` dopo
    aver normalizzato la virgola in punto.
    """
    text = (str(raw) if raw is not None else '').strip()
    if not text:
        if required:
            raise CsvRowSkip(f"{label} mancante")
        return None
    try:
        return float(text.replace(',', '.'))
    except ValueError:
        raise CsvRowSkip(f"{label} non numerica: {text!r}")


# ---------------------------------------------------------------------------
# Configurazione di un import (un'istanza per catalogo)
# ---------------------------------------------------------------------------

def _default_normalize(s: Any) -> str:
    return (str(s) if s is not None else '').strip().lower()


@dataclass
class CsvImportConfig:
    """Configurazione di un import CSV per un singolo catalogo.

    Attributi:
        expected_columns:
            Nomi colonna che l'header DEVE contenere (esatti, case-sensitive).
            L'auto-detect cerca, tra le prime 5 righe del file, la prima
            riga che contiene tutti questi nomi -> diventa l'header.
            Le righe sopra l'header sono ignorate (tollera prologhi del
            gestionale, righe di metadati, righe vuote).
        model:
            Classe SQLAlchemy del catalogo target (es. `Material`).
        db_key_attr:
            Nome dell'attributo del modello usato come chiave di unicità
            (es. `"name"`). Le voci già presenti nel DB con quella chiave
            (dopo normalizzazione) NON vengono toccate.
        mapper:
            `Callable(row_dict) -> (key, fields)`
            - `row_dict`: `dict` colonna_csv -> valore stringa già stripped.
              Contiene solo le colonne presenti nell'header del file.
            - ritorna `(key, fields)`:
              - `key`: stringa "grezza" usata per il match (la
                normalizzazione la fa il motore con `normalize_key`).
              - `fields`: `dict` di kwargs pronto per `model(**fields)`.
            - per scartare la riga: `raise CsvRowSkip("motivo leggibile")`.
        normalize_key:
            Funzione di normalizzazione applicata SIA alla chiave CSV
            ritornata dal mapper SIA al valore di `db_key_attr` letto dal
            DB. Default: `strip().lower()`. Override se il catalogo
            richiede match case-sensitive o normalizzazione speciale.
    """
    expected_columns: Sequence[str]
    model: type
    db_key_attr: str
    mapper: Callable[[dict], Tuple[str, dict]]
    normalize_key: Callable[[Any], str] = field(default=_default_normalize)


# ---------------------------------------------------------------------------
# Risultato standard ritornato dall'engine
# ---------------------------------------------------------------------------

@dataclass
class CsvImportResult:
    """Esito di un import. `to_dict()` produce il JSON di risposta."""

    created: int = 0
    skipped_existing: int = 0
    skipped_invalid: int = 0
    examples: List[str] = field(default_factory=list)

    @property
    def total_processed(self) -> int:
        return self.created + self.skipped_existing + self.skipped_invalid

    def to_dict(self) -> dict:
        return {
            "created": self.created,
            "skipped_existing": self.skipped_existing,
            "skipped_invalid": self.skipped_invalid,
            "total_processed": self.total_processed,
            "examples": self.examples[:5],
        }


# ---------------------------------------------------------------------------
# Costanti formato CSV (gestionali italiani: ';' + UTF-8 con eventuale BOM)
# ---------------------------------------------------------------------------

_ENCODINGS = ('utf-8-sig', 'utf-8', 'cp1252', 'latin1')
_HEADER_LOOKAHEAD = 5
_DELIMITER = ';'
_QUOTECHAR = '"'
_EXAMPLES_CAP = 5


# ---------------------------------------------------------------------------
# Helpers interni (decode + auto-detect header)
# ---------------------------------------------------------------------------

def _decode_csv_bytes(content: bytes) -> str:
    for enc in _ENCODINGS:
        try:
            return content.decode(enc)
        except UnicodeDecodeError:
            continue
    raise HTTPException(
        status_code=400,
        detail="Impossibile decodificare il file (encoding sconosciuto)",
    )


def _find_header_row(
    rows: List[List[str]], expected: Sequence[str]
) -> Tuple[int, List[str]]:
    """Cerca tra le prime righe quella che contiene TUTTE le colonne attese.

    Ritorna `(indice, header_pulito)`. Solleva `HTTPException(400)` se non
    trova un header valido nelle prime `_HEADER_LOOKAHEAD` righe.
    """
    expected_set = set(expected)
    for i, raw in enumerate(rows[:_HEADER_LOOKAHEAD]):
        cleaned = [(c or '').strip() for c in raw]
        if expected_set.issubset(set(cleaned)):
            return i, cleaned
    raise HTTPException(
        status_code=400,
        detail=(
            "Header non riconosciuto. Atteso CSV con colonne: "
            + ', '.join(expected)
        ),
    )


# ---------------------------------------------------------------------------
# Engine principale
# ---------------------------------------------------------------------------

async def import_catalog_csv(
    *,
    file: UploadFile,
    db: Session,
    config: CsvImportConfig,
) -> CsvImportResult:
    """Importa un CSV di catalogo applicando la regola "insert se nuovo,
    skip se già presente, mai update".

    Validazioni di formato (400 Bad Request, non si scrive niente):
    - estensione non `.csv`
    - file vuoto
    - encoding non decodificabile
    - meno di 2 righe utili
    - header atteso non trovato nelle prime 5 righe

    Le righe singole vengono:
    - silenziosamente saltate se completamente vuote
    - contate come `skipped_invalid` se il mapper solleva `CsvRowSkip` o
      se la chiave normalizzata è vuota
    - contate come `skipped_existing` se la chiave è già presente nel DB
      o se è già comparsa in precedenza nello stesso file
    - inserite altrimenti (`db.add(model(**fields))`)

    Esegue `db.commit()` finale prima di tornare (coerente con
    `customers.py import_csv`). Eventuali eccezioni non catturate non
    catturano il rollback: spetta al chiamante / dispatcher FastAPI.
    """
    if not file.filename or not file.filename.lower().endswith('.csv'):
        raise HTTPException(status_code=400, detail="Il file deve essere un .csv")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File vuoto")

    text = _decode_csv_bytes(content)
    rows = list(csv.reader(
        io.StringIO(text), delimiter=_DELIMITER, quotechar=_QUOTECHAR,
    ))
    if len(rows) < 2:
        raise HTTPException(
            status_code=400,
            detail="CSV troppo corto (header + almeno una riga dati)",
        )

    header_idx, header = _find_header_row(rows, config.expected_columns)

    # Pre-carica le chiavi già in DB, normalizzate con la stessa funzione
    # usata sulla chiave CSV (default: strip+lower).
    existing_keys = {
        config.normalize_key(getattr(obj, config.db_key_attr))
        for obj in db.query(config.model).all()
    }

    result = CsvImportResult()
    seen_in_file: set = set()

    for raw in rows[header_idx + 1:]:
        if not raw or all(not (c or '').strip() for c in raw):
            continue  # riga totalmente vuota: silenziosa

        row_dict = {
            header[i]: (raw[i] if i < len(raw) else '').strip()
            for i in range(len(header))
        }

        try:
            key, fields = config.mapper(row_dict)
        except CsvRowSkip as skip:
            result.skipped_invalid += 1
            if len(result.examples) < _EXAMPLES_CAP:
                result.examples.append(skip.reason)
            continue

        norm_key = config.normalize_key(key)
        if not norm_key:
            result.skipped_invalid += 1
            if len(result.examples) < _EXAMPLES_CAP:
                result.examples.append("Chiave vuota dopo normalizzazione")
            continue

        if norm_key in seen_in_file or norm_key in existing_keys:
            result.skipped_existing += 1
            continue
        seen_in_file.add(norm_key)

        db.add(config.model(**fields))
        result.created += 1

    # Commit atomico: o si salva tutto il batch o niente. Se il commit
    # fallisce (es. constraint, FK, connessione persa), rollback della
    # sessione e 400 al frontend — niente voci a metà.
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=(
                "Import non riuscito: nessuna voce è stata salvata. "
                "Controlla il file e riprova. "
                f"(dettaglio tecnico: {type(exc).__name__})"
            ),
        ) from exc

    return result


# ---------------------------------------------------------------------------
# Template + export scaricabili (formato identico all'engine di import)
# ---------------------------------------------------------------------------

def sanitize_filename_part(name: Optional[str]) -> str:
    """Rende un nome (es. fornitore) sicuro per un filename.

    Accenti preservati, spazi/punteggiatura → `_`, fallback 'fornitore'.
    Usato per i CSV per-fornitore (ordini utensili e materiali).
    """
    cleaned = re.sub(r'[^0-9A-Za-zÀ-ÿ]+', '_', (name or '').strip()).strip('_')
    return cleaned or 'fornitore'


def _csv_streaming_response(
    *,
    filename: str,
    columns: Sequence[str],
    rows: Sequence[Sequence[Any]],
) -> StreamingResponse:
    """Cuore condiviso di template ed export: header + righe → CSV scaricabile.

    `StreamingResponse` `text/csv; charset=utf-8` con
    `Content-Disposition: attachment`. Encoding UTF-8 **con BOM** così Excel
    italiano apre senza rompere gli accenti; delimiter `';'` come l'import.
    Valori `None` resi come cella vuota.
    """
    buf = io.StringIO()
    writer = csv.writer(
        buf, delimiter=_DELIMITER, quotechar=_QUOTECHAR,
        quoting=csv.QUOTE_MINIMAL,
    )
    writer.writerow(list(columns))
    for row in rows:
        writer.writerow(['' if c is None else c for c in row])

    payload = '﻿' + buf.getvalue()  # BOM per Excel
    return StreamingResponse(
        iter([payload.encode('utf-8')]),
        media_type='text/csv; charset=utf-8',
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"',
            # Espone il nome file al JS anche cross-origin (il frontend legge
            # il filename per-fornitore dall'header Content-Disposition).
            'Access-Control-Expose-Headers': 'Content-Disposition',
        },
    )


def csv_export_response(
    *,
    filename: str,
    columns: Sequence[str],
    rows: Sequence[Sequence[Any]],
) -> StreamingResponse:
    """Esporta righe di dati reali come CSV scaricabile.

    Gemello di `csv_template_response` ma per l'export (dati veri, non un
    modello vuoto). Stesso formato `;` + UTF-8 con BOM: il file torna
    reimportabile e Excel italiano lo apre senza rompere gli accenti.
    """
    return _csv_streaming_response(filename=filename, columns=columns, rows=rows)


def csv_template_response(
    *,
    filename: str,
    columns: Sequence[str],
    examples: Sequence[Sequence[str]] = (),
) -> StreamingResponse:
    """Costruisce un CSV "modello" (header + eventuali righe d'esempio) da
    far scaricare all'utente.

    Argomenti:
        filename: nome file proposto al browser (es. `"materiali_modello.csv"`).
        columns: intestazioni di colonna in ordine.
        examples: 0..N righe d'esempio (ogni riga = sequenza di stringhe
            della stessa lunghezza di `columns`). Default: nessuna riga.

    Output:
        `StreamingResponse` `text/csv; charset=utf-8` con
        `Content-Disposition: attachment`. Encoding UTF-8 **con BOM** così
        Excel italiano apre direttamente senza rompere gli accenti.
        Stesso delimiter `';'` usato dall'engine di import.
    """
    return _csv_streaming_response(filename=filename, columns=columns, rows=examples)
