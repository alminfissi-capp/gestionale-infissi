# Condivisione da Android — Web Share Target

Data: 2026-09-01
Stato: design approvato, da implementare

## Problema

Chi fa un rilievo produce un PDF sul tablet. Oggi per farlo entrare nel gestionale
deve aprire WinStudio, navigare fino alla commessa giusta, aprire il dialog
documenti e ripescare il file dal file manager. Sul campo sono troppi passaggi, e
il file spesso resta sul tablet.

Android ha già il gesto giusto — il tasto Condividi — ma WinStudio non compare
fra le app di destinazione.

## Soluzione in una frase

Dichiarare WinStudio come **Web Share Target**, così condividendo un PDF o una
foto l'app compare nel foglio di condivisione di Android, si apre su un imbuto di
scelta della destinazione, e salva il file dove sarebbe finito caricandolo a mano.

## Limite da mettere in chiaro

**Su iPad e iPhone questo non funzionerà.** Safari non permette a una PWA di
comparire nel foglio di condivisione di iOS: non è una mancanza
dell'implementazione, è una porta che Apple non ha aperto. Se servirà anche lì, la
strada è un Comando dell'app Scorciatoie, e si progetta a parte.

Su Android serve inoltre che **WinStudio sia installato** come app (Chrome → menu
→ "Installa app"). Una PWA solo visitata nel browser non entra nel foglio di
condivisione.

## Decisioni prese

| Domanda | Scelta |
|---|---|
| Piattaforma | Android (Chrome), PWA installata |
| Tipi di file | PDF, JPEG, PNG |
| Quanti file per volta | Uno |
| Dopo la condivisione | Si apre l'imbuto "Dove salvo questo file?" |
| Dove sta il file nel frattempo | Sul dispositivo, in Dexie |
| Aree attive ora | Solo Produzione |
| Altre aree | Impalcatura pronta, nessuna voce grigia nell'elenco |
| Senza rete o sessione scaduta | Avviso e pulsante "Riprova"; il file resta salvato |

## Perché il file resta sul dispositivo

L'alternativa era far arrivare il POST della condivisione al server, parcheggiare
il file su Supabase e poi spostarlo. Tenendolo invece in Dexie, dove già stanno i
preventivi creati offline:

- il file non attraversa le funzioni Vercel finché non si sa dove va, quindi non
  incontra alcun limite sul corpo della richiesta;
- se la sessione è scaduta, il login intermedio non lo perde;
- attraversa la rete una volta sola invece che due.

Il costo è un listener `fetch` nel service worker, che va registrato **prima** di
`serwist.addEventListeners()`: la regola `NetworkOnly` sulle navigazioni
intercetterebbe altrimenti il POST e lo manderebbe al server.

## L'imbuto

### Primo livello — l'area

Un elenco di aree. Ora ne compare **una sola**, Produzione: mostrare voci grigie
per Commesse, Dipendenti e le altre sarebbe rumore, e un elenco di cinque voci di
cui quattro inerti confonde invece di orientare.

### Secondo livello — i passi dell'area

Per Produzione: cerca e scegli la commessa (stesso elenco di
`getCommessePerOrdine`, già filtrato per escludere le vendite anonime), poi scegli
il tipo di documento fra i sei di `TIPI_DOCUMENTO_PRODUZIONE` — Disegno, Scheda
tecnica, DDT, Conferma ordine, Foto, Ordine fornitore.

### Terzo passo — il salvataggio

Riusa `addDocumentoCommessa(commessaId, nomeFile, storagePath, tipoDocumento)`.
Il documento finisce esattamente dove finirebbe caricandolo dal dialog Documenti,
ed è indistinguibile da quelli caricati a mano.

## L'impalcatura per le aree future

I tipi stanno in `types/condivisione.ts`, il registro in
`components/condivisione/aree.ts` — in questo progetto `lib/` ospita solo logica
pura senza React, e il registro punta a dei componenti:

```ts
export type FileCondiviso = {
  id: number
  nome: string
  tipo: string   // MIME
  blob: Blob
  createdAt: string
}

export type AreaCondivisione = {
  id: string
  label: string
  descrizione: string
  icona: LucideIcon
  /** I passi dell'area: sceglie la destinazione e salva. */
  Passi: ComponentType<{ file: FileCondiviso; onFatto: () => void; onIndietro: () => void }>
}

export const AREE: AreaCondivisione[] = [areaProduzione]
```

Aggiungere Dipendenti domani significa aggiungere una voce all'array e scrivere il
suo componente di passi. Nient'altro cambia.

**Non si costruisce un motore generico di passi.** Ogni area ha una forma diversa
— Produzione cerca una commessa e sceglie un tipo, Dipendenti sceglierebbe persona
e mensilità, Magazzino un prodotto — e un linguaggio astratto per descriverle
costerebbe più di quanto farebbe risparmiare, andando comunque stretto alla prima
area che non ci rientra.

