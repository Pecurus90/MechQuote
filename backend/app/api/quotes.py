from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
import os

from app.core.database import get_db
from app.models import Quote, Part, ManufacturingPhase
from app.schemas import QuoteCreate, QuoteUpdate, QuoteOut, SendEmailRequest
from app.services.calculation import recalculate_part

router = APIRouter(prefix="/api/quotes", tags=["quotes"])


def _load_quote(quote_id: int, db: Session) -> Quote:
    return db.query(Quote).options(
        joinedload(Quote.parts).options(
            joinedload(Part.phases),
            joinedload(Part.material),
            joinedload(Part.files),
        ),
        joinedload(Quote.customer),
    ).filter(Quote.id == quote_id).first()


@router.get("", response_model=List[QuoteOut])
def list_quotes(db: Session = Depends(get_db), skip: int = 0, limit: int = 100):
    quotes = db.query(Quote).options(
        joinedload(Quote.parts).options(
            joinedload(Part.phases),
            joinedload(Part.material),
        )
    ).offset(skip).limit(limit).all()
    return quotes


@router.post("", response_model=QuoteOut)
def create_quote(data: QuoteCreate, db: Session = Depends(get_db)):
    from datetime import date as date_type

    num_components = data.num_components
    quote_data = data.model_dump(exclude={"num_components"}, exclude_unset=True)

    quote = Quote(**quote_data)
    if not quote.quote_date:
        quote.quote_date = date_type.today()

    db.add(quote)
    db.commit()
    db.refresh(quote)

    # Auto-create parts based on quote type
    if quote.quote_type == "commessa" and num_components and num_components > 0:
        for i in range(1, num_components + 1):
            part = Part(
                quote_id=quote.id,
                part_code=f"{quote.quote_number}_{i:02d}",
                quantity=1,
                quote_mode="manual",
            )
            db.add(part)
    else:
        # Single part — code matches the quote number
        part = Part(
            quote_id=quote.id,
            part_code=quote.quote_number or "P01",
            quantity=1,
            quote_mode="manual",
        )
        db.add(part)

    db.commit()

    result = _load_quote(quote.id, db)
    return result


@router.get("/{quote_id}", response_model=QuoteOut)
def get_quote(quote_id: int, db: Session = Depends(get_db)):
    quote = _load_quote(quote_id, db)
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
    return _load_quote(quote_id, db)


@router.post("/{quote_id}/recalculate", response_model=QuoteOut)
def recalculate_quote(quote_id: int, db: Session = Depends(get_db)):
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    for part in db.query(Part).filter(Part.quote_id == quote_id).all():
        recalculate_part(part.id, db)
    return _load_quote(quote_id, db)


@router.delete("/{quote_id}")
def delete_quote(quote_id: int, db: Session = Depends(get_db)):
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    db.delete(quote)
    db.commit()
    return {"ok": True}


@router.post("/{quote_id}/send-email")
def send_quote_email(quote_id: int, req: SendEmailRequest, db: Session = Depends(get_db)):
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")

    smtp_host = os.getenv('SMTP_HOST', 'smtp.gmail.com')
    smtp_port = int(os.getenv('SMTP_PORT', '587'))
    smtp_user = os.getenv('SMTP_USER', '')
    smtp_pass = os.getenv('SMTP_PASS', '')
    sender = os.getenv('SMTP_SENDER', smtp_user)

    if not smtp_user or not smtp_pass:
        raise HTTPException(status_code=500, detail="SMTP non configurato")

    from app.api.pdf import generate_quote_pdf
    pdf_path = generate_quote_pdf(quote_id, internal=False, db=db)

    msg = MIMEMultipart()
    msg['From'] = sender
    msg['To'] = req.email
    msg['Subject'] = f"Preventivo {quote.quote_number} - {quote.customer_name or ''}"

    body = (
        f"Gentile cliente,\n\n"
        f"in allegato trova il preventivo {quote.quote_number}.\n\n"
        f"Cordiali saluti,\nFratelli Dalla Via"
    )
    msg.attach(MIMEText(body, 'plain'))

    with open(pdf_path, 'rb') as f:
        attachment = MIMEApplication(f.read(), Name=f"preventivo_{quote.quote_number}.pdf")
    attachment['Content-Disposition'] = f'attachment; filename="preventivo_{quote.quote_number}.pdf"'
    msg.attach(attachment)

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Invio email fallito: {str(e)}")
    finally:
        try:
            os.unlink(pdf_path)
        except Exception:
            pass

    quote.status = 'sent'
    db.commit()
    return {"ok": True}
