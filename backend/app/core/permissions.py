PERMISSION_KEYS: dict[str, str] = {
    "dashboard":     "Visualizza Dashboard",
    "statistics":    "Statistiche (costi e margini aggregati di tutta l'azienda)",
    "quotes.create": "Crea/modifica preventivi",
    "quotes.archive": "Archivio preventivi",
    "quotes.send":   "Invia preventivo per revisione",
    "quotes.confirm": "Conferma preventivo (amministrazione)",
    "quotes.view_all": "Vede tutti i preventivi (non solo i propri)",
    "quotes.edit_locked": "Modifica preventivi bloccati (confermati/completi)",
    "quotes.delete": "Elimina preventivi (di chiunque)",
    "sales.direct":  "Vendite dirette (extra-preventivo)",
    "customers":     "Gestione clienti",
    "settings":      "Impostazioni (materiali, macchine…)",
    "company":       "Modifica dati aziendali e default preventivi",
    "users":         "Gestione utenti",
    "backup":        "Backup e ripristino",
    "notifications": "Riceve notifiche",
    "orders.materials": "Ordini materiali (lista + CSV)",
    "orders.materials.request": "Richieste materiale (segnala fabbisogno all'ufficio acquisti, senza emettere ordini)",
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
    ("Statistiche", ["statistics"]),
    ("Preventivi", [
        "quotes.create", "quotes.send", "quotes.confirm", "quotes.view_all",
        "quotes.archive", "quotes.edit_locked", "quotes.delete",
    ]),
    ("Vendite", ["sales.direct"]),
    ("Ordini", ["orders.materials", "orders.materials.request", "orders.normalized", "orders.tools"]),
    ("Officina & Utensili", ["officina", "officina.write", "tools"]),
    ("Impostazioni & Sistema", ["settings", "customers", "company", "users", "backup", "notifications"]),
]

DEFAULT_ROLE_PERMISSIONS: dict[str, list[str]] = {
    "admin": list(PERMISSION_KEYS.keys()),
    "ufficio_tecnico": [
        "dashboard", "quotes.create", "quotes.archive",
        "quotes.send", "sales.direct", "customers", "notifications", "orders.materials",
        "orders.normalized", "tools", "orders.tools", "officina", "officina.write",
    ],
    # Officina: la sua area + catalogo utensili + può SEGNALARE fabbisogni di
    # materiale (richieste che finiscono nella coda di acquisti/amministrazione),
    # ma NON emette ordini né vede il pool. Nessun preventivo, niente dashboard.
    "officina": [
        "officina", "officina.write", "tools", "orders.materials.request",
    ],
    "amministrazione": [
        "dashboard", "statistics", "quotes.archive", "quotes.view_all",
        "quotes.confirm", "sales.direct", "notifications", "orders.materials",
        "orders.normalized", "tools", "orders.tools", "officina", "officina.write",
    ],
}
