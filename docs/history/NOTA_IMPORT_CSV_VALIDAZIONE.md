# Nota — Import CSV: validazione e blindatura (per TUTTI i moduli)

> Scritta dopo l'incidente di **produzione del 2026-06-05**: un import CSV
> materiali ha messo offline l'intera app. Questa nota spiega **perché è
> successo**, **come si ripara se ricapita** (runbook d'emergenza) e **come
> si elimina la possibilità stessa del guasto** per ogni modulo CSV.

---

## 1. Cosa è successo (l'incidente)

- Import di un CSV materiali → 24 righe scritte con la colonna `Famiglia`
  valorizzata con le **etichette** (`Acciao al carbonio` [refuso],
  `Alluminio`, `Bronzo`, `Rame`) invece degli **slug** interni
  (`acciaio_carbonio`, `alluminio`, …).
- Da quel momento **ogni** `GET /api/materials` rispondeva **500**
  (`ResponseValidationError: Famiglia '...' non valida`).
- Effetto domino: catalogo materiali, editor preventivo e ogni pagina che
  carica i materiali → schermata rotta. L'app sembrava "morta", ma Apache,
  backend e DB erano **sani**. Il guasto era **solo nei dati**.

## 2. Perché è successo — la causa di fondo (vale per ogni modulo)

C'è un'**asimmetria di validazione fra scrittura e lettura**:

- **In lettura** gli endpoint usano `response_model=...Out`, e gli schemi
  `Out` hanno validatori veri (es. `MaterialOut`/`MaterialBase._validate_family`
  in `backend/app/schemas.py` accetta `family` solo se è uno slug di
  `app/core/material_families.py:MATERIAL_FAMILY_SLUGS`).
- **In scrittura via CSV** il motore `import_catalog_csv`
  (`backend/app/core/csv_import.py`) costruisce **direttamente il modello
  SQLAlchemy**: riga 303, `db.add(config.model(**fields))`. **Non passa mai
  dallo schema Pydantic `...Create`**, quindi **nessun validatore di campo
  viene applicato**. Il mapper materiali, a sua volta, copia il testo grezzo:
  `'family': (row.get('Famiglia') or '').strip() or None`
  (`backend/app/api/materials.py:226`) — nessuna conversione, nessun controllo.

Risultato: qualunque vincolo che vive **solo** nello schema Pydantic (enum di
fatto, range, formati) **non è imposto all'import**. Un valore "avvelenato"
entra nel DB senza resistenza e **esplode alla prima lettura**.

### Moduli esposti (tutti quelli che usano il motore)

`materiali`, `trattamenti`, `utensili`, `macchine`, `lavorazioni`,
e i vari `fornitori` (grezzi / esterni / utensili). Qualunque loro campo che
abbia un validatore solo lato `...Out` è una potenziale mina.
L'import **clienti** è a parte (endpoint storico, upsert per
`customer_number`), ma ha la stessa identica asimmetria e va trattato uguale.

---

## 3. RUNBOOK — come riparare SE RICAPITA (emergenza, 5 minuti)

Sintomo: dopo un import, una pagina/elenco va in **500** e nei log
(`logs/backend-err.log`) compare `ResponseValidationError` con il nome del
campo incriminato e il valore rifiutato.

1. **Backup PRIMA di toccare** (WAL-aware, obbligatorio — vedi CLAUDE.md §2.E):
   ```powershell
   $ts = Get-Date -Format 'yyyyMMdd-HHmmss'
   & 'C:\MechQuote\backend\venv\Scripts\python.exe' -c "import sqlite3; s=sqlite3.connect(r'C:\MechQuote\backend\mechquote.db'); d=sqlite3.connect(r'C:\MechQuote\backend\mechquote.db.bak-$ts'); s.backup(d); d.close(); s.close(); print('ok')"
   ```
2. **Identifica i valori sbagliati** nel campo segnalato (esempio con
   `materials.family`):
   ```sql
   SELECT family, COUNT(*) FROM materials GROUP BY family;
   ```
   Confronta con i valori validi (per le famiglie:
   `app/core/material_families.py`).
3. **Correggi i dati** mappando ogni valore sbagliato su quello valido
   (refusi/etichette → slug). Vuoto/`NULL` è ammesso per `family`:
   ```sql
   UPDATE materials SET family='acciaio_carbonio' WHERE family='Acciao al carbonio';
   UPDATE materials SET family='alluminio'        WHERE family='Alluminio';
   -- ...una riga per ogni valore errato
   ```
