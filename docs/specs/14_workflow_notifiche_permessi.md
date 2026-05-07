# Spec 14 — Workflow preventivo, Notifiche, Permessi dinamici, Dashboard attività

> Documento di riferimento permanente. Aggiornare quando si aggiungono nuove feature.
> Ordine implementazione: Permessi → Workflow stati → Notifiche → Dashboard attività.

---

## 1. Permessi dinamici

### Principio
- I **ruoli** sono configurabili da UI (nome-slug, etichetta, colore).
- I **permessi** sono chiavi fisse nel codice — una per feature/sezione.
- L'assegnazione permessi→ruoli è configurabile da UI, senza deploy.
- Aggiungere una nuova sezione = aggiungere una chiave in `PERMISSION_KEYS` (codice) → appare automaticamente nella griglia UI.

### Tabelle DB
```
roles
  id, name (slug unico es. "admin"), label ("Amministratore"), color ("green"), created_at

role_permissions
  id, role_id → roles.id, permission_key
```

### Chiavi permesso — `PERMISSION_KEYS` (definite in `backend/app/core/permissions.py`)
```python
PERMISSION_KEYS = {
    "dashboard":         "Visualizza Dashboard",
    "quotes.create":     "Crea/modifica preventivi",
    "quotes.archive":    "Archivio preventivi",
    "quotes.pdf":        "Scarica PDF",
    "quotes.send":       "Invia preventivo per revisione",
    "quotes.send_client":"Invia preventivo al cliente",
    "quotes.close":      "Chiude preventivo (vinto/perso)",
    "customers":         "Gestione clienti",
    "settings":          "Impostazioni (materiali, macchine…)",
    "users":             "Gestione utenti",
    "backup":            "Backup e ripristino",
    "notifications":     "Riceve notifiche",
    # Aggiunte future:
    # "quotes.dxf":       "Preventivo da file DXF",
    # "quotes.step":      "Preventivo da file STEP",
    # "tools":            "Magazzino utensili",
}
```

### Permessi default per ruolo (seed)
| Chiave | admin | ufficio_tecnico | officina | amministrazione |
|--------|-------|-----------------|----------|-----------------|
| dashboard | ✓ | ✓ | | ✓ |
| quotes.create | ✓ | ✓ | | |
| quotes.archive | ✓ | ✓ | ✓ | ✓ |
| quotes.pdf | ✓ | ✓ | ✓ | ✓ |
| quotes.send | ✓ | ✓ | | |
| quotes.send_client | ✓ | ✓ | | |
| quotes.close | ✓ | ✓ | | |
| customers | ✓ | ✓ | | |
| settings | ✓ | | | |
| users | ✓ | | | |
| backup | ✓ | | | |
| notifications | ✓ | ✓ | ✓ | ✓ |

### Flusso auth
1. Login → JWT con `sub: username`
2. `/auth/me` → query su users + roles + role_permissions → restituisce `permissions: string[]`
3. Frontend salva `permissions[]` in `AuthContext`
4. `hasPermission('quotes.create')` → `permissions.includes('quotes.create')`
5. Backend: `require_permission('settings')` → dependency che verifica la chiave

### Anti-lockout
Se il ruolo dell'utente non esiste in `roles` e l'utente è `admin` → gli vengono assegnati tutti i permessi.

### UI — Impostazioni → Ruoli e Permessi
- Lista ruoli: badge colorato, etichetta, pulsante +Nuovo Ruolo / cestino
- Griglia: righe = permessi (con descrizione), colonne = ruoli, celle = checkbox
- Click checkbox → PATCH immediato (salvataggio singolo, nessun pulsante Salva)
- Nuovo ruolo: dialog con nome-slug (senza spazi), etichetta, colore

---

## 2. Workflow stati preventivo

### Stati
| Stato | Descrizione | Chi può impostarlo |
|-------|-------------|-------------------|
| `bozza` | In lavorazione | creato automaticamente |
| `inviato` | Inviato per revisione interna | chi ha `quotes.send` |
| `letto` | Letto dal revisore | automatico all'apertura |
| `inviato_cliente` | Inviato al cliente via email | chi ha `quotes.send_client` |
| `vinto` | Ordine confermato | chi ha `quotes.close` |
| `perso` | Non aggiudicato | chi ha `quotes.close` |

### Regola "letto"
- Si imposta automaticamente quando un utente **con `quotes.close` o `quotes.send_client`** apre un preventivo in stato `inviato`.
- Se lo riapre chi l'ha creato (stesso `user_id`) → non cambia stato.
- Una volta `letto` non torna a `inviato`.

### Transizioni valide
```
bozza → inviato           [quotes.send]
inviato → letto           [automatico — chi ha quotes.close apre il preventivo]
letto → inviato_cliente   [quotes.send_client]
letto → bozza             [quotes.send — per chiedere correzioni, opzionale]
inviato_cliente → vinto   [quotes.close]
inviato_cliente → perso   [quotes.close]
```

### Colori badge
```
bozza           → slate  (grigio)
inviato         → amber  (arancione)
letto           → blue   (blu)
inviato_cliente → indigo
vinto           → green  (verde)
perso           → red    (rosso)
```

### Migrazione dati esistenti
```sql
UPDATE quotes SET status = 'bozza'           WHERE status = 'draft';
UPDATE quotes SET status = 'inviato_cliente' WHERE status = 'sent';
UPDATE quotes SET status = 'vinto'           WHERE status = 'won';
UPDATE quotes SET status = 'perso'           WHERE status = 'lost';
```

### Colonne aggiuntive su `quotes`
```
submitted_by_user_id  INTEGER  → chi ha premuto "Invia"
reviewed_by_user_id   INTEGER  → chi ha segnato "letto"
```

