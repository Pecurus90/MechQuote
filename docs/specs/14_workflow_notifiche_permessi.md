# Spec 14 — Workflow stati, Notifiche, Permessi dinamici, Dashboard attività

> Documento di riferimento allineato con il codice corrente. Aggiornare se cambia comportamento.

---

## 1. Permessi dinamici

### Principio
- I **ruoli** sono configurabili da UI (slug, etichetta, colore)
- I **permessi** sono chiavi fisse nel codice — una per feature/sezione
- L'assegnazione permessi → ruoli è in DB, modificabile da UI senza deploy
- Aggiungere una sezione = aggiungere una chiave a `PERMISSION_KEYS` (`backend/app/core/permissions.py`)

### Tabelle DB
```
roles
  id, name (slug unico), label, color, created_at

role_permissions
  id, role_id → roles.id, permission_key
```

### Chiavi permesso correnti

| Chiave | Significato |
|--------|-------------|
| `dashboard` | Visualizza Dashboard |
| `quotes.create` | Crea/modifica preventivi |
| `quotes.archive` | Archivio preventivi |
| `quotes.pdf` | Scarica PDF |
| `quotes.send` | Invia preventivo per revisione |
| `quotes.complete` | Marca preventivo come completato leggendolo |
| `customers` | Gestione clienti |
| `settings` | Impostazioni catalogo (materiali, macchine, trattamenti, template, categorie) |
| `company` | Modifica dati aziendali e default preventivi |
| `users` | Gestione utenti |
| `backup` | Backup e ripristino |
| `notifications` | Riceve notifiche |

### Default per ruolo seedato

| Permesso | admin | ufficio_tecnico | officina | amministrazione |
|----------|-------|-----------------|----------|-----------------|
| dashboard | ✓ | ✓ | | ✓ |
| quotes.create | ✓ | ✓ | | |
| quotes.archive | ✓ | ✓ | ✓ | ✓ |
| quotes.pdf | ✓ | ✓ | ✓ | ✓ |
| quotes.send | ✓ | ✓ | | |
| quotes.complete | ✓ | | | ✓ |
| customers | ✓ | ✓ | | |
| settings | ✓ | | | |
| company | ✓ | | | |
| users | ✓ | | | |
| backup | ✓ | | | |
| notifications | ✓ | ✓ | ✓ | ✓ |

### Flusso auth
1. Login → JWT con `sub: username`
2. `/auth/me` query users + roles + role_permissions → restituisce `permissions: string[]`
3. Frontend salva permissions in `AuthContext`
4. `hasPermission('quotes.create')` → check inclusione
5. Backend: `require_permission('settings')` dependency

### Anti-lockout
Se l'utente è `role='admin'` ma `roles` non contiene 'admin' (DB pulito da migrazione bug), `get_current_user` gli restituisce comunque tutti i `PERMISSION_KEYS`.

### UI
`Impostazioni → Sistema → Ruoli e Permessi`:
- Tabella ruoli (badge colore, etichetta, +Nuovo, cestino)
- Griglia: righe = permessi (label + chiave), colonne = ruoli, celle = checkbox
- Click checkbox → PATCH immediato, no pulsante Salva

---

## 2. Workflow stati preventivo (interno, 3 stati)

### Concetto
Il "vero gestionale" gestisce il ciclo cliente (vinto/perso/inviato_cliente). MechQuote traccia solo il flusso **interno**:

1. Ufficio tecnico crea il preventivo → `bozza`
2. Quando lo ultima → preme "Invia per revisione" → `inviato`
3. Amministrazione lo apre → automaticamente diventa `completato`

### Stati

| Stato | Descrizione | Chi imposta |
|-------|-------------|-------------|
| `bozza` | In lavorazione | Automatico al create |
| `inviato` | Inviato per revisione interna | `quotes.send` (PATCH /status) |
| `completato` | Letto da chi può completare | Automatico al GET /quotes/{id} se l'utente ha `quotes.complete` |

### Transizioni

```
bozza ──[PATCH /status, quotes.send]──> inviato
inviato ──[GET /quotes/{id} con quotes.complete]──> completato
```

`completato` è terminale (niente ritorno via UI). Se serve correggere, l'admin può modificare in qualsiasi stato.

### Auto-mark `completato`
- Si applica solo se l'utente ha `quotes.complete` E lo stato è `inviato`
- Non si applica al creatore (che, per design, non ha `quotes.complete` se è `ufficio_tecnico`)
- Idempotente (seconda apertura non rigenera notifica)

