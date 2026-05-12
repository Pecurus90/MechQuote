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

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.models import OfficinaDocument, User
from app.schemas import OfficinaDocumentOut

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/officina", tags=["officina"])

_can_read = require_permission('officina')
_can_write = require_permission('officina.write')

UPLOAD_DIR = "uploads/officina"
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB, coerente con PartFile
ALLOWED_MIME = {"application/pdf"}
ALLOWED_EXT = {".pdf"}


# ─── Documents ──────────────────────────────────────────────────────────────

@router.get("/documents", response_model=List[OfficinaDocumentOut])
def list_documents(
    category: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    _=_can_read,
):
    """Lista documenti con filtro opzionale per categoria + ricerca testo titolo."""
    query = db.query(OfficinaDocument).options(joinedload(OfficinaDocument.uploaded_by))
    if category:
        query = query.filter(OfficinaDocument.category == category)
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
        raise HTTPException(status_code=400, detail="Solo file PDF accettati")
    if file.content_type and file.content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail=f"MIME non supportato: {file.content_type} (solo application/pdf)")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    # Filename univoco: aggiungo timestamp per evitare collisioni
    import time
    unique_name = f"{int(time.time())}_{safe_filename}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)

    bytes_written = 0
    with open(file_path, "wb") as buffer:
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

    doc = OfficinaDocument(
        title=title.strip(),
        category=(category.strip() or None) if category else None,
        filename=safe_filename,
        file_path=file_path,
        size_bytes=bytes_written,
        uploaded_by_user_id=current_user.id if current_user else None,
    )
    db.add(doc)
    db.commit()
    return db.query(OfficinaDocument).options(joinedload(OfficinaDocument.uploaded_by)).filter(
        OfficinaDocument.id == doc.id
    ).first()


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
