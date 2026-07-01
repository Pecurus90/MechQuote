# 20 — Dashboard "cockpit operativo per ruolo"

> **Stato**: spec proposta (2026-07-01), da approvare prima di implementare.
> Ridisegna la Dashboard. L'analitica resta in Statistiche (spec 19).

## 0. Principio

La Dashboard risponde a **"cosa devo fare adesso"**: cockpit **operativo**,
**per ruolo**, azione-orientato. Niente analitica pesante (vive in
`/statistics`). Contenuti **gated per permesso** (non per nome ruolo — i ruoli
sono dinamici, §3 CLAUDE.md): ognuno vede solo le sue liste/numeri.

Si **rimuove** dalla dashboard attuale: grafico mensile, KPI grid ampia, chip a
4 stati, tutto ciò che è "analisi". Si **tiene**: liste di lavoro (più mirate) +
attività recente. Risultato: meno affollata, gerarchica, utile ogni mattina.

## 1. Struttura (3 fasce)

```
[Nuovo preventivo]                                    Ciao, <nome>
─────────────────────────────────────────────────────────────────
FASCIA 1 — KPI headline (3-4 card cliccabili, per permesso)
─────────────────────────────────────────────────────────────────
FASCIA 2 — "Da fare" (liste azione, per permesso)   │  Attività
  colonna larga (2/3)                                │  recente (1/3)
```

## 2. FASCIA 1 — KPI headline (cliccabili)

Card mostrate solo se l'utente ha il permesso; ognuna linka alla pagina giusta.

| KPI | Valore | Permesso | Click → |
|---|---|---|---|
| **Preventivi attivi** | bozza+inviato+letto+confermato | `quotes.archive` | `/quotes/active` |
| **Da confermare** | inviato+letto | `quotes.confirm` | `/quotes/active?status=inviato` |
| **In attesa materiale** | confermato senza ordine | `quotes.confirm` o `orders.materials` | `/orders/materials` |
| **Utensili sotto minimo** | low-stock | `tools` | `/orders/tools` |

Fonte: `workflow-stats` (`by_status`) + `alerts` (già esistenti). Colore:
verde se 0 (tutto ok), ambra/arancio se c'è da agire.

## 3. FASCIA 2 — "Da fare" (liste azione, per permesso)

Card compatte: titolo + conteggio + prime ~5 righe (numero, cliente, chi) +
"vedi tutti" → pagina filtrata. Solo quelle pertinenti al permesso.

| Lista | Permesso | Endpoint (esistente) | Vedi tutti → |
|---|---|---|---|
| **Le mie bozze** | `quotes.create` | `my-quotes?status=bozza` | `/quotes/active?status=bozza` |
| **I miei inviati** | `quotes.create` | `my-quotes?status=inviato` | `/quotes/active?status=inviato` |
| **Rimandati a me** *(opz., §5)* | `quotes.create` | da definire | `/quotes/active?status=bozza` |
| **Da confermare** | `quotes.confirm` | `to-review` (inviato+letto) | `/quotes/active?status=inviato` |
| **Confermati in attesa materiale** | `quotes.confirm` | `awaiting-materials` | `/orders/materials` |

`Utensili sotto minimo` resta **solo come KPI + link** (niente lista in
fascia 2) per non introdurre endpoint nuovi: il dettaglio è già in
`/orders/tools`.

## 4. FASCIA 3 — Attività recente

Resta il feed attuale (`/dashboard/activity`), in colonna laterale (1/3),
secondario. "Vedi tutto" → `/activity`.

## 5. "Rimandati a me" — come ottenerlo (decisione aperta)

Preventivi che amministrazione ha rimandato in bozza (Blocco 4) e che il
creatore deve rilavorare. Oggi **non c'è un flag** sul Quote, solo l'evento
notifica `quote_reopened`. Due strade:
- **(A)** Deriva dalle notifiche `quote_reopened` non risolte per l'utente
  (nessuna migrazione) — endpoint dashboard che le mappa a righe preventivo.
- **(B)** Flag `reopened` su Quote (migrazione), settato al reopen, azzerato
  al re-invio. Query pulita ma tocca il modello.

Proposta: **(A)** se lo vogliamo subito senza migrazione; altrimenti rinviare
la lista e affidarsi alla notifica. Da decidere.

## 6. Backend

- Nessun nuovo endpoint obbligatorio: la dashboard riusa `workflow-stats`,
  `alerts`, `my-quotes`, `to-review`, `awaiting-materials`, `activity`.
- Si **smette di chiamare** `/dashboard/monthly` e `/dashboard/kpi` dalla
  dashboard (restano per eventuale riuso). Meno round-trip.
- Opzionale: `/dashboard/reopened` per "Rimandati a me" (strada A).
- Opzionale (perf): endpoint unico `/dashboard/cockpit` che impacchetta i
  conteggi headline + le liste in una risposta — valutabile, non necessario.

## 7. Frontend

- `DashboardPage`: riscritta sulle 3 fasce. Rimuove `MonthlyChart`, `KpiGrid`,
  `StatusChips` (o li archivia). Riusa `QuoteListSection` + `ActivityCard`.
- `KpiGrid`/`MonthlyChart`/`StatusChips` non più montati (file lasciati per
  eventuale riuso o rimossi se orfani — da decidere in fase di pulizia).
- Card KPI: riuso `KpiCards` di `statsShared` o un piccolo componente dedicato.

## 8. Cosa NON fa (per non duplicare Statistiche)

Niente trend €, margini, top clienti, distribuzione ore, costi materiali: tutto
questo è in `/statistics`. La dashboard ha al massimo numeri headline "vivi".

## 9. Decisioni aperte
1. **"Rimandati a me"**: strada **(A)** da notifiche (subito, no migrazione),
   **(B)** flag su Quote, o **rinviare**?
2. **Grafici**: confermi **nessun grafico** sulla dashboard (tutto in
   Statistiche)? Oppure vuoi **un solo** mini-trend headline?
3. **KPI headline**: i 4 proposti (attivi / da confermare / attesa materiale /
   utensili sotto minimo) sono quelli che guardi ogni mattina, o ne cambi/aggiungi?
