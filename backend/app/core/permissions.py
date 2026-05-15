PERMISSION_KEYS: dict[str, str] = {
    "dashboard":     "Visualizza Dashboard",
    "quotes.create": "Crea/modifica preventivi",
    "quotes.archive": "Archivio preventivi",
    "quotes.pdf":    "Scarica PDF",
    "quotes.send":   "Invia preventivo per revisione",
    "quotes.complete": "Marca preventivo come completato leggendolo",
    "quotes.view_all": "Vede tutti i preventivi (non solo i propri)",
    "customers":     "Gestione clienti",
    "settings":      "Impostazioni (materiali, macchine…)",
    "company":       "Modifica dati aziendali e default preventivi",
    "users":         "Gestione utenti",
    "backup":        "Backup e ripristino",
    "notifications": "Riceve notifiche",
    "orders.materials": "Ordini materiali (lista + PDF)",
    "tools": "Gestione utensili e ordini utensili",
    "officina":       "Officina — lettura documenti, tabelle reference, calcolatori",
    "officina.write": "Officina — upload/modifica documenti e contenuti",
}

DEFAULT_ROLE_PERMISSIONS: dict[str, list[str]] = {
    "admin": list(PERMISSION_KEYS.keys()),
    "ufficio_tecnico": [
        "dashboard", "quotes.create", "quotes.archive", "quotes.pdf",
        "quotes.send", "customers", "notifications", "orders.materials",
        "tools", "officina", "officina.write",
    ],
    "officina": [
        "quotes.archive", "quotes.pdf", "notifications", "tools", "officina",
    ],
    "amministrazione": [
        "dashboard", "quotes.archive", "quotes.pdf", "quotes.view_all",
        "quotes.complete", "notifications", "orders.materials", "tools",
        "officina", "officina.write",
    ],
}
