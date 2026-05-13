"""API DXF — analisi in-memory di file DXF per il preventivatore Wire EDM.

POST /api/dxf/analyze: riceve un file DXF, ritorna profili (lunghezza,
chiuso/aperto, bbox, svg_path) per il viewer e i suggerimenti per i campi
della fase Wire EDM (lunghezza totale, n° pierce).

Nessuna persistenza: il file non viene salvato. Il wizard "Nuovo Preventivo 2D"
(Step 3) lo salverà come PartFile quando l'utente conferma il preventivo.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Query

from app.core.security import require_permission
from app.schemas import DxfAnalysisOut
from app.services.dxf_parser import parse_dxf, DEFAULT_TOLERANCE

router = APIRouter(prefix="/api", tags=["dxf"])

# 50 MB, allineato al limite di parts.upload_file
MAX_DXF_SIZE = 50 * 1024 * 1024


@router.post("/dxf/analyze", response_model=DxfAnalysisOut)
async def analyze_dxf(
    file: UploadFile = File(...),
    tolerance_mm: float = Query(DEFAULT_TOLERANCE, ge=0.0, le=1.0,
                                description="Tolleranza matching endpoint per stitching profili"),
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

    try:
        result = parse_dxf(content, tolerance=tolerance_mm)
    except ValueError as e:
        raise HTTPException(400, str(e))

    return result
