---
name: audit-modulo
description: Esegue l'audit funzionale di UN modulo dal registro docs/audit/AUDIT_FUNZIONALE.md. Usala quando l'utente chiede di fare l'audit di una funzionalità (es. "audit delle notifiche", "controlla il modulo ordini materiali") o di procedere col prossimo modulo del registro.
---

# Audit di un modulo (registro funzionale)

Esegui l'audit di **un solo modulo** del registro `docs/audit/AUDIT_FUNZIONALE.md`,
compilando la sua checklist. Un lavoro alla volta (CLAUDE.md §0-ter).

## Input
Il nome o numero del modulo (es. "notifiche", "§27", "cost engine"). Se manca,
mostra la tabella di copertura del registro e chiedi quale.

## Procedura

1. **Apri la scheda** del modulo in `docs/audit/AUDIT_FUNZIONALE.md`. Leggi
   *Dove vive*, *Sotto-funzioni*, *Punti d'ingresso* e i ganci già annotati
   nella *Checklist audit*.
2. **Leggi i file reali** elencati in *Dove vive* (backend + frontend + lib).
   Non fidarti della descrizione: verifica sul codice.
3. **Valuta le 5 dimensioni** con controlli concreti, non generici:
   - **Correttezza** — happy path + casi limite; coerenza valori DB↔UI↔PDF.
   - **Vicoli ciechi** — bottoni morti, stati senza uscita, errori senza recovery.
   - **Bug noti/sospetti** — validazioni mancanti, race, N+1, permessi non gated.
   - **Riuso & DRY** — logica duplicata? riusabile altrove invece di creare nuovo?
     usata ovunque dovrebbe, o reimplementata a mano da qualche parte?
   - **Migliorie** — proposte concrete (le annoti, non le esegui).
   Per i gemelli DRY del cost engine confronta backend↔frontend (CLAUDE.md §0-quater).
4. **Scrivi i risultati** nel campo *Note audit* della scheda: cosa hai
   verificato, cosa è ok, cosa no. Spunta i `[ ]` della checklist.
5. **Aggiorna lo stato** del modulo (⬜→✅ con data) sia nella scheda sia nella
   *tabella di copertura* in cima al registro.
6. **Problemi reali → proposta**: i difetti concreti diventano voci proposte per
   `MECHQUOTE_LISTA_LAVORI.md`. NON risolverli qui (§0-ter regola 2): elencali in
   fondo alla risposta e attendi decisione dell'utente. Il registro non è il
   tracker dei lavori.

## Regole
- **Solo audit, niente fix.** Se trovi un bug, lo documenti e lo proponi; non lo
  correggi nella stessa sessione salvo richiesta esplicita.
- **Zona fragile** (cost engine, `_run_migrations`, workflow stati): se l'audit
  tocca §0-quater, esponi prima cosa guardi.
- Metodologia di riferimento: `docs/audit/METODO_AUDIT.md`.
