PERMISSION_KEYS: dict[str, str] = {
    "dashboard":     "Visualizza Dashboard",
    "quotes.create": "Crea/modifica preventivi",
    "quotes.archive": "Archivio preventivi",
    "quotes.pdf":    "Scarica PDF",
    "quotes.send":   "Invia preventivo per revisione",
    "quotes.confirm": "Conferma preventivo (amministrazione)",
    "quotes.view_all": "Vede tutti i preventivi (non solo i propri)",
    "quotes.edit_locked": "Modifica preventivi bloccati (confermati/completi)",
    "quotes.delete": "Elimina preventivi (di chiunque)",
    "dies.create":     "Crea/modifica preventivi stampi",
    "dies.archive":    "Archivio preventivi stampi",
    "dies.pdf":        "Scarica PDF preventivo stampo",
    "dies.settings":   "Configura tariffe, fasce e template stampi",
    "customers":     "Gestione clienti",
    "settings":      "Impostazioni (materiali, macchine…)",
    "company":       "Modifica dati aziendali e default preventivi",
    "users":         "Gestione utenti",
    "backup":        "Backup e ripristino",
    "notifications": "Riceve notifiche",
    "orders.materials": "Ordini materiali (lista + PDF)",
    "orders.tools": "Ordini utensili (crea + CSV + elimina)",
    "tools": "Anagrafica/catalogo utensili",
    "officina":       "Officina — lettura documenti, tabelle reference, calcolatori",
    "officina.write": "Officina — upload/modifica documenti e contenuti",
}

DEFAULT_ROLE_PERMISSIONS: dict[str, list[str]] = {
    "admin": list(PERMISSION_KEYS.keys()),
    "ufficio_tecnico": [
        "dashboard", "quotes.create", "quotes.archive", "quotes.pdf",
        "quotes.send", "customers", "notifications", "orders.materials",
        "tools", "orders.tools", "officina", "officina.write",
        "dies.create", "dies.archive", "dies.pdf",
    ],
    # Officina: solo la sua area + catalogo utensili. Nessun preventivo,
    # nessun ordine (materiali/utensili), niente dashboard né notifiche.
    "officina": [
        "officina", "officina.write", "tools",
    ],
    "amministrazione": [
        "dashboard", "quotes.archive", "quotes.pdf", "quotes.view_all",
        "quotes.confirm", "notifications", "orders.materials",
        "tools", "orders.tools", "officina", "officina.write",
        "dies.archive", "dies.pdf",
    ],
}
