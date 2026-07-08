import logging
import os
import time

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional

from app.core.catalog_protect import block_if_in_use, check_duplicate_name
from app.core.csv_import import (
    CsvImportConfig, CsvRowSkip,
    csv_template_response, import_catalog_csv, normalize_alias, parse_decimal_it,
)
from app.core.database import get_db
from app.core.security import require_permission
from app.models import Material, MaterialAlias, MaterialSupplier, Part
from app.schemas import (
    MaterialAliasAdd, MaterialCreate, MaterialUpdate, MaterialOut,
    MaterialSupplierCreate, MaterialSupplierUpdate, MaterialSupplierOut,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["materials"])

# Scheda tecnica PDF: stesse regole del modulo officina documents
DATASHEET_DIR = "uploads/officina/materiali"
DATASHEET_MAX_BYTES = 50 * 1024 * 1024
_can_datasheet_write = require_permission('officina.write')
_can_datasheet_read = require_permission('officina')


# --- Material Suppliers ---
@router.get("/material-suppliers", response_model=List[MaterialSupplierOut])
def list_material_suppliers(db: Session = Depends(get_db)):
    return db.query(MaterialSupplier).order_by(MaterialSupplier.name).all()


@router.post("/material-suppliers", response_model=MaterialSupplierOut, dependencies=[require_permission('settings')])
def create_material_supplier(data: MaterialSupplierCreate, db: Session = Depends(get_db)):
    check_duplicate_name(db, MaterialSupplier, data.name, label="fornitore grezzo")
    s = MaterialSupplier(**data.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.put("/material-suppliers/{sid}", response_model=MaterialSupplierOut, dependencies=[require_permission('settings')])
def update_material_supplier(sid: int, data: MaterialSupplierUpdate, db: Session = Depends(get_db)):
    s = db.query(MaterialSupplier).filter(MaterialSupplier.id == sid).first()
    if not s:
        raise HTTPException(404, "Fornitore materiali non trovato")
    if data.name is not None:
        check_duplicate_name(db, MaterialSupplier, data.name, label="fornitore grezzo", exclude_id=sid)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/material-suppliers/{sid}", dependencies=[require_permission('settings')])
def delete_material_supplier(sid: int, db: Session = Depends(get_db)):
    s = db.query(MaterialSupplier).filter(MaterialSupplier.id == sid).first()
    if not s:
        raise HTTPException(404, "Fornitore materiali non trovato")
    block_if_in_use(
        db, f"Fornitore materiali '{s.name}'",
        (Material, Material.supplier_id == s.id, "materiale", "materiali"),
    )
    db.delete(s)
    db.commit()
    return {"ok": True}


# --- Import CSV Fornitori grezzi -------------------------------------------

_MATERIAL_SUPPLIERS_CSV_COLUMNS = [
    'Nome', 'Indirizzo', 'Spedizione (€)', 'Taglio (€/pz)',
]


def _material_supplier_mapper(row: dict):
    name = (row.get('Nome') or '').strip()
    if not name:
        raise CsvRowSkip("Nome mancante")
    return name, {
        'name': name,
        'address': (row.get('Indirizzo') or '').strip() or None,
        'shipping_cost': parse_decimal_it(
            row.get('Spedizione (€)'), 'Spedizione', required=False,
        ) or 0.0,
        'cutting_cost_per_part': parse_decimal_it(
            row.get('Taglio (€/pz)'), 'Taglio', required=False,
        ) or 0.0,
        'active': True,
    }


_MATERIAL_SUPPLIERS_IMPORT_CONFIG = CsvImportConfig(
    expected_columns=_MATERIAL_SUPPLIERS_CSV_COLUMNS,
    model=MaterialSupplier,
    db_key_attr='name',
    mapper=_material_supplier_mapper,
)


@router.post("/material-suppliers/import-csv",
             dependencies=[require_permission('settings')])
async def import_material_suppliers_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Importa un CSV di fornitori grezzi. Match per `name` normalizzato:
    le voci già presenti vengono saltate (mai update). Vedi
    `app.core.csv_import` per la semantica completa."""
    result = await import_catalog_csv(
        file=file, db=db, config=_MATERIAL_SUPPLIERS_IMPORT_CONFIG,
    )
    logger.info(
        "CSV fornitori grezzi importato: created=%d skipped_existing=%d skipped_invalid=%d",
        result.created, result.skipped_existing, result.skipped_invalid,
    )
    return result.to_dict()


@router.get("/material-suppliers/csv-template",
            dependencies=[require_permission('settings')])
def download_material_suppliers_csv_template():
    """Modello CSV per l'import fornitori grezzi (UTF-8 con BOM, ';')."""
    return csv_template_response(
        filename='fornitori_grezzi_modello.csv',
        columns=_MATERIAL_SUPPLIERS_CSV_COLUMNS,
        examples=[
            ['Acciaierie Rossi SpA', 'Via Roma 12, Milano', '25.00', '0.50'],
            ['MetalForniture Srl',   'Via Verdi 8, Torino',  '15.00', '0.00'],
        ],
    )


# --- Materials ---
@router.get("/materials", response_model=List[MaterialOut])
def list_materials(
    active: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    """Elenco materiali. `active` opzionale: se True/False filtra, se
    omesso restituisce tutto (default invariato, per non rompere settings
    né letture esistenti). Pattern di `normalized_items.list_items`."""
    query = db.query(Material).options(
        joinedload(Material.material_supplier), joinedload(Material.aliases),
    )
    if active is not None:
        query = query.filter(Material.active == active)
    return query.order_by(Material.name).all()


@router.post("/materials", response_model=MaterialOut, dependencies=[require_permission('settings')])
def create_material(data: MaterialCreate, db: Session = Depends(get_db)):
    check_duplicate_name(db, Material, data.name, label="materiale")
    m = Material(**data.model_dump())
    db.add(m)
    db.commit()
    return db.query(Material).options(joinedload(Material.material_supplier)).filter(Material.id == m.id).first()


@router.put("/materials/{mid}", response_model=MaterialOut, dependencies=[require_permission('settings')])
def update_material(mid: int, data: MaterialUpdate, db: Session = Depends(get_db)):
    m = db.query(Material).filter(Material.id == mid).first()
    if not m:
        raise HTTPException(404, "Materiale non trovato")
    if data.name is not None:
        check_duplicate_name(db, Material, data.name, label="materiale", exclude_id=mid)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    db.commit()
    return db.query(Material).options(joinedload(Material.material_supplier)).filter(Material.id == mid).first()


@router.delete("/materials/{mid}", dependencies=[require_permission('settings')])
def delete_material(mid: int, db: Session = Depends(get_db)):
    m = db.query(Material).filter(Material.id == mid).first()
    if not m:
        raise HTTPException(404, "Materiale non trovato")
    block_if_in_use(
        db, f"Materiale '{m.name}'",
        (Part, Part.material_id == m.id, "parte", "parti"),
    )
    # Cleanup datasheet blob se presente (no listener globale, pulizia inline)
    if m.datasheet_path and os.path.exists(m.datasheet_path):
        try:
            os.remove(m.datasheet_path)
        except OSError as e:
            logger.warning("Cleanup datasheet blob %s fallito: %s", m.datasheet_path, e)
    db.delete(m)
    db.commit()
    return {"ok": True}


# --- Alias materiale (nomi alternativi per l'abbinamento distinta) ----------

def _material_out(mid: int, db: Session) -> Material:
    return db.query(Material).options(
        joinedload(Material.material_supplier), joinedload(Material.aliases),
    ).filter(Material.id == mid).first()


@router.post("/materials/{mid}/aliases", response_model=MaterialOut,
             dependencies=[require_permission('settings')])
def add_material_alias(mid: int, data: MaterialAliasAdd, db: Session = Depends(get_db)):
    """Aggiunge un alias (nome alternativo) al materiale. `csv_name` è
    normalizzato (trim+lower) e globalmente unico: se già usato da un altro
    materiale la richiesta è rifiutata (niente 'furto' silenzioso dell'alias).
    Stessa tabella e stessa normalizzazione del flusso ordini-da-file."""
    m = db.query(Material).filter(Material.id == mid).first()
    if not m:
        raise HTTPException(404, "Materiale non trovato")
    key = normalize_alias(data.csv_name)
    if not key:
        raise HTTPException(400, "Alias vuoto")
    existing = db.query(MaterialAlias).filter(MaterialAlias.csv_name == key).first()
    if existing:
        if existing.material_id == mid:
            raise HTTPException(400, f"Alias «{key}» già presente su questo materiale")
        other = db.query(Material).filter(Material.id == existing.material_id).first()
        other_name = other.name if other else f"id {existing.material_id}"
        raise HTTPException(
            400,
            f"Alias «{key}» già usato dal materiale «{other_name}»: rimuovilo prima da lì",
        )
    db.add(MaterialAlias(csv_name=key, material_id=mid))
    db.commit()
    return _material_out(mid, db)


@router.delete("/materials/{mid}/aliases/{alias_id}", response_model=MaterialOut,
               dependencies=[require_permission('settings')])
def delete_material_alias(mid: int, alias_id: int, db: Session = Depends(get_db)):
    """Rimuove un alias dal materiale."""
    alias = db.query(MaterialAlias).filter(
        MaterialAlias.id == alias_id, MaterialAlias.material_id == mid,
    ).first()
    if not alias:
        raise HTTPException(404, "Alias non trovato")
    db.delete(alias)
    db.commit()
    return _material_out(mid, db)


# --- Import CSV Materiali --------------------------------------------------

_MATERIALS_CSV_COLUMNS = [
    'Nome', 'Famiglia', 'Densità (kg/dm³)', 'Costo/kg (€)',
    'Scrap % default', 'Fornitore',
]


def _build_materials_mapper(supplier_by_name: dict):
    """Crea il mapper per l'import materiali iniettando la mappa
    `name_normalizzato -> supplier_id` precaricata dall'endpoint.

    Niente creazione di fornitori al volo: se la cella `Fornitore` è
    valorizzata ma il nome non è in mappa, la riga viene scartata con
    un messaggio che dice all'utente di importare prima i fornitori.
    """
    def mapper(row: dict):
        name = (row.get('Nome') or '').strip()
        if not name:
            raise CsvRowSkip("Nome mancante")

        supplier_id = None
        supplier_raw = (row.get('Fornitore') or '').strip()
        if supplier_raw:
            supplier_id = supplier_by_name.get(supplier_raw.lower())
            if supplier_id is None:
                raise CsvRowSkip(
                    f"Fornitore '{supplier_raw}' non trovato: "
                    "importa prima i fornitori grezzi"
                )

        return name, {
            'name': name,
            'family': (row.get('Famiglia') or '').strip() or None,
            'density_kg_dm3': parse_decimal_it(
                row.get('Densità (kg/dm³)'), 'Densità', required=True,
            ),
            'cost_per_kg': parse_decimal_it(
                row.get('Costo/kg (€)'), 'Costo/kg', required=True,
            ),
            'default_scrap_percent': parse_decimal_it(
                row.get('Scrap % default'), 'Scrap %', required=False,
            ) or 10.0,
            'supplier_id': supplier_id,
            'edm_coefficient': 1.0,
            'cnc_machinability_coefficient': 1.0,
            'active': True,
        }
    return mapper


@router.post("/materials/import-csv",
             dependencies=[require_permission('settings')])
async def import_materials_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Importa un CSV di materiali. Match per `name` normalizzato: le voci
    già presenti vengono saltate. La colonna `Fornitore` viene risolta
    via lookup su `MaterialSupplier.name` (normalizzato) precaricato:
    nome vuoto -> nessun fornitore, nome non esistente -> riga scartata."""
    # Precarica la mappa fornitori: una query, indice in memoria.
    # Coerente con la normalizzazione dell'engine (strip + lower).
    supplier_by_name = {
        (s.name or '').strip().lower(): s.id
        for s in db.query(MaterialSupplier).all()
    }
    config = CsvImportConfig(
        expected_columns=_MATERIALS_CSV_COLUMNS,
        model=Material,
        db_key_attr='name',
        mapper=_build_materials_mapper(supplier_by_name),
    )
    result = await import_catalog_csv(file=file, db=db, config=config)
    logger.info(
        "CSV materiali importato: created=%d skipped_existing=%d skipped_invalid=%d",
        result.created, result.skipped_existing, result.skipped_invalid,
    )
    return result.to_dict()


@router.get("/materials/csv-template",
            dependencies=[require_permission('settings')])
def download_materials_csv_template():
    """Modello CSV per l'import materiali (UTF-8 con BOM, ';').

    La colonna `Fornitore` può essere vuota oppure deve corrispondere
    esattamente al nome di un fornitore grezzo già presente nel catalogo.
    """
    return csv_template_response(
        filename='materiali_modello.csv',
        columns=_MATERIALS_CSV_COLUMNS,
        examples=[
            ['Acciaio C40',    'steel',     '7.85', '1.20', '10', 'Acciaierie Rossi SpA'],
            ['Alluminio 6082', 'aluminum',  '2.70', '4.50', '15', ''],
        ],
    )


# --- Datasheet PDF allegato al material -------------------------------------

@router.post("/materials/{mid}/datasheet", response_model=MaterialOut)
def upload_datasheet(
    mid: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=_can_datasheet_write,
):
    """Upload PDF scheda tecnica per il materiale. Sostituisce eventuale
    file precedente (rimuove vecchio blob). Solo PDF, max 50 MB."""
    m = db.query(Material).filter(Material.id == mid).first()
    if not m:
        raise HTTPException(404, "Materiale non trovato")

    safe_filename = os.path.basename(file.filename or "scheda.pdf").replace("..", "").strip("/\\")
    ext = os.path.splitext(safe_filename)[1].lower()
    if ext != '.pdf':
        raise HTTPException(400, "Solo file PDF accettati")
    if file.content_type and file.content_type != 'application/pdf':
        raise HTTPException(400, f"MIME non supportato: {file.content_type}")

    os.makedirs(DATASHEET_DIR, exist_ok=True)
    unique_name = f"mat_{mid}_{int(time.time())}_{safe_filename}"
    new_path = os.path.join(DATASHEET_DIR, unique_name)

    bytes_written = 0
    with open(new_path, "wb") as buf:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            bytes_written += len(chunk)
            if bytes_written > DATASHEET_MAX_BYTES:
                buf.close()
                try:
                    os.remove(new_path)
                except OSError:
                    pass
                raise HTTPException(413, "File troppo grande (max 50 MB)")
            buf.write(chunk)

    # Rimuovi vecchio datasheet se sostituiamo
    old_path = m.datasheet_path
    m.datasheet_path = new_path
    db.commit()
    if old_path and old_path != new_path and os.path.exists(old_path):
        try:
            os.remove(old_path)
        except OSError as e:
            logger.warning("Cleanup vecchio datasheet %s fallito: %s", old_path, e)

    return db.query(Material).options(joinedload(Material.material_supplier)).filter(Material.id == mid).first()


@router.get("/materials/{mid}/datasheet")
def download_datasheet(mid: int, db: Session = Depends(get_db), _=_can_datasheet_read):
    """Streaming download PDF scheda tecnica. 404 se non allegato."""
    m = db.query(Material).filter(Material.id == mid).first()
    if not m:
        raise HTTPException(404, "Materiale non trovato")
    if not m.datasheet_path:
        raise HTTPException(404, "Nessuna scheda tecnica allegata")
    if not os.path.exists(m.datasheet_path):
        raise HTTPException(404, "Scheda non trovata su disco")
    return FileResponse(
        m.datasheet_path,
        media_type="application/pdf",
        filename=f"scheda_{m.name}.pdf",
    )


@router.delete("/materials/{mid}/datasheet", response_model=MaterialOut)
def delete_datasheet(mid: int, db: Session = Depends(get_db), _=_can_datasheet_write):
    """Rimuove scheda tecnica (record + blob su disco)."""
    m = db.query(Material).filter(Material.id == mid).first()
    if not m:
        raise HTTPException(404, "Materiale non trovato")
    if not m.datasheet_path:
        raise HTTPException(404, "Nessuna scheda tecnica allegata")
    blob = m.datasheet_path
    m.datasheet_path = None
    db.commit()
    if blob and os.path.exists(blob):
        try:
            os.remove(blob)
        except OSError as e:
            logger.warning("Cleanup datasheet on delete %s fallito: %s", blob, e)
    return db.query(Material).options(joinedload(Material.material_supplier)).filter(Material.id == mid).first()
