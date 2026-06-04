# Aggiornare MechQuote sul server

## A chi serve

Questa scheda è per chi si occupa di aggiornare MechQuote sul **PC server** dell'azienda quando esce una versione nuova.

Non serve essere tecnici: bisogna solo saper aprire una finestra nera (il **Prompt dei comandi**) e copiare tre righe.

---

## Come si fa — i passi

1. Apri il **Prompt dei comandi come amministratore**:
   - Premi il tasto **Start** ⊞ in basso a sinistra.
   - Scrivi `Prompt dei comandi`.
   - Sull'icona che compare, **tasto destro del mouse** → **Esegui come amministratore**.
   - Quando Windows chiede conferma, clicca **Sì**.

2. Nella finestra che si apre, scrivi e premi Invio:

   ```
   cd C:\MechQuote
   ```

3. Poi scrivi e premi Invio:

   ```
   update.bat
   ```

4. Aspetta. Lo script scrive cosa sta facendo, riga per riga. Quando dice **AGGIORNAMENTO COMPLETATO** vuol dire che ha finito bene. Premi Invio per chiudere la finestra.

---

## Cosa fa lo script, in breve

Prima di tutto fa una **copia di sicurezza del database** (così, se qualcosa va storto, si può tornare indietro). Poi scarica i file nuovi da GitHub, ricostruisce il sito e riavvia il motore di MechQuote.

Tutto in modo sicuro: se un passaggio non va a buon fine, lo script **si ferma da solo senza rovinare niente**. Il MechQuote che gli utenti vedono nel browser continua a funzionare con la versione precedente finché l'aggiornamento non è andato a buon fine fino in fondo.

---

## Se si ferma con `[STOP]`

A volte lo script si ferma e scrive `[STOP]` con un messaggio. Non è un disastro: significa che ha trovato un problema e si è bloccato per sicurezza.

- **Leggi il messaggio.** È scritto in italiano semplice e ti dice (a) cosa è successo, (b) cosa fare per risolverlo (esempio: "git non disponibile per l'amministratore — reinstalla scegliendo 'PATH per tutti gli utenti'").
- **Se il messaggio non è chiaro**, lascia la finestra aperta e **chiama lo sviluppatore** — gli serve per capire il problema.
- **La finestra resta aperta:** lo script aspetta che tu prema Invio, così hai tempo di leggere o di fotografare il messaggio col telefono.

---

## Dove sono i backup del database

Ogni volta che lo script parte, prima di toccare qualunque cosa salva una copia del database in:

```
C:\MechQuote\backups\
```

I file si chiamano `mechquote.db.bak-AAAAMMGG-HHMMSS` (data e ora). Se serve recuperare i dati di prima dell'aggiornamento, sono lì.

---

## Una sola regola da ricordare

Si lancia **sempre** `update.bat` — non altri file.

Nella cartella c'è anche un file che si chiama `update.ps1`: è quello che fa il lavoro vero, ma **non va aperto né toccato a mano**. Ci pensa `update.bat` a lanciarlo.