### UI
- QuoteEditor header: badge stato colorato sempre visibile
- Pulsante **"Invia per revisione"**: visibile solo se stato=`bozza` e `hasPermission('quotes.send')`
- Pulsante **"Invia al cliente"**: visibile solo se stato=`letto` e `hasPermission('quotes.send_client')`
- Dropdown stato (solo per chi ha `quotes.close`): per segnare vinto/perso
- Archivio: filtro per stato, badge colorato in ogni riga

---

## 3. Notifiche in-app

### Tabelle DB
```
notifications
  id
  type              → es. "quote_submitted", "quote_won"
  title             → "Nuovo preventivo 240-26A_001"
  body              → "Inviato da Marco Rossi"
  data_json         → {"quote_id": 42, "quote_number": "240-26A_001"}
  created_by_user_id → FK users.id
  target_roles      → JSON: ["admin","amministrazione"]
  requires_action   → BOOLEAN (richiede conferma Fatto ✓)
  created_at

notification_reads
  id
  notification_id → FK notifications.id
  user_id         → FK users.id
  read_at         → quando aperta
  confirmed_at    → quando premuto "Fatto ✓" (NULL se not requires_action)
```

### Trigger automatici
| Evento | Tipo | Target roles | Requires action |
|--------|------|-------------|----------------|
| quote → inviato | `quote_submitted` | admin, amministrazione | No |
| quote → inviato_cliente | `quote_sent_client` | admin | No |
| quote → vinto | `quote_won` | admin, ufficio_tecnico | **Sì** (ordine materiale) |
| quote → perso | `quote_lost` | admin | No |
| (futuro) giacenza sotto soglia | `stock_low` | admin, officina | **Sì** |

### API
```
GET  /api/notifications                → lista notifiche utente (paginata, ordine desc)
GET  /api/notifications/unread-count   → { count: int }
POST /api/notifications/{id}/read      → imposta read_at
POST /api/notifications/{id}/confirm   → imposta confirmed_at
```

### Frontend — campanella sidebar
- `useNotifications()` hook: polling ogni 60s su `/unread-count`, attivo solo se `hasPermission('notifications')`
- Badge rosso con numero se count > 0
- Click → `NotificationPanel` (slide-in da destra, z-50, overlay scuro)

### Notifica nell'UI
```
● Nuovo preventivo 240-26A_001          ← punto blu = non letta
  Inviato da Marco · 10 min fa
  [→ Apri preventivo]

● Ordine confermato: 240-26B_002        ← con pulsante azione
  Avviare acquisto materiale
  Marco · ieri                          [Fatto ✓]

○ Preventivo 240-26A_001 inviato        ← cerchio grigio = già letta
  Marco · 3 giorni fa
```

- Click sulla notifica → segna letta + naviga al preventivo (se data_json.quote_id presente)
- "Fatto ✓" → segna confirmed_at (rimane visibile ma non più in "da fare")
- Tab "Da fare" / "Tutte" nel pannello

---

## 4. Dashboard attività recente

### Principio
Nessuna tabella aggiuntiva. Le attività sono le notifiche filtrate per il ruolo dell'utente.

### API
```
GET /api/dashboard/activity → ultime 5 notifiche per ruolo utente (+ stato lettura)
```

### UI — card nella Dashboard
```
┌──────────────────────────────────────┐
│ Attività recente              Tutte → │
├──────────────────────────────────────┤
│ 🔵 Prev. 240-26A_001            10m  │
│    Inviato da Marco                  │
│ ─────────────────────────────────── │
│ ✓  Ordine confermato 240-25A_001  1h │
│    Avviare acquisto materiale        │
│ ─────────────────────────────────── │
│ ○  Prev. 240-26B_002 inviato     2h  │
└──────────────────────────────────────┘
```
- `🔵` = non letta, `✓` = confermata, `○` = letta
- Click su riga → naviga al preventivo

---

## File da creare/modificare

### Backend nuovi
- `backend/app/core/permissions.py` — `PERMISSION_KEYS` dict
- `backend/app/api/roles.py` — CRUD ruoli + toggle permessi
- `backend/app/api/notifications.py` — endpoints notifiche
- `backend/app/services/notifications.py` — helper `create_notification()`

### Backend modificati
- `backend/app/models.py` — Role, RolePermission, Notification, NotificationRead
- `backend/app/main.py` — migrazioni, seed, router
- `backend/app/schemas.py` — schemi ruoli, notifiche
- `backend/app/core/security.py` — `require_permission()`, carica permissions da DB
- `backend/app/api/auth.py` — `permissions[]` in `/auth/me`
- `backend/app/api/quotes.py` — trigger notifiche, auto-set letto, PATCH status
- `backend/app/api/dashboard.py` — endpoint `/dashboard/activity`

### Frontend nuovi
- `frontend/src/pages/settings/RolesPage.tsx` — griglia permessi
- `frontend/src/components/layout/NotificationPanel.tsx` — pannello notifiche
- `frontend/src/lib/useNotifications.ts` — hook polling

### Frontend modificati
- `frontend/src/lib/auth.tsx` — `permissions[]`, `hasPermission()`
- `frontend/src/App.tsx` — `ProtectedRoute` con `permission=`
- `frontend/src/components/layout/Sidebar.tsx` — `hasPermission`, campanella
- `frontend/src/pages/DashboardPage.tsx` — card attività
- `frontend/src/pages/QuoteEditor.tsx` — badge stato, pulsanti workflow
- `frontend/src/pages/QuoteArchivePage.tsx` — badge stato, filtro stato
