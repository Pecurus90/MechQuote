from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_permission
from app.models import CompanySettings
from app.schemas import CompanySettingsOut, CompanySettingsUpdate

router = APIRouter(prefix="/api", tags=["company"])


def _get_or_create(db: Session) -> CompanySettings:
    cs = db.query(CompanySettings).filter(CompanySettings.id == 1).first()
    if not cs:
        cs = CompanySettings(id=1)
        db.add(cs)
        db.commit()
        db.refresh(cs)
    return cs


@router.get("/company-settings", response_model=CompanySettingsOut)
def get_company_settings(db: Session = Depends(get_db)):
    """Singleton: chiunque autenticato lo legge (serve per pre-popolare i form)."""
    return _get_or_create(db)


@router.put("/company-settings", response_model=CompanySettingsOut, dependencies=[require_permission('company')])
def update_company_settings(data: CompanySettingsUpdate, db: Session = Depends(get_db)):
    cs = _get_or_create(db)
    # exclude_unset: un PUT parziale aggiorna SOLO i campi inviati; senza,
    # i campi omessi verrebbero azzerati al default dello schema (footgun).
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(cs, key, value)
    db.commit()
    db.refresh(cs)
    return cs
