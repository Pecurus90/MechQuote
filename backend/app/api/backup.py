from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db, engine
from app.models import (
    Quote, Part, ManufacturingPhase, Material, Machine,
    Treatment, Supplier, CostRule, PhaseTemplate, StepColorRule, User,
)
import json
import io
from datetime import date

router = APIRouter(prefix="/api/backup", tags=["backup"])


@router.get("/export")
def export_data(db: Session = Depends(get_db)):
    data = {}
    # Export all tables
    for model_class in [Quote, Part, ManufacturingPhase, Material, Machine, Treatment, Supplier, CostRule, PhaseTemplate, StepColorRule, User]:
        table_name = model_class.__tablename__
        records = db.query(model_class).all()
        data[table_name] = []
        for rec in records:
            rec_dict = {}
            for col in rec.__table__.columns:
                val = getattr(rec, col.name)
                if isinstance(val, date):
                    val = val.isoformat()
                rec_dict[col.name] = val
            data[table_name].append(rec_dict)
    return data


@router.post("/import")
def import_data(payload: dict, db: Session = Depends(get_db)):
    # Clear existing data (be careful!)
    # This is a simple implementation - in production you'd want more checks
    for model_class in [StepColorRule, PhaseTemplate, CostRule, Supplier, Treatment, Machine, Material, ManufacturingPhase, Part, Quote]:
        db.query(model_class).delete()
    db.commit()

    # Import data
    table_map = {
        'quotes': Quote,
        'parts': Part,
        'manufacturing_phases': ManufacturingPhase,
        'materials': Material,
        'machines': Machine,
        'treatments': Treatment,
        'suppliers': Supplier,
        'cost_rules': CostRule,
        'phase_templates': PhaseTemplate,
        'step_color_rules': StepColorRule,
    }

    for table_name, records in payload.items():
        if table_name not in table_map:
            continue
        model_class = table_map[table_name]
        for rec_data in records:
            # Remove id to avoid conflicts
            rec_data.pop('id', None)
            obj = model_class(**rec_data)
            db.add(obj)
    db.commit()
    return {"ok": True, "message": "Data imported successfully"}
