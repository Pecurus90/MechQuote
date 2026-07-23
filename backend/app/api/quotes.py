import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload
from typing import List

from app.core.database import get_db, utc_now
from app.core.security import require_permission, get_current_user
from app.models import (
    Quote, Part, ManufacturingPhase, QuoteSupplierOrder, User,
    CompanySettings,
)
from app.schemas import QuoteCreate, QuoteUpdate, QuoteOut, QuoteStatusUpdate, QuoteCloseoutUpdate
from app.services import quote_workflow as wf
from app.services.material_status import unassigned_supplier_parts
from app.services.calculation import (
    recalculate_part,
    recalculate_quote as svc_recalculate_quote,
    recompute_final_total,
)
from app.services.notifications import create_notification

logger = logging.getLogger(__name__)
_can_write = require_permission('quotes.create')
_can_send = require_permission('quotes.send')
_can_confirm = require_permission('quotes.confirm')
_can_archive = require_permission('quotes.archive')

router = APIRouter(prefix="/api/quotes", tags=["quotes"])


def _load_quote(quote_id: int, db: Session) -> Quote:
    return db.query(Quote).options(
        joinedload(Quote.parts).options(
            joinedload(Part.phases).options(
                # CAT-1 Fase 2: PhaseOut espone le voci di catalogo agganciate
                # (machine/operation/treatment/supplier) per costruire l'option
                # "ritirato" nelle dropdown del preventivatore quando il GET
                # di lista è filtrato `?active=true`. Joinedload mirato per
                # evitare N+1 in serializzazione.
                joinedload(ManufacturingPhase.machine),
                joinedload(ManufacturingPhase.operation),
                joinedload(ManufacturingPhase.treatment),
                joinedload(ManufacturingPhase.supplier),
            ),
            joinedload(Part.material),
            joinedload(Part.files),
        ),
        joinedload(Quote.customer),
        joinedload(Quote.created_by),
        joinedload(Quote.submitted_by),
        joinedload(Quote.read_by),
        joinedload(Quote.confirmed_by),
        joinedload(Quote.completed_by),
    ).filter(Quote.id == quote_id).first()


def ensure_editable(quote: Quote, current_user: User) -> None:
    """Visibile E modificabile: modificabile fino a 'letto'; bloccato dalla Conferma.

    Spec 18: si modifica in bozza/inviato/letto, poi la Conferma manuale di
    amministrazione blocca (confermato/completo). Chi ha 'quotes.edit_locked'
    (default: solo admin) può modificare anche i preventivi bloccati.
    Esportata per parts.py / phases.py — mutare parti o fasi è modificare il
    preventivo.

    Include la ACL di proprietà (`ensure_quote_visible`) come PRIMO check:
    mutare un preventivo che non puoi vedere non deve essere possibile. Così
    ogni sito che già chiama `ensure_editable` (update_quote, recalculate,
    tutte le scritture di parts.py/phases.py) eredita l'ACL senza doverla
    ricordare a mano — la causa del leak per-id era proprio un sito dimenticato.
    """
    ensure_quote_visible(quote, current_user)
    if wf.is_editable(quote.status):
        return
    if 'quotes.edit_locked' in getattr(current_user, '_permissions', []):
        return
    raise HTTPException(
        status_code=403,
        detail=f"Preventivo non più modificabile (stato: {quote.status})",
    )


def ensure_quote_visible(quote: Quote, current_user: User) -> None:
    """ACL per-preventivo: chi non ha 'quotes.view_all' agisce SOLO sui propri.

    Stesso filtro di list_archive/material-detail — va chiamato da ogni endpoint
    per-id che opera su un singolo preventivo (closeout, ...) così l'ACL non
    diverge tra la lista (che nasconde) e le azioni (che agirebbero per id).
    """
    perms = getattr(current_user, '_permissions', [])
    if 'quotes.view_all' in perms:
        return
    if quote.created_by_user_id is not None and quote.created_by_user_id == current_user.id:
        return
    raise HTTPException(status_code=403, detail="Accesso negato a questo preventivo")