### Lock post-invio
- `bozza`: editabile da chi ha `quotes.create`
- `inviato`/`completato`: bloccato per tutti, con eccezione admin (`ensure_editable()` in `quotes.py`)
- UI: campi disabled tramite `<fieldset disabled>`, pulsanti Salva/+Parte/Elimina-parte nascosti
- Banner ambra in alto: *"🔒 Preventivo non più modificabile · È in attesa di lettura. Solo un admin può apportare modifiche."*

### Eliminazione
- Solo creatore (`Quote.created_by_user_id == current_user.id`) o admin
- Possibile in qualsiasi stato (anche dopo invio, "magari ha sbagliato")

### Colonne extra su `quotes`
- `created_by_user_id` — chi ha creato (popolato al POST)
- `submitted_by_user_id` / `submitted_at` — chi ha premuto Invia e quando
- `completed_by_user_id` / `completed_at` — chi ha aperto e quando

### Colori badge
```
bozza      → slate (grigio)
inviato    → amber (arancione)
completato → green (verde)
```

### UI
- QuoteEditor header: badge colorato + "Inviato da X · 2h fa" / "Completato da Y · 1g fa"
- Pulsante "Invia per revisione" visibile se `status='bozza'` && `hasPermission('quotes.send')`
- Archivio: filtro stato (bozza / inviato / completato / tutti) + ricerca codice/cliente

---

## 3. Notifiche in-app

### Tabelle

```
notifications
  id, type, title, body, data_json (JSON arbitrario)
  created_by_user_id (FK users)
  target_roles (JSON array di slug ruolo)
  target_user_id (FK users, per notifiche 1-a-1)
  requires_action (boolean)
  created_at

notification_reads
  id, notification_id, user_id, read_at, confirmed_at, dismissed_at
```

### Helper generico

`backend/app/services/notifications.py`:
```python
create_notification(db, *, type, title, body, target_roles=[], target_user_id=None,
                    requires_action=False, data=None, created_by_user_id=None)
```

Usabile da qualsiasi feature futura (es. utensili sotto soglia, scadenze, ecc.) passando un nuovo `type`.

### Trigger correnti

| Evento | type | Destinatario | requires_action |
|--------|------|--------------|-----------------|
| `bozza → inviato` | `quote_submitted` | `target_roles=['admin','amministrazione']` | No |
| `inviato → completato` | `quote_completed` | `target_user_id = quote.submitted_by_user_id` | No |

### API

```
GET  /api/notifications              lista per utente corrente (escluse dismissed)
GET  /api/notifications/unread-count count per badge sidebar
POST /api/notifications/{id}/read    set read_at
POST /api/notifications/{id}/confirm set confirmed_at (solo se requires_action)
POST /api/notifications/clear-read   imposta dismissed_at su tutte le lette dell'utente
```

Tutte protette da `require_permission('notifications')`.

### Filtraggio destinatari
Per ogni notifica, l'utente la vede se:
- `target_user_id == current_user.id`, **oppure**
- `current_user.role` è in `target_roles`

E **non** ha `dismissed_at` set per quell'utente.

### Frontend

- Hook `useNotifications()` (`@/lib/useNotifications`): polling `/unread-count` ogni 60s, attivo solo se `hasPermission('notifications')`
- Campanella in sidebar (footer) con badge rosso del count
- `NotificationPanel` (`@/components/layout/NotificationPanel`) slide-in da destra via React Portal (sopra qualsiasi modal)
- Click su notifica con `data.quote_id` → naviga a `/quotes/{id}`
- Pulsante "Svuota lette" header del pannello (per-utente, non globale)

---

## 4. Dashboard attività recente

### Principio
Niente tabella separata. Le "attività" sono le notifiche personali dell'utente filtrate.

### API

```
GET /api/dashboard/activity → ultime 5 notifiche per utente
```

Riusa `_user_notifications()` (helper di `notifications.py`) con `limit=5`.

### UI
Card "Attività recente" in DashboardPage, sempre presente:
- Ogni riga: icona stato (🔵 non letta / ✓ confermata / ○ letta), titolo, body, tempo relativo
- Click su riga → naviga al preventivo se `data.quote_id`

### Posizione nella dashboard
Layout 2/3 + 1/3: a sinistra "Le mie bozze", "I miei inviati", "Da leggere"; a destra "Attività recente" sticky.

---

## 5. Estendibilità futura

Per qualsiasi feature nuova che debba notificare:

```python
from app.services.notifications import create_notification

create_notification(
    db,
    type='tool_low_stock',
    title='Utensile X sotto scorta',
    body='Solo 2 pezzi rimasti',
    target_roles=['officina', 'admin'],
    requires_action=True,
    data={'tool_id': 42},
)
```

Niente modifiche a `useNotifications`, `NotificationPanel`, dashboard. Il sistema rende qualsiasi notifica ricevuta. Il `type` è solo metadato (utilizzabile per icone/styling future se necessario).
