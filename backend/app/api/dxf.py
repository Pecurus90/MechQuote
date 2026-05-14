"""API DXF — analisi in-memory di file DXF per il preventivatore Wire EDM.

POST /api/dxf/analyze: riceve un file DXF, ritorna profili (lunghezza,
chiuso/aperto, bbox, svg_path) per il viewer e i suggerimenti per i campi
della fase Wire EDM (lunghezza totale, n° pierce).

Nessuna persistenza: il file non viene salvato. Il wizard "Nuovo Preventivo 2D"
(Step 3) lo salverà come PartFile quando l'utente conferma il preventivo.
"""

import os

from fastapi import APIRouter, UploadFile, File, HTTPException, Query, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_permission
from app.models import PartFile
from app.schemas import DxfAnalysisOut
from app.services.dxf_parser import parse_dxf, DEFAULT_TOLERANCE

router = APIRouter(prefix="/api", tags=["dxf"])

# 50 MB, allineato al limite di parts.upload_file
MAX_DXF_SIZE = 50 * 1024 * 1024


@router.post("/dxf/analyze", response_model=DxfAnalysisOut)
async def analyze_dxf(
    file: UploadFile = File(...),
    tolerance_mm: float = Query(DEFAULT_TOLERANCE, gt=0.0, le=1.0,
                                description="Tolleranza matching endpoint per stitching profili (mm). >0: con tol=0 round(x/tol) → ZeroDivisionError nel parser."),
    _=require_permission('quotes.create'),
):
    """Analizza un DXF e ritorna i profili rilevati.

    Auth: chiunque possa creare preventivi.
    """
    name = (file.filename or '').lower()
    if not name.endswith('.dxf'):
        raise HTTPException(400, "Formato non supportato: usare file .dxf (DWG va convertito)")

    # Stream a chunk con check incrementale: evita di accumulare in RAM file
    # che superano MAX_DXF_SIZE prima di scoprirlo. Pattern allineato a
    # parts.upload_file. Anche se l'endpoint è gated (quotes.create), 10
    # upload paralleli da 50MB sarebbero 500MB di picco RAM senza streaming.
    chunks: list[bytes] = []
    total = 0
    CHUNK = 1024 * 1024  # 1 MB
    while True:
        chunk = await file.read(CHUNK)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_DXF_SIZE:
            raise HTTPException(
                413,
                f"File troppo grande (max {MAX_DXF_SIZE // (1024*1024)} MB)",
            )
        chunks.append(chunk)

    if total == 0:
        raise HTTPException(400, "File vuoto")
    content = b"".join(chunks)

    # Magic byte check: un DXF ASCII inizia con "0\nSECTION" o whitespace + "0".
    # Senza questo controllo, file ZIP/PDF rinominati `.dxf` arrivano al parser
    # ezdxf che solleva ValueError generica → l'utente vedeva "DXF non valido o
    # corrotto" senza capire perché. Con il check, messaggio specifico.
    head = content[:32].lstrip()
    if not head.startswith(b"0"):
        raise HTTPException(
            400,
            "File non sembra un DXF valido (header non riconosciuto). "
            "Verifica che il file sia un DXF ASCII e non sia stato rinominato."
        )

    try:
        result = parse_dxf(content, tolerance=tolerance_mm)
    except ValueError as e:
        raise HTTPException(400, str(e))

    return result


@router.get("/dxf/analyze-part-file/{part_file_id}", response_model=DxfAnalysisOut)
def analyze_part_file(
    part_file_id: int,
    db: Session = Depends(get_db),
    _=require_permission('quotes.create'),
):
    """Ri-analizza un DXF già allegato a una Part. Usato dal modale "Carica da
    DXF" della fase EDM quando si vuole modificare la selezione profili senza
    ri-uploadare il file.
    """
    pf = db.query(PartFile).filter(PartFile.id == part_file_id).first()
    if not pf:
        raise HTTPException(404, "File non trovato")
    if pf.file_type != 'dxf':
        raise HTTPException(400, "Il file allegato non è un DXF")
    if not os.path.exists(pf.path):
        raise HTTPException(404, "File assente su disco (potrebbe essere stato spostato)")
    try:
        with open(pf.path, 'rb') as f:
            content = f.read()
        result = parse_dxf(content)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return result
