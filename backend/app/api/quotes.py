from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
import os

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


@router.post("/{quote_id}/send-email")
def send_quote_email(quote_id: int, email: str, db: Session = Depends(get_db)):
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")

    # SMTP config from env
    smtp_host = os.getenv('SMTP_HOST', 'smtp.gmail.com')
    smtp_port = int(os.getenv('SMTP_PORT', '587'))
    smtp_user = os.getenv('SMTP_USER', '')
    smtp_pass = os.getenv('SMTP_PASS', '')
    sender = os.getenv('SMTP_SENDER', smtp_user)

    if not smtp_user or not smtp_pass:
        raise HTTPException(status_code=500, detail="SMTP not configured")

    # Generate PDF (reuse logic from pdf.py, but we need to import it)
    from app.api.pdf import generate_quote_pdf
    pdf_path = generate_quote_pdf(quote_id, internal=False, db=db)

    # Create email
    msg = MIMEMultipart()
    msg['From'] = sender
    msg['To'] = email
    msg['Subject'] = f"Preventivo {quote.quote_number} - {quote.customer_name}"

    body = f"Gentile cliente,\n\nin allegato trova il preventivo {quote.quote_number}.\n\nCordiali saluti,\nFratelli Dalla Via"
    msg.attach(MIMEText(body, 'plain'))

    with open(pdf_path, 'rb') as f:
        part = MIMEApplication(f.read(), Name=f"preventivo_{quote.quote_number}.pdf")
    part['Content-Disposition'] = f'attachment; filename="preventivo_{quote.quote_number}.pdf"'
    msg.attach(part)

    # Send email
    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Email send failed: {str(e)}")
    finally:
        import os
        os.unlink(pdf_path)

    # Update quote status to 'sent'
    quote.status = 'sent'
    db.commit()

    return {"ok": True, "status": "sent"}
