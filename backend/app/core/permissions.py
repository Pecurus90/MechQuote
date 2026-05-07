PERMISSION_KEYS: dict[str, str] = {
    "dashboard":          "Visualizza Dashboard",
    "quotes.create":      "Crea/modifica preventivi",
    "quotes.archive":     "Archivio preventivi",
    "quotes.pdf":         "Scarica PDF",
    "quotes.send":        "Invia preventivo per revisione",
    "quotes.send_client": "Invia preventivo al cliente",
    "quotes.close":       "Chiude preventivo (vinto/perso)",
    "customers":          "Gestione clienti",
    "settings":           "Impostazioni (materiali, macchine…)",
    "users":              "Gestione utenti",
    "backup":             "Backup e ripristino",
    "notifications":      "Riceve notifiche",
}

DEFAULT_ROLE_PERMISSIONS: dict[str, list[str]] = {
    "admin": list(PERMISSION_KEYS.keys()),
    "ufficio_tecnico": [
        "dashboard", "quotes.create", "quotes.archive", "quotes.pdf",
        "quotes.send", "quotes.send_client", "quotes.close",
        "customers", "notifications",
    ],
    "officina": [
        "quotes.archive", "quotes.pdf", "notifications",
    ],
    "amministrazione": [
        "dashboard", "quotes.archive", "quotes.pdf", "notifications",
    ],
}