## Impianto tecnico

### Manifest — `public/site.webmanifest`

```json
"share_target": {
  "action": "/condividi/ricevi",
  "method": "POST",
  "enctype": "multipart/form-data",
  "params": {
    "files": [{
      "name": "file",
      "accept": ["application/pdf", "image/jpeg", "image/png"]
    }]
  }
}
```

### Service worker — `app/sw.ts`

Un listener `fetch` **prima** di `serwist.addEventListeners()`: intercetta il POST
verso `/condividi/ricevi`, legge il `FormData`, salva il primo file in Dexie e
risponde con un redirect 303 a `/condividi`. Se sono stati condivisi più file
prende il primo: la pagina lo dirà.

### Dexie — `lib/db.ts`

Versione 5, tabella `condivisioni: '++id, createdAt'`, accanto a
`pendingPreventivi`. Tiene il blob del file. Le versioni precedenti restano
dichiarate come sono: Dexie migra da sole.

Una sola condivisione per volta: prima di scriverne una nuova si svuota la
tabella, così non si accumulano file dimenticati che occupano spazio sul tablet.

### Pagina — `app/(dashboard)/condividi/page.tsx`

Dentro `(dashboard)` per ereditarne l'autenticazione: se la sessione è scaduta il
login scatta prima, e al ritorno il file è ancora in Dexie. Legge la condivisione
più recente, mostra l'imbuto, e a salvataggio riuscito cancella il record e
rimanda alla commessa.

Se non trova nessun file (pagina aperta a mano, o condivisione già consumata)
mostra una spiegazione di cosa fa questa pagina, non un errore.

### Caricamento — `lib/upload-documento.ts` (estratto)

`DialogDocumenti` contiene già la strategia giusta, con il perché scritto: prima
il caricamento diretto dal browser su Supabase Storage, e in caso di errore il
ripiego sulla Server Action, perché **su Android il client browser può non avere
la sessione**. Quella logica va estratta in un helper condiviso e usata da
entrambi, invece di essere copiata: è esattamente il caso mobile che questa
funzione mette al centro, ed è dove un errore si pagherebbe di più.

`DialogDocumenti` viene riscritto per chiamare l'helper. Nessun cambiamento di
comportamento: stesso ordine di tentativi, stessi messaggi.

### Ripiego — `app/condividi/ricevi/route.ts`

Se il service worker non fosse attivo — succede nei primi istanti dopo
l'installazione, o subito dopo un aggiornamento — il POST arriverebbe al server.
Quel route handler risponde con un redirect a `/condividi?errore=sw`, e la pagina
spiega di riaprire l'app e riprovare. Senza, Next risponderebbe 405 e Android
mostrerebbe una pagina di errore grezza.

## File

**Nuovi**
- `types/condivisione.ts` — `FileCondiviso`, `AreaCondivisione`
- `components/condivisione/aree.ts` — il registro delle aree
- `components/condivisione/AreaProduzione.tsx` — i passi del ramo Produzione
- `components/condivisione/ImbutoCondivisione.tsx` — primo livello e orchestrazione
- `lib/upload-documento.ts` — caricamento a due livelli, estratto da DialogDocumenti
- `app/(dashboard)/condividi/page.tsx` — la pagina dell'imbuto
- `app/condividi/ricevi/route.ts` — ripiego quando il service worker non c'è

**Modificati**
- `public/site.webmanifest` — blocco `share_target`
- `app/sw.ts` — listener `fetch` per la condivisione
- `lib/db.ts` — versione 5, tabella `condivisioni`
- `components/commesse/DialogDocumenti.tsx` — usa l'helper estratto

## Verifica

- Vitest su `lib/upload-documento.ts` (ordine dei tentativi, ripiego su errore) e
  sulla costruzione del percorso di storage
- `npx tsc --noEmit` pulito e `npm run lint` senza problemi nuovi (il baseline è
  zero)
- A mano, su un tablet Android con WinStudio installato: condividere un PDF da un
  file manager e una foto dalla galleria, verificare che l'app compaia
  nell'elenco, che l'imbuto si apra col nome del file giusto, che il documento
  compaia poi in Produzione sulla commessa scelta e nel dialog Documenti
- Con la modalità aereo attiva: il messaggio compare e il file non si perde
- Aprire `/condividi` a mano senza aver condiviso niente: spiegazione, non errore

## Fuori perimetro

iPhone e iPad. Più file in una condivisione. La coda che ricarica da sola al
ritorno della rete. Le aree Commesse, Dipendenti, Magazzino e le altre: c'è
l'impalcatura, si accendono quando servono. Condivisione di testo o link (il
`share_target` dichiara solo file).