@router.get("", response_model=List[QuoteOut])
def list_quotes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100,
):
    # ACL: chi non ha 'quotes.view_all' (default: admin + amministrazione)
    # vede solo i preventivi che ha creato lui. Allineato a dashboard.my-quotes
    # filter (created_by_user_id).
    # AUD-45: selectinload sulle collezioni (parts, phases) invece di
    # joinedload. Il joinedload di collezioni produce un prodotto cartesiano
    # parts×phases per preventivo E rende ambiguo il LIMIT (applicato alle
    # righe del join, non ai preventivi distinti). selectinload usa query IN
    # separate → niente cartesiano, LIMIT corretto. material resta joinedload
    # (many-to-one, singola riga). Stesso pattern di quotes_archive.py.
    query = db.query(Quote).options(
        selectinload(Quote.parts).options(
            selectinload(Part.phases),
            joinedload(Part.material),
        )
    )
    if 'quotes.view_all' not in getattr(current_user, '_permissions', []):
        query = query.filter(Quote.created_by_user_id == current_user.id)
    return query.offset(skip).limit(limit).all()


@router.post("", response_model=QuoteOut)
def create_quote(
    data: QuoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    from datetime import date as date_type

    num_components = data.num_components
    # Cintura-e-bretelle: lo schema impone già ge=1, ma clampiamo comunque per
    # evitare che una qty < 1 (es. payload che salta lo schema) crei una parte
    # con quantity negativa — riga che poi fa 500 la lista via validazione PartOut.
    default_quantity = max(1, data.default_quantity or 1)
    quote_data = data.model_dump(exclude={"num_components", "default_quantity"}, exclude_unset=True)

    # Pre-check duplicato: meglio 400 esplicito di un IntegrityError 500
    if db.query(Quote).filter(Quote.quote_number == quote_data["quote_number"]).first():
        raise HTTPException(status_code=400, detail=f"Numero preventivo '{quote_data['quote_number']}' già esistente")

    quote = Quote(**quote_data)
    if not quote.quote_date:
        quote.quote_date = date_type.today()
    quote.created_by_user_id = current_user.id

    # Applica i default da CompanySettings dove l'utente non ha specificato un valore.
    # `exclude_unset=True` su quote_data permette di distinguere "non passato" da "passato a 0".
    cs = db.query(CompanySettings).filter(CompanySettings.id == 1).first()
    if cs:
        if "global_margin_percent" not in quote_data:
            quote.global_margin_percent = cs.default_margin_percent
        if "transport_cost" not in quote_data:
            quote.transport_cost = cs.default_transport_cost
        if "packaging_cost" not in quote_data:
            quote.packaging_cost = cs.default_packaging_cost

    db.add(quote)
    try:
        db.commit()
    except IntegrityError:
        # Race: due POST simultanei con stesso quote_number passano entrambi
        # il pre-check (riga sopra) e poi una commit fallisce per UNIQUE
        # constraint violato. Senza catch, l'utente vedeva 500 generico.
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Numero preventivo '{quote_data['quote_number']}' già esistente",
        )
    db.refresh(quote)

    # Auto-create parts based on quote type. Margine materializzato (Blocco A):
    # la parte nasce col margine esplicito del preventivo, non NULL-che-eredita.
    default_min_price = cs.default_minimum_part_price if cs else 0.0
    default_margin = quote.global_margin_percent
    if quote.quote_type == "commessa" and num_components and num_components > 0:
        for i in range(1, num_components + 1):
            part = Part(
                quote_id=quote.id,
                part_code=f"{quote.quote_number}_{i:02d}",
                quantity=default_quantity,
                quote_mode="manual",
                minimum_price=default_min_price,
                margin_percent=default_margin,
            )
            db.add(part)
    else:
        # Single part — code matches the quote number
        part = Part(
            quote_id=quote.id,
            part_code=quote.quote_number or "P01",
            quantity=default_quantity,
            quote_mode="manual",
            minimum_price=default_min_price,
            margin_percent=default_margin,
        )
        db.add(part)

    db.commit()

    logger.info("Quote creato: id=%s number=%r by=%s parts=%d",
                quote.id, quote.quote_number, current_user.username,
                num_components if num_components else 1)
    result = _load_quote(quote.id, db)
    return result


