from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List

from app.core.database import get_db
from app.models import Quote, Part
from app.schemas import QuoteCreate, QuoteUpdate, QuoteOut

router = APIRouter(prefix="/api/quotes", tags=["quotes"])


@router.get("", response_model=List[QuoteOut])
def list_quotes(db: Session = Depends(get_db), skip: int = 0, limit: int = 100):
    return db.query(Quote).options(joinedload(Quote.parts)).offset(skip).limit(limit).all()


@router.post("", response_model=QuoteOut)
def create_quote(data: QuoteCreate, db: Session = Depends(get_db)):
    from datetime import date
    import random, string

    quote = Quote(**data.model_dump(exclude_unset=True))
    if not quote.quote_number:
        quote.quote_number = "Q-" + date.today().strftime("%Y%m") + "-" + "".join(random.choices(string.digits, k=4))
    db.add(quote)
    db.commit()
    db.refresh(quote)
    return quote


@router.get("/{quote_id}", response_model=QuoteOut)
def get_quote(quote_id: int, db: Session = Depends(get_db)):
    quote = db.query(Quote).options(joinedload(Quote.parts)).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    return quote


@router.put("/{quote_id}", response_model=QuoteOut)
def update_quote(quote_id: int, data: QuoteUpdate, db: Session = Depends(get_db)):
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(quote, key, value)
    db.commit()
    db.refresh(quote)
    return quote


@router.delete("/{quote_id}")
def delete_quote(quote_id: int, db: Session = Depends(get_db)):
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    db.delete(quote)
    db.commit()
    return {"ok": True}
