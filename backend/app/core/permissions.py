PERMISSION_KEYS: dict[str, str] = {
    "dashboard":     "Visualizza Dashboard",
    "quotes.create": "Crea/modifica preventivi",
    "quotes.archive": "Archivio preventivi",
    "quotes.send":   "Invia preventivo per revisione",
    "quotes.confirm": "Conferma preventivo (amministrazione)",
    "quotes.view_all": "Vede tutti i preventivi (non solo i propri)",
    "quotes.edit_locked": "Modifica preventivi bloccati (confermati/completi)",
    "quotes.delete": "Elimina preventivi (di chiunque)",
    "sales.direct":  "Vendite dirette (extra-preventivo)",
    "dies.create":     "Crea/modifica preventivi stampi",
    "dies.archive":    "Archivio preventivi stampi",
    "dies.settings":   "Configura tariffe, fasce e template stampi",
    "customers":     "Gestione clienti",
    "settings":      "Impostazioni (materiali, macchine…)",
    "company":       "Modifica dati aziendali e default preventivi",
    "users":         "Gestione utenti",
    "backup":        "Backup e ripristino",
    "notifications": "Riceve notifiche",
    "orders.materials": "Ordini materiali (lista + PDF)",
    "orders.normalized": "Ordini normalizzati (lista + CSV + storico)",
    "orders.tools": "Ordini utensili (crea + CSV + elimina)",
    "tools": "Anagrafica/catalogo utensili",
    "officina":       "Officina — lettura documenti, tabelle reference, calcolatori",
    "officina.write": "Officina — upload/modifica documenti e contenuti",
}

# Raggruppamento per dominio delle chiavi, usato SOLO per presentare la pagina
# Ruoli e Permessi in sezioni leggibili (matrice ruoli×permessi). L'ordine e i
# gruppi non incidono sulla logica di gating. Ogni chiave nuova andrebbe aggiunta
# qui al gruppo giusto; se dimenticata, l'endpoint /permissions/grouped la mette
# comunque in un gruppo "Altro" così non sparisce dalla UI.
PERMISSION_GROUPS: list[tuple[str, list[str]]] = [
    ("Dashboard", ["dashboard"]),
    ("Preventivi", [
        "quotes.create", "quotes.send", "quotes.confirm", "quotes.view_all",
        "quotes.archive", "quotes.edit_locked", "quotes.delete",
    ]),
    ("Vendite", ["sales.direct"]),
    ("Preventivatore Stampi", ["dies.create", "dies.archive", "dies.settings"]),
    ("Ordini", ["orders.materials", "orders.normalized", "orders.tools"]),
    ("Officina & Utensili", ["officina", "officina.write", "tools"]),
    ("Impostazioni & Sistema", ["settings", "customers", "company", "users", "backup", "notifications"]),
]

DEFAULT_ROLE_PERMISSIONS: dict[str, list[str]] = {
    "admin": list(PERMISSION_KEYS.keys()),
    "ufficio_tecnico": [
        "dashboard", "quotes.create", "quotes.archive",
        "quotes.send", "customers", "notifications", "orders.materials",
        "orders.normalized", "tools", "orders.tools", "officina", "officina.write",
        "dies.create", "dies.archive",
    ],
    # Officina: solo la sua area + catalogo utensili. Nessun preventivo,
    # nessun ordine (materiali/utensili), niente dashboard né notifiche.
    "officina": [
        "officina", "officina.write", "tools",
    ],
    "amministrazione": [
        "dashboard", "quotes.archive", "quotes.view_all",
        "quotes.confirm", "sales.direct", "notifications", "orders.materials",
        "orders.normalized", "tools", "orders.tools", "officina", "officina.write",
        "dies.archive",
    ],
}