@router.get("/{quote_id}", response_model=QuoteOut)
def get_quote(quote_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    quote = _load_quote(quote_id, db)
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    ensure_quote_visible(quote, current_user)
    # La marcatura 'letto' NON avviene più qui (side-effect su GET, audit M4):
    # è un endpoint esplicito POST /{id}/read che il frontend chiama all'apertura
    # reale. Così un prefetch/retry della GET non altera lo stato.
    return quote


@router.get("/{quote_id}/version")
def get_quote_version(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Versione leggera dell'aggregato preventivo (`updated_at`) per il
    rilevamento concorrenza dell'editor: polling economico senza caricare
    parti/fasi. `updated_at` viene bumpato a ogni ricalcolo (services/calculation)
    e a ogni PUT quote, quindi cambia per qualsiasi modifica al preventivo."""
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    ensure_quote_visible(quote, current_user)
    return {"id": quote.id, "updated_at": quote.updated_at}


@router.patch("/{quote_id}/status", response_model=QuoteOut)
def update_quote_status(
    quote_id: int,
    data: QuoteStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_send,
):
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    ensure_quote_visible(quote, current_user)

    # Questa route gestisce solo bozza → inviato. Il resto del ciclo (spec 18):
    # inviato → letto (auto in GET all'apertura di amministrazione),
    # letto → confermato (POST /confirm), confermato → completo (auto).
    if data.status != 'inviato':
        raise HTTPException(status_code=400, detail="Solo la transizione a 'inviato' è permessa qui")
    # TD-16: si invia per revisione da 'bozza' (nuovo) o 'in_revisione' (rimandato indietro).
    if quote.status not in (wf.STATUS_BOZZA, wf.STATUS_IN_REVISIONE):
        raise HTTPException(status_code=400, detail=f"Impossibile inviare: stato corrente '{quote.status}'")

    quote.status = 'inviato'
    quote.submitted_by_user_id = current_user.id
    quote.submitted_at = utc_now()
    # Notifica chi può completare (admin + amministrazione). F7: commit=False
    # → persistita nella stessa transazione del cambio stato (un solo commit).
    sender_name = current_user.full_name or current_user.username
    create_notification(
        db,
        type='quote_submitted',
        title=f"Preventivo {quote.quote_number} da revisionare",
        body=f"Inviato da {sender_name}",
        created_by_user_id=current_user.id,
        target_roles=['admin', 'amministrazione'],
        data={'quote_id': quote.id, 'quote_number': quote.quote_number},
        commit=False,
    )
    db.commit()

    return _load_quote(quote_id, db)


def notify_quote_completed(db: Session, quote: Quote, actor_user: User) -> None:
    """Notifica al creatore che il preventivo è passato a 'completo'.

    Riusata da confirm_quote e da api/orders.py (ultimo ordine materiale che
    porta il preventivo a completo). Dedupata via UNIQUE INDEX su DB
    (type='quote_completed', target_user_id, target_quote_id).
    """
    target = quote.submitted_by_user_id or quote.created_by_user_id
    if not target:
        return
    if target == actor_user.id:
        return  # niente auto-notifica: chi completa è lo stesso destinatario
    actor = actor_user.full_name or actor_user.username
    create_notification(
        db,
        type='quote_completed',
        title=f"Preventivo {quote.quote_number} completato",
        body=f"Completato ({actor})",
        created_by_user_id=actor_user.id,
        target_user_id=target,
        data={'quote_id': quote.id, 'quote_number': quote.quote_number},
    )


@router.post("/{quote_id}/read", response_model=QuoteOut)
def mark_quote_read(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_confirm,
):
    """Amministrazione ha aperto un preventivo 'inviato' → 'letto' (spec 18).

    Endpoint esplicito, chiamato dal frontend all'apertura reale: prima era un
    side-effect sulla GET /{id} (audit M4), che un prefetch/retry poteva
    innescare. Idempotente: UPDATE atomico con WHERE status='inviato', no-op sugli
    altri stati; sotto apertura concorrente solo un thread scrive → una sola
    notifica.
    """
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    ensure_quote_visible(quote, current_user)  # ACL per-id (audit M1)
    if quote.status == 'inviato':
        result = db.execute(
            text("UPDATE quotes SET status='letto', "
                 "read_by_user_id=:uid, read_at=:ts "
                 "WHERE id=:qid AND status='inviato'"),
            {"uid": current_user.id, "ts": utc_now(), "qid": quote_id},
        )
        changed = result.rowcount
        # Notifica "letto" al creatore/mittente: sa che l'offerta è stata presa
        # in carico. `changed` (rowcount dell'UPDATE atomico) garantisce che sia
        # stato QUESTO thread a transire → una sola notifica; guard
        # anti-auto-notifica (lettore == creatore) come le altre transizioni.
        # F7: commit=False → l'UPDATE 'letto' e la notifica committano insieme.
        target = quote.submitted_by_user_id or quote.created_by_user_id
        if changed and target and target != current_user.id:
            actor = current_user.full_name or current_user.username
            create_notification(
                db,
                type='quote_read',
                title=f"Preventivo {quote.quote_number} letto",
                body=f"Preso in carico da {actor}",
                created_by_user_id=current_user.id,
                target_user_id=target,
                data={'quote_id': quote.id, 'quote_number': quote.quote_number},
                commit=False,
            )
        db.commit()
    return _load_quote(quote_id, db)


@router.post("/{quote_id}/confirm", response_model=QuoteOut)
def confirm_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_confirm,
):
    """Conferma manuale (amministrazione) = il cliente ha ordinato.

    Da inviato/letto/in_attesa_cliente → confermato. Da qui il preventivo è
    bloccato in modifica. Se il materiale è già risolto (non necessario o
    tutto evaso) passa subito a 'completo'.
    """
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    ensure_quote_visible(quote, current_user)  # ACL per-id (audit M1)
    if quote.status not in (wf.STATUS_INVIATO, wf.STATUS_LETTO, wf.STATUS_IN_ATTESA_CLIENTE):
        raise HTTPException(
            status_code=400,
            detail=f"Conferma non possibile dallo stato '{quote.status}'",
        )
    # Guardia spec 18 §2: una parte con materiale da ordinare ma SENZA fornitore
    # non potrà mai essere evasa → il preventivo resterebbe bloccato in
    # 'confermato' senza mai raggiungere 'completo'. Impedisci la conferma finché
    # non si assegna un fornitore.
    parts = db.query(Part).options(joinedload(Part.material)).filter(
        Part.quote_id == quote.id
    ).all()
    missing = unassigned_supplier_parts(parts)
    if missing:
        codes = ', '.join(sorted(p.part_code for p in missing))
        raise HTTPException(
            status_code=400,
            detail=f"Conferma bloccata: assegna un fornitore al materiale di {codes}.",
        )
    quote.status = wf.STATUS_CONFERMATO
    quote.confirmed_by_user_id = current_user.id
    quote.confirmed_at = utc_now()
    completed = wf.maybe_complete(db, quote, current_user.id)

    actor = current_user.full_name or current_user.username
    # F22: fallback al creatore se manca il submitter (come notify_quote_completed).
    # F24: niente auto-notifica se chi conferma è anche il destinatario.
    confirm_target = quote.submitted_by_user_id or quote.created_by_user_id
    if confirm_target and confirm_target != current_user.id:
        create_notification(
            db,
            type='quote_confirmed',
            title=f"Preventivo {quote.quote_number} confermato",
            body=f"Confermato da {actor}",
            created_by_user_id=current_user.id,
            target_user_id=confirm_target,
            data={'quote_id': quote.id, 'quote_number': quote.quote_number},
            commit=False,
        )
    # F7: stato (confermato + eventuale completo) e quote_confirmed committano
    # insieme. quote_completed resta su commit proprio (UNIQUE dedupe + doppia
    # sorgente: qui e ultimo ordine materiale in orders.py).
    db.commit()
    if completed:
        notify_quote_completed(db, quote, current_user)
    return _load_quote(quote_id, db)


@router.post("/{quote_id}/reopen", response_model=QuoteOut)
def reopen_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_confirm,
):
    """Manda in revisione (amministrazione): inviato/letto/in_attesa_cliente →
    in_revisione (TD-16). Prima portava a 'bozza'; ora a 'in_revisione', così il
    preventivo resta riconoscibile come revisione e conserva il prezzo
    precedente (`revision_baseline_total`) per il confronto nell'editor."""
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    ensure_quote_visible(quote, current_user)  # ACL per-id (audit M1)
    if quote.status not in (wf.STATUS_INVIATO, wf.STATUS_LETTO, wf.STATUS_IN_ATTESA_CLIENTE):
        raise HTTPException(
            status_code=400,
            detail=f"Invio in revisione non possibile dallo stato '{quote.status}'",
        )
    # La notifica di "rimandato in revisione" va a chi ha INVIATO il preventivo
    # (submitted_by), con fallback al creatore — coerente con le notifiche
    # 'letto'/'completato'. Catturato PRIMA di azzerare submitted_by_user_id.
    target_id = quote.submitted_by_user_id or quote.created_by_user_id
    # TD-16: snapshot del prezzo attuale (quello revisionato/mandato al cliente)
    # come baseline per il confronto dopo le modifiche del tecnico.
    quote.revision_baseline_total = quote.final_total
    quote.revision_baseline_at = utc_now()
    quote.status = wf.STATUS_IN_REVISIONE
    quote.submitted_at = None
    quote.submitted_by_user_id = None
    quote.read_at = None
    quote.read_by_user_id = None
    quote.awaiting_client_at = None
    # Tornando prima della Conferma il materiale non è più "ordinato": azzera le
    # evasioni (coppie preventivo-fornitore) come fa unconfirm. L'ordine resta
    # nello storico (MaterialOrder), ma il materiale va riordinato.
    db.query(QuoteSupplierOrder).filter(QuoteSupplierOrder.quote_id == quote_id).delete()
    quote.material_ordered_at = None
    quote.material_ordered_by_user_id = None
    if target_id and target_id != current_user.id:
        actor = current_user.full_name or current_user.username
        create_notification(
            db,
            type='quote_reopened',
            title=f"Preventivo {quote.quote_number} rimandato in revisione",
            body=f"Rimandato da {actor} — serve una revisione",
            created_by_user_id=current_user.id,
            target_user_id=target_id,
            data={'quote_id': quote.id, 'quote_number': quote.quote_number},
            commit=False,
        )
    db.commit()   # F7: cambio stato + notifica in un solo commit atomico
    return _load_quote(quote_id, db)


@router.post("/{quote_id}/unconfirm", response_model=QuoteOut)
def unconfirm_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Annulla la conferma (confermato/completo → letto).

    Riservato a chi ha 'quotes.edit_locked' (default: solo admin): è la stessa
    capacità di intervenire su un preventivo bloccato. Azzera le coppie
    (preventivo, fornitore) ordinate — l'ordine resta nello storico ma il
    materiale va riordinato — e sblocca la modifica.
    """
    # Chi può confermare può anche annullare la propria conferma (altrimenti
    # l'amministrazione resterebbe bloccata su una conferma per errore, senza
    # 'edit_locked'); anche chi ha 'edit_locked' (intervento su bloccati).
    perms = getattr(current_user, '_permissions', [])
    if not ('quotes.confirm' in perms or 'quotes.edit_locked' in perms):
        raise HTTPException(
            status_code=403,
            detail="Permesso negato: serve 'Conferma preventivo' o 'Modifica preventivi bloccati'",
        )
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    ensure_quote_visible(quote, current_user)  # ACL per-id (audit M1)
    if quote.status not in (wf.STATUS_CONFERMATO, wf.STATUS_COMPLETO):
        raise HTTPException(
            status_code=400,
            detail=f"Nessuna conferma da annullare (stato '{quote.status}')",
        )
    # F1 — annullare la conferma (da 'confermato' O 'completo') riporta il
    # preventivo modificabile e azzera le evasioni materiale: il creatore va
    # SEMPRE avvisato (coerente con gli altri percorsi di retrocessione,
    # reopen/demote), altrimenti l'ufficio tecnico non sa che deve rimetterci
    # mano e che il materiale va riordinato. Prima il guard era `was_completo`,
    # che lasciava silenzioso l'annullamento dal solo 'confermato'.
    creator_id = quote.created_by_user_id or quote.submitted_by_user_id
    db.query(QuoteSupplierOrder).filter(QuoteSupplierOrder.quote_id == quote_id).delete()
    quote.material_ordered_at = None
    quote.material_ordered_by_user_id = None
    # F20: torna allo stato reale precedente alla conferma, non sempre 'letto'.
    # Se il preventivo era stato confermato senza essere mai aperto (read_at
    # NULL, conferma diretta da 'inviato') atterrare su 'letto' produceva un
    # 'letto' con read_at nullo. Ricostruzione coerente con restore_quote.
    quote.status = wf.STATUS_LETTO if quote.read_at else wf.STATUS_INVIATO
    quote.confirmed_at = None
    quote.confirmed_by_user_id = None
    quote.completed_at = None
    quote.completed_by_user_id = None
    # Annullando la chiusura si torna a monte del cliente: azzera il timestamp
    # "in attesa cliente" (altrimenti resta sporco e devia un successivo restore).
    # Il consuntivo (venduto/costo reale) NON viene azzerato: si compila solo per
    # ciò che è stato realmente prodotto/venduto, quindi un preventivo annullato
    # non ne ha; dove esiste è un dato vero da preservare (coerente con la demote
    # completo→confermato guidata dagli ordini, che pure lo preserva).
    quote.awaiting_client_at = None
    if creator_id and creator_id != current_user.id:
        actor = current_user.full_name or current_user.username
        create_notification(
            db,
            type='quote_reopened',
            title=f"Preventivo {quote.quote_number} riaperto",
            body=f"Conferma annullata da {actor} — torna modificabile",
            created_by_user_id=current_user.id,
            target_user_id=creator_id,
            data={'quote_id': quote.id, 'quote_number': quote.quote_number},
            commit=False,
        )
    db.commit()   # F7: annullo conferma + notifica in un solo commit atomico
    logger.info("Conferma annullata: quote_id=%s by=%s", quote_id, current_user.username)
    return _load_quote(quote_id, db)


@router.post("/{quote_id}/await-client", response_model=QuoteOut)
def await_client_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_confirm,
):
    """Amministrazione: inviato/letto → in_attesa_cliente (offerta dal cliente).

    Il preventivo resta modificabile (si può ritoccare l'offerta), ma il
    materiale non è ancora ordinabile: si attende la risposta del cliente.
    """
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    ensure_quote_visible(quote, current_user)  # ACL per-id (audit M1)
    if quote.status not in (wf.STATUS_INVIATO, wf.STATUS_LETTO):
        raise HTTPException(
            status_code=400,
            detail=f"'In attesa cliente' non possibile dallo stato '{quote.status}'",
        )
    quote.status = wf.STATUS_IN_ATTESA_CLIENTE
    quote.awaiting_client_at = utc_now()
    creator_id = quote.created_by_user_id or quote.submitted_by_user_id
    qnum = quote.quote_number
    # F3: avvisa il creatore che l'offerta è stata mandata al cliente — è un
    # esito di cui l'ufficio tecnico ha interesse a sapere. Guard
    # anti-auto-notifica (creatore == attore) come in unconfirm.
    # F7: commit=False → cambio stato + notifica in un solo commit atomico.
    if creator_id and creator_id != current_user.id:
        actor = current_user.full_name or current_user.username
        create_notification(
            db,
            type='quote_awaiting_client',
            title=f"Preventivo {qnum} in attesa cliente",
            body=f"Offerta mandata al cliente da {actor}",
            created_by_user_id=current_user.id,
            target_user_id=creator_id,
            data={'quote_id': quote_id, 'quote_number': qnum},
            commit=False,
        )
    db.commit()
    logger.info("In attesa cliente: quote_id=%s by=%s", quote_id, current_user.username)
    return _load_quote(quote_id, db)


@router.post("/{quote_id}/revert-await", response_model=QuoteOut)
def revert_await_client_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_confirm,
):
    """Amministrazione: annulla 'in attesa cliente' (misclick / il cliente non
    ha ancora risposto), tornando allo stato precedente SENZA passare da bozza.

    F19: prima l'unico modo per uscire da in_attesa_cliente senza confermare o
    segnare non-ordinato era 'reopen', che riporta a 'bozza' azzerando
    submitted_at/read_at e obbliga a re-inviare. Qui si torna a 'letto' (se già
    aperto) o 'inviato', azzerando solo awaiting_client_at.
    """
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    ensure_quote_visible(quote, current_user)  # ACL per-id (audit M1)
    if quote.status != wf.STATUS_IN_ATTESA_CLIENTE:
        raise HTTPException(
            status_code=400,
            detail=f"Nessuna 'attesa cliente' da annullare (stato '{quote.status}')",
        )
    quote.status = wf.STATUS_LETTO if quote.read_at else wf.STATUS_INVIATO
    quote.awaiting_client_at = None
    creator_id = quote.created_by_user_id or quote.submitted_by_user_id
    qnum = quote.quote_number
    # Speculare a await-client (che notifica "offerta mandata"): avvisa il
    # creatore che il preventivo è rientrato in lavorazione. Guard anti-auto.
    # F7: commit=False → cambio stato + notifica in un solo commit atomico.
    if creator_id and creator_id != current_user.id:
        actor = current_user.full_name or current_user.username
        create_notification(
            db,
            type='quote_await_reverted',
            title=f"Preventivo {qnum}: attesa cliente annullata",
            body=f"Rientrato in lavorazione da {actor}",
            created_by_user_id=current_user.id,
            target_user_id=creator_id,
            data={'quote_id': quote_id, 'quote_number': qnum},
            commit=False,
        )
    db.commit()
    logger.info("Attesa cliente annullata: quote_id=%s by=%s -> %s",
                quote_id, current_user.username, quote.status)
    return _load_quote(quote_id, db)


@router.post("/{quote_id}/mark-not-ordered", response_model=QuoteOut)
def mark_not_ordered_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_confirm,
):
    """Amministrazione: il cliente non ha ordinato → non_ordinato (perso).

    Da inviato/letto/in_attesa_cliente. Terminale ma reversibile (restore).
    """
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    ensure_quote_visible(quote, current_user)  # ACL per-id (audit M1)
    if quote.status not in (wf.STATUS_INVIATO, wf.STATUS_LETTO, wf.STATUS_IN_ATTESA_CLIENTE):
        raise HTTPException(
            status_code=400,
            detail=f"'Non ordinato' non possibile dallo stato '{quote.status}'",
        )
    quote.status = wf.STATUS_NON_ORDINATO
    quote.not_ordered_at = utc_now()
    quote.not_ordered_by_user_id = current_user.id
    creator_id = quote.created_by_user_id or quote.submitted_by_user_id
    qnum = quote.quote_number
    # F2: il preventivo è perso (cliente non ha ordinato). Avvisa il creatore:
    # è l'esito negativo, speculare a quote_confirmed che notifica quello
    # positivo. Senza, l'ufficio tecnico non sa mai che l'offerta è persa.
    # F7: commit=False → cambio stato + notifica in un solo commit atomico.
    if creator_id and creator_id != current_user.id:
        actor = current_user.full_name or current_user.username
        create_notification(
            db,
            type='quote_not_ordered',
            title=f"Preventivo {qnum} non ordinato",
            body=f"Segnato non ordinato da {actor} — il cliente non ha ordinato",
            created_by_user_id=current_user.id,
            target_user_id=creator_id,
            data={'quote_id': quote_id, 'quote_number': qnum},
            commit=False,
        )
    db.commit()
    logger.info("Non ordinato: quote_id=%s by=%s", quote_id, current_user.username)
    return _load_quote(quote_id, db)


@router.post("/{quote_id}/restore", response_model=QuoteOut)
def restore_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_confirm,
):
    """Amministrazione: annulla 'non ordinato' (il cliente ci ripensa).

    Torna allo stato precedente al 'perso', senza inventarne uno mai raggiunto:
    - se era già stato mandato al cliente (awaiting_client_at) → 'in_attesa_cliente';
    - altrimenti se era stato letto da amministrazione (read_at) → 'letto';
    - altrimenti (solo inviato, mai aperto) → 'inviato'.
    """
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    ensure_quote_visible(quote, current_user)  # ACL per-id (audit M1)
    if quote.status != wf.STATUS_NON_ORDINATO:
        raise HTTPException(
            status_code=400,
            detail=f"Nessun 'non ordinato' da annullare (stato '{quote.status}')",
        )
    if quote.awaiting_client_at:
        quote.status = wf.STATUS_IN_ATTESA_CLIENTE  # awaiting_client_at resta
    elif quote.read_at:
        quote.status = wf.STATUS_LETTO
    else:
        quote.status = wf.STATUS_INVIATO
    quote.not_ordered_at = None
    quote.not_ordered_by_user_id = None
    creator_id = quote.created_by_user_id or quote.submitted_by_user_id
    qnum = quote.quote_number
    # F3: il preventivo perso è stato rimesso in gioco. Avvisa il creatore
    # (speculare a mark-not-ordered), così sa che torna in lavorazione.
    # F7: commit=False → cambio stato + notifica in un solo commit atomico.
    if creator_id and creator_id != current_user.id:
        actor = current_user.full_name or current_user.username
        create_notification(
            db,
            type='quote_restored',
            title=f"Preventivo {qnum} ripristinato",
            body=f"Ripristinato da {actor} — di nuovo in lavorazione",
            created_by_user_id=current_user.id,
            target_user_id=creator_id,
            data={'quote_id': quote_id, 'quote_number': qnum},
            commit=False,
        )
    db.commit()
    logger.info("Ripristino non-ordinato→%s: quote_id=%s by=%s",
                quote.status, quote_id, current_user.username)
    return _load_quote(quote_id, db)


@router.patch("/{quote_id}/closeout", response_model=QuoteOut)
def update_quote_closeout(
    quote_id: int,
    data: QuoteCloseoutUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_archive,
):
    """Consuntivo commessa: prezzo venduto + costo reale.

    Compilabile solo su preventivi 'completo' e da chi accede all'archivio
    (ufficio tecnico E amministrazione) — separato da `quotes.create` perché
    è un dato di chiusura, non una modifica al preventivo. Usato dall'edit
    inline dei prezzi in Archivio.
    """
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    ensure_quote_visible(quote, current_user)
    if quote.status != wf.STATUS_COMPLETO:
        raise HTTPException(
            status_code=400,
            detail="Prezzi consuntivo compilabili solo su preventivi completi",
        )
    payload = data.model_dump(exclude_unset=True)
    for key, value in payload.items():
        setattr(quote, key, value)
    db.commit()
    return _load_quote(quote_id, db)


@router.put("/{quote_id}", response_model=QuoteOut)
def update_quote(
    quote_id: int,
    data: QuoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    # ACL di proprietà esplicita: il ramo closeout-only sotto salta
    # `ensure_editable` (che la include), quindi la garantiamo qui in cima.
    ensure_quote_visible(quote, current_user)
    payload = data.model_dump(exclude_unset=True)

    # Le transizioni di stato passano SOLO dagli endpoint dedicati
    # (confirm/reopen/await-client/...): un PUT generico non deve poter
    # scrivere `status`, altrimenti aggira permessi, guardie e campi audit
    # (e potrebbe persistere valori fuori dalla macchina a stati).
    payload.pop('status', None)

    # Sprint G — `sold_price` e `actual_cost` sono dati di chiusura commessa
    # (post-completamento): possono essere settati anche su preventivi non
    # editabili (status != bozza) purché lo stato sia `completato`. Devono
    # essere richiesti CON status=completato.
    closeout_fields = {'sold_price', 'actual_cost'}
    closeout_only = payload and set(payload.keys()).issubset(closeout_fields)
    has_closeout = any(k in payload for k in closeout_fields)
    if has_closeout and quote.status != wf.STATUS_COMPLETO:
        raise HTTPException(
            status_code=400,
            detail="sold_price / actual_cost compilabili solo su preventivi completi",
        )
    if not closeout_only:
        ensure_editable(quote, current_user)

    # quote_type ('single'/'commessa') immutabile post-create: cambiarlo dopo
    # la creazione sposterebbe la struttura delle parti già impostate (numero
    # componenti della commessa) in modo incoerente. Rifiuta esplicitamente.
    if 'quote_type' in payload and payload['quote_type'] != quote.quote_type:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo preventivo non modificabile (attuale: '{quote.quote_type}')",
        )
    for key, value in payload.items():
        setattr(quote, key, value)
    db.commit()

    # B1 — mantieni `final_total` allineato ai campi di prezzo appena scritti.
    # Il margine globale cambia i totali PARTE (fallback margine): serve un
    # recalc completo. Sconto/trasporto/imballaggio non toccano le parti →
    # basta ricalcolare il totale. Il ramo closeout-only non cambia prezzi: skip.
    if not closeout_only:
        pricing_fields = {'global_discount_percent', 'transport_cost',
                          'packaging_cost', 'global_margin_percent'}
        if payload.keys() & pricing_fields:
            if 'global_margin_percent' in payload:
                svc_recalculate_quote(quote_id, db)
            else:
                recompute_final_total(quote_id, db)
    return _load_quote(quote_id, db)


@router.post("/{quote_id}/recalculate", response_model=QuoteOut)
def recalculate_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _=_can_write,
):
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    ensure_editable(quote, current_user)
    for part in db.query(Part).filter(Part.quote_id == quote_id).all():
        recalculate_part(part.id, db)
    return _load_quote(quote_id, db)


@router.delete("/{quote_id}")
def delete_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    quote = db.query(Quote).filter(Quote.id == quote_id).first()
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    can_delete = 'quotes.delete' in getattr(current_user, '_permissions', [])
    is_creator = (
        quote.created_by_user_id is not None
        and quote.created_by_user_id == current_user.id
    )
    if not (can_delete or is_creator):
        raise HTTPException(
            status_code=403,
            detail="Solo il creatore del preventivo o chi ha il permesso di eliminazione possono eliminarlo",
        )
    # Cancella prima le notifiche legate al quote (FK target_quote_id non ha CASCADE su SQLite).
    # SQLite ricicla gli id, quindi notifiche orfane causerebbero IntegrityError sul UNIQUE INDEX
    # quando si crea un nuovo quote che riusa lo stesso id.
    # Cancella anche le NotificationRead associate (altrimenti restano "dismissed" per id riciclati).
    db.execute(text(
        "DELETE FROM notification_reads WHERE notification_id IN "
        "(SELECT id FROM notifications WHERE target_quote_id = :qid)"
    ), {"qid": quote_id})
    db.execute(text("DELETE FROM notifications WHERE target_quote_id = :qid"), {"qid": quote_id})
    # Idem per le evasioni materiale: QuoteSupplierOrder ha solo la FK quote_id,
    # nessuna relationship/cascade su Quote (e le FK SQLite sono OFF). Senza
    # questa DELETE le righe restano orfane e, col riciclo id di SQLite, un
    # nuovo preventivo eredita evasioni fantasma → stato materiale falso.
    # (material_order_quotes è invece gestito dal cascade m2m del backref.)
    db.execute(text("DELETE FROM quote_supplier_orders WHERE quote_id = :qid"), {"qid": quote_id})
    db.delete(quote)
    db.commit()
    logger.info("Quote eliminato: id=%s number=%r by=%s",
                quote_id, quote.quote_number, current_user.username)
    return {"ok": True}


