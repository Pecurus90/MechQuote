# Import stampi storici — Istruzioni

Questo template ti permette di portare nel sistema tutti gli stampi che hai già fatto negli anni passati. Una volta importati, il `find-similar` ti suggerirà subito stampi storici simili durante i nuovi preventivi, e la futura auto-calibrazione avrà subito numeri su cui ragionare.

## Come compilare

Apri `import_historical_dies_template.csv` con Excel (o LibreOffice). Vedi una riga di intestazione + 6 righe di esempio. Cancella le righe di esempio quando hai capito il pattern, lasciando solo l'intestazione, e riempi con i tuoi dati.

### Cosa va in ogni colonna

| Colonna | Obbligatoria? | Esempio | Note |
|---|---|---|---|
| `data` | **Sì** | `2024-03-15` | Formato YYYY-MM-DD. Se non hai la data precisa, usa il primo del mese (`2024-03-01`) |
| `cliente` | **Sì** | `Rossi SRL` | Nome del cliente. Se il nome è leggermente diverso da come è scritto in app (es. "Rossi srl" vs "Rossi SRL"), lo script tratta come stesso cliente |
| `tipo` | **Sì** | `passo` o `blocco` | Solo questi 2 valori |
| `bbox_x_mm` | **Sì** | `80` | Lunghezza pezzo prodotto, in mm |
| `bbox_y_mm` | **Sì** | `40` | Larghezza pezzo, in mm |
| `spessore_mm` | Opzionale | `2` | Spessore lamiera in mm. Lascia vuoto se non ricordi |
| `n_stazioni` | Solo se `tipo=passo` | `3` | Numero stazioni del progressivo. Lascia vuoto per stampi a blocco |
| `n_pieghe_tot` | Opzionale | `2` | Totale pieghe (anche stimato a memoria). Lascia `0` se nessuna |
| `n_punzoni_tot` | Opzionale | `4` | Totale punzoni. Lascia `0` se nessuno |
| `difficolta` | Opzionale | `base`, `medium`, `hard` | Difficoltà percepita. Se non sai, lascia `medium` |
| `prezzo_preventivato` | **Sì** | `4200` | Cost industrial pre-margine, oppure il prezzo che davi al cliente prima della trattativa. In euro, **senza** simbolo € |
| `prezzo_venduto` | **Sì** | `4500` | Prezzo che il cliente ha effettivamente pagato dopo trattativa |
| `costo_consuntivo` | Opzionale | `3800` | Costo reale a consuntivo (ore reali × tariffe reali). Se non ce l'hai, lascia vuoto |
| `note` | Opzionale | testo libero | Qualunque annotazione |

### Cosa NON ti serve

- **Piastre dettagliate** (cappello, matrice, ecc.) — non servono per il find-similar
- **Normalizzati** (colonne, boccole, molle) — non servono
- **Ore EDM / ore meccaniche** — non servono (vengono ricalcolate o lasciate stare)
- **Materiali matrice/punzone specifici** — non servono per il matching

Il sistema importa solo quello che serve per il **find-similar** e per i **ratio venduto/consuntivo**. È intenzionalmente "leggero" — non ricostruiamo i preventivi originali, registriamo solo i numeri chiave.

## Note pratiche

### Periodo da importare
- **Ultimi 2-3 anni**: dati affidabili, tariffe simili a oggi → ottimi per calibrazione.
- **Più vecchi**: importali se hai i dati ma metti la data corretta. Lo script li include comunque, la card auto-calibrazione (futura) potrà filtrarli per data se necessario.
- Se hai stampi degli anni '90 con prezzi in lire... non importarli :)

### Quanti stampi minimi?
- **< 20**: il `find-similar` mostra qualcosa ma è raro che trovi un match (i criteri sono area castello ±30% + pieghe ±2 + punzoni ±2).
- **20-50**: il sistema inizia a essere utile, vedi suggerimenti su 1 preventivo su 3.
- **50+**: ogni nuovo preventivo trova almeno 1-2 simili. Calibrazione automatica diventa significativa.
- **100+**: il sistema è davvero "esperto".

### Dati mancanti
Se per uno stampo ti mancano `bbox_x_mm` o `bbox_y_mm` (le 2 dimensioni del pezzo), **non potrà essere usato dal find-similar** (manca il driver di matching). Il sistema lo importa comunque ma sarà invisibile alle ricerche.

Se ti manca solo il **consuntivo**: tienilo vuoto. Il `prezzo_venduto` da solo è già utile per la calibrazione del margine.

### Cliente non in catalogo
Se nel CSV scrivi un cliente che non esiste ancora in Settings → Clienti, lo script lo crea automaticamente con un numero progressivo. Lo vedrai dopo in app.

### Decimali e separatori
- **Decimali**: usa il **punto** (`2.5`, non `2,5`). Excel italiano potrebbe convertirli a virgole — controlla.
- **Separatore CSV**: il template usa `;`. Quando salvi da Excel scegli "CSV (delimitato dal separatore di elenco)" che usa `;` di default in Italia.
- **Encoding**: UTF-8. Excel di solito gestisce, ma se vedi caratteri strani (è / à) salva esplicitamente come "CSV UTF-8".

## Dopo aver compilato

Salva il file (mantenendo l'estensione `.csv`) e dimmelo. Io a quel punto costruisco lo script di import che:

1. Legge il tuo file.
2. Fa un **dry-run**: ti dice "ho letto N righe, X valide, Y skippate con questi motivi: ...".
3. Solo dopo tuo OK, esegue l'import vero.
4. Marca i preventivi importati con un flag `is_historical_import=True` così sono distinguibili dagli stampi creati con l'app.

Domanda dopo l'import: **vuoi che gli stampi storici siano visibili anche nell'archivio normale**, o nascosti in una sezione separata "Archivio storico"?
