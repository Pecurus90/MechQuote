"""API Officina: documenti PDF consultabili dagli operatori.

Sprint A+B foundation:
- Lista documenti (filtro categoria + search), gated `officina`
- Upload PDF (max 50 MB, MIME application/pdf), gated `officina.write`
- Download blob da disco, gated `officina`
- Delete documento + cleanup blob (listener SQLAlchemy), gated `officina.write`
- GET /categories → lista categorie usate (dropdown auto-popolato)

Tabelle reference, normative, calcolatori arriveranno in sprint successivi.
"""
import logging
import os
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, Form
from fastapi.responses import FileResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.catalog_protect import block_if_in_use
from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.core.upload_validation import content_matches_ext
from app.models import OfficinaCategory, OfficinaDocument, User
from app.schemas import (
    OfficinaCategoryCreate, OfficinaCategoryOut, OfficinaCategoryUpdate,
    OfficinaDocumentOut,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/officina", tags=["officina"])

_can_read = require_permission('officina')
_can_write = require_permission('officina.write')
_can_admin_categories = require_permission('officina.write')  # chi modifica i contenuti officina gestisce la tassonomia

UPLOAD_DIR = "uploads/officina"
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB, coerente con PartFile

# Tipi accettati: file ufficio + immagini + DXF (con viewer integrato)
ALLOWED_EXT = {
    '.pdf', '.docx', '.doc', '.xlsx', '.xls',
    '.png', '.jpg', '.jpeg', '.gif',
    '.dxf',
}
ALLOWED_MIME = {
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'image/png', 'image/jpeg', 'image/gif',
    # DXF è spesso text/plain o vuoto, accettiamo permissivamente
    'application/dxf', 'application/x-dxf', 'image/vnd.dxf', 'text/plain',
    'application/octet-stream',  # alcuni browser su DXF/DOC
}


# ─── Documents ──────────────────────────────────────────────────────────────

@router.get("/documents", response_model=List[OfficinaDocumentOut])
def list_documents(
    category: Optional[str] = None,
    customer_id: Optional[int] = None,
    material_supplier_id: Optional[int] = None,
    tool_supplier_id: Optional[int] = None,
    normalized_supplier_id: Optional[int] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    _=_can_read,
):
    """Lista documenti con filtri opzionali per categoria/cliente/fornitore/testo."""
    query = db.query(OfficinaDocument).options(
        joinedload(OfficinaDocument.uploaded_by),
        joinedload(OfficinaDocument.customer),
        joinedload(OfficinaDocument.material_supplier),
        joinedload(OfficinaDocument.tool_supplier),
        joinedload(OfficinaDocument.normalized_supplier),
    )
    if category:
        query = query.filter(OfficinaDocument.category == category)
    if customer_id is not None:
        query = query.filter(OfficinaDocument.customer_id == customer_id)
    if material_supplier_id is not None:
        query = query.filter(OfficinaDocument.material_supplier_id == material_supplier_id)
    if tool_supplier_id is not None:
        query = query.filter(OfficinaDocument.tool_supplier_id == tool_supplier_id)
    if normalized_supplier_id is not None:
        query = query.filter(OfficinaDocument.normalized_supplier_id == normalized_supplier_id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(
            OfficinaDocument.title.ilike(like),
            OfficinaDocument.filename.ilike(like),
        ))
    return query.order_by(OfficinaDocument.uploaded_at.desc()).limit(500).all()


@router.get("/categories", response_model=List[str])
def list_categories(db: Session = Depends(get_db), _=_can_read):
    """Categorie distinte usate dai documenti, per popolare il dropdown.

    Categoria libera (l'utente può digitarne una nuova): questo endpoint
    restituisce solo le categorie già usate per autocompletamento.
    """
    rows = db.query(OfficinaDocument.category).filter(
        OfficinaDocument.category.isnot(None),
        OfficinaDocument.category != '',
    ).distinct().all()
    return sorted({r[0] for r in rows if r[0]})


@router.post("/documents", response_model=OfficinaDocumentOut)
def upload_document(
    title: str = Form(..., min_length=1, max_length=200),
    category: Optional[str] = Form(None),
    customer_id: Optional[int] = Form(None),
    material_supplier_id: Optional[int] = Form(None),
    tool_supplier_id: Optional[int] = Form(None),
    normalized_supplier_id: Optional[int] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    """Upload PDF in uploads/officina/. Stream chunked con cap 50 MB.

    MIME enforced server-side (no fiducia nel client): solo application/pdf.
    Filename sanitizzato (no path traversal). Categoria libera, opzionale.
    """
    # MIME / extension check
    safe_filename = os.path.basename(file.filename or "document.pdf").replace("..", "").strip("/\\")
    if not safe_filename:
        safe_filename = "document.pdf"
    ext = os.path.splitext(safe_filename)[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"Estensione non supportata: {ext}. Accettati: PDF, Word, Excel, immagini, DXF")
    if file.content_type and file.content_type not in ALLOWED_MIME:
        # Logga ma non rifiutare: alcuni browser inviano MIME inattendibile (es. DXF).
        # L'estensione sopra è il check primario.
        logger.info("MIME insolito su upload officina: %s (ext %s, allow comunque)", file.content_type, ext)

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    # Filename univoco: aggiungo timestamp per evitare collisioni
    import time
    unique_name = f"{int(time.time())}_{safe_filename}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)

    # Validazione contenuto (magic bytes): il contenuto deve corrispondere
    # all'estensione (difesa in profondità oltre alla whitelist di estensioni).
    head = file.file.read(4096)
    if not content_matches_ext(head, ext):
        raise HTTPException(status_code=400, detail="Il contenuto del file non corrisponde all'estensione dichiarata.")
    bytes_written = len(head)
    with open(file_path, "wb") as buffer:
        buffer.write(head)
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            bytes_written += len(chunk)
            if bytes_written > MAX_UPLOAD_BYTES:
                buffer.close()
                try:
                    os.remove(file_path)
                except OSError as e:
                    logger.warning("Cleanup oversize upload officina fallito: %s — %s", file_path, e)
                raise HTTPException(status_code=413, detail="File troppo grande (max 50 MB)")
            buffer.write(chunk)

    # Mutex: max 1 riferimento popolato (cliente o uno dei 3 tipi fornitore)
    refs_set = sum(1 for r in (customer_id, material_supplier_id, tool_supplier_id, normalized_supplier_id) if r is not None)
    if refs_set > 1:
        try:
            os.remove(file_path)
        except OSError:
            pass
        raise HTTPException(
            status_code=400,
            detail="Il documento può essere collegato a UN solo riferimento (cliente OPPURE fornitore).",
        )

    doc = OfficinaDocument(
        title=title.strip(),
        category=(category.strip() or None) if category else None,
        customer_id=customer_id,
        material_supplier_id=material_supplier_id,
        tool_supplier_id=tool_supplier_id,
        normalized_supplier_id=normalized_supplier_id,
        filename=safe_filename,
        file_path=file_path,
        size_bytes=bytes_written,
        uploaded_by_user_id=current_user.id if current_user else None,
    )
    db.add(doc)
    db.commit()
    return db.query(OfficinaDocument).options(
        joinedload(OfficinaDocument.uploaded_by),
        joinedload(OfficinaDocument.customer),
        joinedload(OfficinaDocument.material_supplier),
        joinedload(OfficinaDocument.tool_supplier),
        joinedload(OfficinaDocument.normalized_supplier),
    ).filter(OfficinaDocument.id == doc.id).first()


@router.get("/documents/{doc_id}/download")
def download_document(doc_id: int, db: Session = Depends(get_db), _=_can_read):
    """Streaming download del PDF dal disco.

    Inline display nel browser (Content-Disposition senza attachment): l'utente
    apre il PDF in una tab/iframe senza scaricarlo a forza.
    """
    doc = db.query(OfficinaDocument).filter(OfficinaDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="File non trovato su disco")
    return FileResponse(
        doc.file_path,
        media_type="application/pdf",
        filename=doc.filename,
        # Nota: filename serve solo se il browser scarica; l'inline è il default per PDF.
    )


@router.delete("/documents/{doc_id}")
def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    _=_can_write,
):
    """Elimina record DB + blob su disco (via listener SQLAlchemy)."""
    doc = db.query(OfficinaDocument).filter(OfficinaDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    db.delete(doc)
    db.commit()
    return {"ok": True}


# ─── Categories ────────────────────────────────────────────────────────────

@router.get("/categories-full", response_model=List[OfficinaCategoryOut])
def list_categories_full(db: Session = Depends(get_db), _=_can_read):
    """Catalogo categorie con icona + sort_order. Per popolare hub e dropdown."""
    return db.query(OfficinaCategory).order_by(
        OfficinaCategory.sort_order, OfficinaCategory.name
    ).all()


@router.post("/categories", response_model=OfficinaCategoryOut)
def create_category(
    data: OfficinaCategoryCreate,
    db: Session = Depends(get_db),
    _=_can_admin_categories,
):
    name = data.name.strip()
    if db.query(OfficinaCategory).filter(OfficinaCategory.name.ilike(name)).first():
        raise HTTPException(status_code=400, detail=f"Categoria '{name}' già esistente")
    cat = OfficinaCategory(name=name, icon=data.icon, sort_order=data.sort_order)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.put("/categories/{cat_id}", response_model=OfficinaCategoryOut)
def update_category(
    cat_id: int,
    data: OfficinaCategoryUpdate,
    db: Session = Depends(get_db),
    _=_can_admin_categories,
):
    cat = db.query(OfficinaCategory).filter(OfficinaCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoria non trovata")
    payload = data.model_dump(exclude_unset=True)
    old_name = cat.name
    if 'name' in payload and payload['name']:
        new_name = payload['name'].strip()
        dup = db.query(OfficinaCategory).filter(
            OfficinaCategory.name.ilike(new_name), OfficinaCategory.id != cat_id
        ).first()
        if dup:
            raise HTTPException(status_code=400, detail=f"Categoria '{new_name}' già esistente")
        payload['name'] = new_name
        # Cascade rename sui documenti che usavano il vecchio nome
        if new_name != old_name:
            from sqlalchemy import text
            db.execute(
                text("UPDATE officina_documents SET category = :new WHERE category = :old"),
                {"new": new_name, "old": old_name},
            )
    for k, v in payload.items():
        setattr(cat, k, v)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/categories/{cat_id}")
def delete_category(
    cat_id: int,
    db: Session = Depends(get_db),
    _=_can_admin_categories,
):
    cat = db.query(OfficinaCategory).filter(OfficinaCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoria non trovata")
    block_if_in_use(
        db, f"Categoria '{cat.name}'",
        (OfficinaDocument, OfficinaDocument.category == cat.name, "documento", "documenti"),
    )
    db.delete(cat)
    db.commit()
    return {"ok": True}
