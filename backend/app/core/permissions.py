PERMISSION_KEYS: dict[str, str] = {
    "dashboard":     "Visualizza Dashboard",
    "quotes.create": "Crea/modifica preventivi",
    "quotes.archive": "Archivio preventivi",
    "quotes.pdf":    "Scarica PDF",
    "quotes.send":   "Invia preventivo per revisione",
    "quotes.complete": "Marca preventivo come completato leggendolo",
    "customers":     "Gestione clienti",
    "settings":      "Impostazioni (materiali, macchine…)",
    "company":       "Modifica dati aziendali e default preventivi",
    "users":         "Gestione utenti",
    "backup":        "Backup e ripristino",
    "notifications": "Riceve notifiche",
}

DEFAULT_ROLE_PERMISSIONS: dict[str, list[str]] = {
    "admin": list(PERMISSION_KEYS.keys()),
    "ufficio_tecnico": [
        "dashboard", "quotes.create", "quotes.archive", "quotes.pdf",
        "quotes.send", "customers", "notifications",
    ],
    "officina": [
        "quotes.archive", "quotes.pdf", "notifications",
    ],
    "amministrazione": [
        "dashboard", "quotes.archive", "quotes.pdf",
        "quotes.complete", "notifications",
    ],
}