4. **Verifica** che ora tutte le righe passino lo schema `...Out` (replica
   esatta di ciò che fa l'endpoint), da `C:\MechQuote\backend` col venv:
   ```python
   from app.core.database import SessionLocal
   from app.models import Material
   from app.schemas import MaterialOut
   db = SessionLocal()
   bad = [(m.id, m.family) for m in db.query(Material).all()
          if not _ok(m)]  # _ok = prova MaterialOut.model_validate(m)
   print("NON validi:", bad)
   ```
   Zero righe non valide → l'endpoint torna a rispondere (nessun riavvio
   necessario: il backend rilegge dal DB ad ogni richiesta).

> Episodio 2026-06-05: 24 righe corrette (`Acciao al carbonio`→`acciaio_carbonio`,
> `Alluminio`→`alluminio`, `Rame`→`rame`, `Bronzo`→`altro`). Backup salvato in
> `backend/mechquote.db.bak-20260605-154746`.

---

## 4. FIX STRUTTURALE — perché NON debba più poter succedere

Obiettivo dichiarato: **nessun import CSV deve poter scrivere nel DB un dato
che la lettura poi rifiuta** — per *tutti* i moduli, in un colpo solo. Due
livelli, complementari.

### Livello 1 — Rete di sicurezza generica (chiude la classe di guasto)

Far passare **ogni riga** dal relativo schema Pydantic `...Create` *prima*
dell'insert, dentro il motore condiviso. Una sola modifica protegge tutti i
moduli.

- In `CsvImportConfig` aggiungere un campo opzionale
  `create_schema: Optional[type] = None`.
- In `import_catalog_csv`, dopo aver costruito `fields` e **prima** di
  `db.add(...)`:
  ```python
  if config.create_schema is not None:
      try:
          config.create_schema.model_validate(fields)   # stessi validatori della lettura
      except ValidationError as exc:
          result.skipped_invalid += 1
          if len(result.examples) < _EXAMPLES_CAP:
              result.examples.append(_first_error_msg(exc))  # messaggio leggibile
          continue
  ```
- Cablare `create_schema=MaterialCreate` (e gli analoghi) in ogni
  `CsvImportConfig`.

Effetto: una riga non valida diventa `skipped_invalid` con motivo nel toast,
**mai** un insert che farà crashare la lettura. La fonte di verità della
validazione torna **una sola** (lo schema), in linea con la regola DRY di
CLAUDE.md §0-bis.

> Attenzione implementativa: lo schema `...Create` deve coprire **tutti** i
> campi che il mapper popola (oggi alcuni mapper aggiungono campi extra come
> `active`, `edm_coefficient`, `cnc_machinability_coefficient`). Se non li
> copre, o si estende lo schema, o l'engine valida e poi inserisce i `fields`
> originali (validazione come puro "cancello", senza rimpiazzare i dati).
> Va deciso in fase di implementazione, schema per schema.

### Livello 2 — Normalizzazione per-campo (rende l'import davvero usabile)

Il Livello 1 da solo **salva il sito** ma scarterebbe le righe dell'utente
(che scrive "Acciaio al carbonio", non `acciaio_carbonio`). Per far sì che un
import legittimo **vada a buon fine**, il mapper deve normalizzare l'input
umano nella forma canonica:

- Helper in `app/core/material_families.py`, es. `resolve_family(text) -> slug | None`
  che riconosce sia lo slug sia l'etichetta, **tollerante a maiuscole/accenti/
  spazi**, e ritorna lo slug; `None` se non riconosciuto.
- Nel mapper materiali, sostituire la riga 226 con qualcosa come:
  ```python
  fam_raw = (row.get('Famiglia') or '').strip()
  family = resolve_family(fam_raw)
  if fam_raw and family is None:
      raise CsvRowSkip(f"Famiglia '{fam_raw}' non riconosciuta")
  ```
- Stesso pattern per ogni altro campo "a vocabolario chiuso" degli altri
  moduli.

### Livello 3 — Prevenzione a monte (template corretti)

I `csv_template_response` (modelli scaricabili) devono mostrare **i valori
ammessi reali**. Oggi il template materiali usa esempi `steel`/`aluminum`
(`backend/app/api/materials.py:286-287`) che **non sono** gli slug validi:
va allineato all'elenco di `material_families.py`, idealmente con una riga di
commento che elenca le famiglie ammesse. Un template giusto previene la metà
degli errori.

---

## 5. Stato

- **Riparazione incidente 2026-06-05**: ✅ fatta (dati materiali corretti,
  app operativa, backup conservato).
- **Fix strutturale (Livelli 1+2+3)**: ⏸ **DA IMPLEMENTARE**. È una modifica
  al motore condiviso + ai mapper + ai template. Registrata in
  `MECHQUOTE_LISTA_LAVORI.md`. Da fare un modulo alla volta, con verifica
  (CLAUDE.md §7), partendo dal Livello 1 (è quello che azzera il rischio di
  blocco dell'app).
