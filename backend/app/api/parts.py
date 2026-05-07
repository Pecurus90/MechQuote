from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from typing import List
import os
import shutil

from app.core.database import get_db
from app.models import Part, ManufacturingPhase, PartFile, GeometryAnalysis
from app.schemas import PartCreate, PartUpdate, PartOut
from app.services.calculation import recalculate_part

router = APIRouter(prefix="/api", tags=["parts"])


@router.post("/quotes/{quote_id}/parts", response_model=PartOut)
def add_part(quote_id: int, data: PartCreate, db: Session = Depends(get_db)):
    part = Part(quote_id=quote_id, **data.model_dump(exclude_unset=True))
    db.add(part)
    db.commit()
    db.refresh(part)
    recalculate_part(part.id, db)
    return db.query(Part).options(
        joinedload(Part.phases),
        joinedload(Part.material),
        joinedload(Part.files),
    ).filter(Part.id == part.id).first()


@router.get("/parts/{part_id}", response_model=PartOut)
def get_part(part_id: int, db: Session = Depends(get_db)):
    part = db.query(Part).options(
        joinedload(Part.phases),
        joinedload(Part.material),
        joinedload(Part.files),
    ).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    return part


@router.put("/parts/{part_id}", response_model=PartOut)
def update_part(part_id: int, data: PartUpdate, db: Session = Depends(get_db)):
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(part, key, value)
    db.commit()
    recalculate_part(part_id, db)
    part = db.query(Part).options(
        joinedload(Part.phases),
        joinedload(Part.material),
        joinedload(Part.files),
    ).filter(Part.id == part_id).first()
    return part


@router.delete("/parts/{part_id}")
def delete_part(part_id: int, db: Session = Depends(get_db)):
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    db.delete(part)
    db.commit()
    return {"ok": True}


@router.post("/parts/{part_id}/duplicate", response_model=PartOut)
def duplicate_part(part_id: int, db: Session = Depends(get_db)):
    part = db.query(Part).options(joinedload(Part.phases)).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    new_part = Part(
        quote_id=part.quote_id,
        part_code=part.part_code + "_copia",
        revision=part.revision,
        description=part.description,
        quantity=part.quantity,
        quote_mode=part.quote_mode,
        material_id=part.material_id,
        raw_x_mm=part.raw_x_mm,
        raw_y_mm=part.raw_y_mm,
        raw_z_mm=part.raw_z_mm,
        raw_diameter_mm=part.raw_diameter_mm,
        finished_weight_kg=part.finished_weight_kg,
        material_cost=part.material_cost,
        material_delivery_cost=part.material_delivery_cost,
        margin_percent=part.margin_percent,
        minimum_price=part.minimum_price,
        rounding_rule=part.rounding_rule,
        confidence_level=part.confidence_level,
        customer_notes=part.customer_notes,
        internal_notes=part.internal_notes,
    )
    db.add(new_part)
    db.commit()
    db.refresh(new_part)

    # Copy phases
    for ph in part.phases:
        new_ph = ManufacturingPhase(
            part_id=new_part.id,
            sequence_number=ph.sequence_number,
            phase_type=ph.phase_type,
            description=ph.description,
            machine_id=ph.machine_id,
            supplier_id=ph.supplier_id,
            treatment_id=ph.treatment_id,
            setup_hours=ph.setup_hours,
            cycle_hours_per_part=ph.cycle_hours_per_part,
            fixed_cost=ph.fixed_cost,
            variable_cost_per_part=ph.variable_cost_per_part,
            hourly_rate_override=ph.hourly_rate_override,
            customer_visible=ph.customer_visible,
            is_shared=ph.is_shared,
            internal_notes=ph.internal_notes,
            customer_notes=ph.customer_notes,
        )
        db.add(new_ph)

    db.commit()
    recalculate_part(new_part.id, db)

    return db.query(Part).options(
        joinedload(Part.phases),
        joinedload(Part.material),
        joinedload(Part.files),
    ).filter(Part.id == new_part.id).first()


@router.post("/parts/{part_id}/files")
def upload_file(part_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    safe_filename = os.path.basename(file.filename or "upload").replace("..", "").strip("/\\")
    if not safe_filename:
        safe_filename = "upload"
    ext = os.path.splitext(safe_filename)[1].lower()
    if ext == '.dxf':
        file_type = 'dxf'
    elif ext in ('.step', '.stp'):
        file_type = 'step'
    elif ext == '.pdf':
        file_type = 'pdf'
    elif ext in ('.png', '.jpg', '.jpeg', '.gif', '.bmp'):
        file_type = 'image'
    else:
        file_type = 'other'

    os.makedirs("uploads", exist_ok=True)
    file_path = f"uploads/part_{part_id}_{safe_filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    part_file = PartFile(
        part_id=part_id,
        file_type=file_type,
        filename=safe_filename,
        path=file_path,
    )
    db.add(part_file)
    db.commit()
    db.refresh(part_file)

    if file_type == 'dxf':
        try:
            import ezdxf
            doc = ezdxf.readfile(file_path)
            msp = doc.modelspace()
            total_length = 0
            profile_count = 0
            for entity in msp:
                if entity.dxftype() == 'LINE':
                    total_length += entity.dxf.start.distance(entity.dxf.end)
                    profile_count += 1
                elif entity.dxftype() in ('CIRCLE', 'ARC', 'LWPOLYLINE', 'SPLINE'):
                    profile_count += 1

            geo = GeometryAnalysis(
                part_id=part_id,
                source_file_id=part_file.id,
                dxf_total_length_mm=total_length,
                dxf_profile_count=profile_count,
                confidence_level='medium',
            )
            db.add(geo)
            db.commit()
        except Exception as e:
            print(f"DXF analysis error: {e}")

    return {"ok": True, "file_id": part_file.id, "path": file_path}


@router.delete("/files/{file_id}")
def delete_file(file_id: int, db: Session = Depends(get_db)):
    pf = db.query(PartFile).filter(PartFile.id == file_id).first()
    if not pf:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        os.remove(pf.path)
    except Exception:
        pass
    db.delete(pf)
    db.commit()
    return {"ok": True}
