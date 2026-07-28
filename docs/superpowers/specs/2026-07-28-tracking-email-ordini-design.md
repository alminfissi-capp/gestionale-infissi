# Tracking invio e lettura ordini fornitore — Design

**Data:** 2026-07-28
**Branch:** `tracking-email-ordini`
**Stato:** design approvato, spec da rivedere

## Obiettivo

Sapere se il fornitore ha ricevuto e visto l'ordine, e lasciarne traccia sul documento.

Oggi `POST /api/produzione/invia-ordine` manda l'ordine e valorizza `ordini_fornitore.inviato_at`,
ma quel dato non compare da nessuna parte nell'interfaccia e non esiste alcun segnale di ritorno
dal fornitore. Dopo l'invio l'ordine è indistinguibile da uno mai spedito.

Servono tre cose:
1. un'icona in tabella che dica a colpo d'occhio se l'ordine è stato inviato e se è stato letto;
2. la registrazione automatica della lettura da parte del fornitore;
3. un footer sul PDF con data e ora di invio e di lettura, come prova di avvenuta consegna.

## Vincolo tecnico che determina il disegno

**Un allegato PDF non è tracciabile.** Una volta dentro l'email il file non passa più dai nostri
server: nessun evento è osservabile. Per sapere se il fornitore ha aperto il documento, il PDF
deve essere raggiunto tramite un link servito dall'app.

Di conseguenza l'email cambia forma: da testo con allegato a HTML con un link tracciato.

## Contesto verificato nel codice (2026-07-28)

| Fatto | Conseguenza |
|---|---|
| `ordini_fornitore.inviato_at` esiste già ed è valorizzato all'invio | non serve una colonna nuova per l'invio |
| L'email è `text` puro con `attachments: [...]` (`app/api/produzione/invia-ordine/route.ts`) | va riscritta in HTML, l'allegato sparisce |
| Esiste già il pattern pixel per i preventivi: `app/api/track/email/[id]/route.ts` + `preventivi.email_aperta_at` (migrazione `029_email_tracking.sql`) | riusare la stessa forma, non inventarne un'altra |
| `pdf-lib` è già in `package.json` | disponibile, ma **non serve**: vedi sezione Footer |
| Il PDF è generato client-side da `OrdinePDF.tsx` e **riarchiviato a ogni Anteprima** (`generaPdf` in `ElencoOrdini.tsx` e `ProduzioneCommessa.tsx` → `salvaPdfOrdine`) | il file in `pdf_path` cambia nel tempo: al fornitore serve una copia congelata |
| `salvaPdfOrdine` sostituisce il PDF precedente e rimuove il vecchio file | lo snapshot per il fornitore deve stare su un path separato, altrimenti viene cancellato |
| Non esiste `components/ui/tooltip.tsx` | va aggiunto con `npx shadcn@latest add tooltip` |
| Il route group `(public)` esiste già (`/p/[token]`, `/conferma`) | la pagina fornitore ci si inserisce senza nuova infrastruttura |
| `NEXT_PUBLIC_APP_URL` è già richiesto e configurato su Vercel | i link assoluti nell'email funzionano |

## Decisioni

1. **Pixel + link al PDF, niente allegato.** Due segnali distinti: apertura dell'email (pixel,
   inaffidabile) e apertura del documento (click, certo). L'allegato viene rimosso: tenerlo
   significherebbe che il fornitore apre il file senza passare da noi e il tracking resta vuoto
   pur avendo lui visto tutto.
2. **Storico completo degli eventi**, non solo gli ultimi timestamp. Tabella dedicata, una riga
   per evento. Regge le contestazioni («non l'ho mai ricevuto») e permette di vedere i reinvii.
3. **Lo stato corrente si deriva dagli eventi successivi all'ultimo `inviato`.** Nessuna colonna
   denormalizzata `email_aperta_at` / `pdf_aperto_at`: il reinvio azzera l'indicatore senza
   cancellare nulla, e non esistono due sorgenti di verità da tenere allineate.
4. **Indicatore a tre stati** — non inviato, inviato, letto — con tooltip che espone il dettaglio.
   Distinguere visivamente «email aperta» da «documento aperto» darebbe un'icona intermedia
   pilotata da un segnale (il pixel) che Gmail e Outlook bloccano di default: un semaforo che resta
   indietro rispetto alla realtà. Il dettaglio sta nel tooltip, dove non inganna.
5. **Copia congelata per il fornitore.** All'invio il PDF corrente viene duplicato in
   `pdf_inviato_path`. Il fornitore scarica sempre e solo quello: non vede il footer di lettura e
   non vede modifiche fatte dopo l'invio. È anche corretto in sé — deve poter consultare esattamente
   il documento che gli è stato spedito.
6. **Footer dentro `OrdinePDF.tsx`, non stampigliato con pdf-lib.** Poiché il PDF viene comunque
   rigenerato a ogni Anteprima, basta passare i dati di tracking al componente. Un passaggio
   pdf-lib in più sarebbe lavoro senza guadagno.
7. **La visita alla pagina fornitore si registra client-side.** I filtri antispam aziendali
   (Outlook Safe Links, gateway antivirus) visitano i link contenuti nelle email ma non eseguono
   JavaScript. Registrare l'evento server-side produrrebbe letture inesistenti, che è il modo
   peggiore di fallire per una funzione che serve come prova.
8. **Il link non scade.** Il token è un uuid non indovinabile e un fornitore riconsulta l'ordine
   anche mesi dopo. Una scadenza produrrebbe solo link morti da rimandare a mano.

## Modello dati

### Nuova tabella `tracking_email_ordine`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | UUID PK DEFAULT `gen_random_uuid()` | |
| `organization_id` | UUID NOT NULL → `organizations(id)` ON DELETE CASCADE | multi-tenancy |
| `ordine_id` | UUID NOT NULL → `ordini_fornitore(id)` ON DELETE CASCADE | |
| `tipo` | TEXT NOT NULL CHECK IN (`inviato`, `email_aperta`, `pagina_aperta`, `pdf_scaricato`) | |
| `avvenuto_at` | TIMESTAMPTZ NOT NULL DEFAULT `now()` | |
| `destinatario` | TEXT | email del fornitore, valorizzata solo su `inviato` |
| `user_agent` | TEXT | distingue una persona da uno scanner |
| `ip` | TEXT | indirizzo del chiamante sugli eventi di lettura |

Indice: `(ordine_id, avvenuto_at DESC)`.

RLS: `SELECT` per `organization_id = get_user_organization_id()`. Nessuna policy di `INSERT`
per gli utenti: gli eventi vengono scritti esclusivamente lato server con il service client.

**Nota GDPR.** `ip` e `user_agent` sono dati personali del referente del fornitore. In un rapporto
B2B la conservazione a fini di prova della consegna ricade nel legittimo interesse. Se non si vuole
assumere l'onere, le due colonne si tolgono senza impatto sul resto del disegno.

### Colonne nuove su `ordini_fornitore`

| Colonna | Tipo | Note |
|---|---|---|
| `tracking_token` | UUID UNIQUE | token del link pubblico, generato al primo invio e poi stabile |
| `pdf_inviato_path` | TEXT | storage path della copia congelata servita al fornitore |

`inviato_at` resta com'è: ultimo invio, già usato dal codice esistente.

## Componenti

### `lib/produzione-tracking.ts` — logica pura, testata

```ts
export type TipoEventoTracking = 'inviato' | 'email_aperta' | 'pagina_aperta' | 'pdf_scaricato'

export type EventoTracking = {
  tipo: TipoEventoTracking
  avvenuto_at: string
  destinatario: string | null
}

export type StatoInvio = 'non_inviato' | 'inviato' | 'letto'

export type TrackingOrdine = {
  stato: StatoInvio
  inviatoAt: string | null
  destinatario: string | null
  emailApertaAt: string | null      // prima apertura dopo l'ultimo invio
  paginaApertaAt: string | null
  pdfScaricatoAt: string | null
  aperture: number                  // pagina_aperta + pdf_scaricato dopo l'ultimo invio
  invii: number                     // totale eventi 'inviato', storico completo
}

export function riassumiEventi(eventi: EventoTracking[]): TrackingOrdine
```

`riassumiEventi` prende tutti gli eventi di un ordine, individua l'ultimo `inviato` e considera
solo ciò che è successo dopo. `stato = 'letto'` se esiste almeno un evento di lettura di qualsiasi
tipo dopo l'ultimo invio. Nessuna dipendenza da React o Supabase, testabile in isolamento.

### `actions/produzione-tracking.ts`

- `getTrackingOrdini(ordineIds: string[]): Promise<Map<string, TrackingOrdine>>` — una sola query
  `in('ordine_id', ordineIds)` filtrata per org, poi `riassumiEventi` per gruppo. Ritorna una mappa
  vuota per array vuoto senza interrogare il database.
- `registraEvento(ordineId, orgId, tipo, dati)` — usata dalle route server, scrive con il service
  client. Riceve `orgId` come argomento perché sui percorsi pubblici non c'è sessione utente.

### `components/produzione/StatoInvioOrdine.tsx`

Props: `tracking: TrackingOrdine`. Rende una sola icona `lucide-react` con tooltip shadcn:

| stato | icona | colore | tooltip |
|---|---|---|---|
| `non_inviato` | `Circle` | `text-muted-foreground` | «Non inviato» |
| `inviato` | `Mail` | `text-muted-foreground` | «Inviato a rossi@x.it il 28/07/2026 11:42» |
| `letto` | `CheckCheck` | `text-green-600` | riga di invio + una riga per ciascun evento di lettura registrato, con «aperto N volte» quando `aperture > 1` |

Il tooltip riporta anche «reinviato N volte» quando `invii > 1`. Il `TooltipTrigger` porta un
`aria-label` con lo stesso testo, così l'informazione resta accessibile senza hover.

Va aggiunto `components/ui/tooltip.tsx` con `npx shadcn@latest add tooltip`.

## Flusso di invio

`POST /api/produzione/invia-ordine`, riscritto:

1. controlli attuali invariati (ordine esiste, `pdf_path` presente, fornitore con email);
2. se `tracking_token` è nullo, genera un uuid e salvalo;
3. copia `pdf_path` → `pdf_inviato_path` = `{orgId}/ordini/{ordineId}/inviato-{timestamp}.pdf`,
   scaricando e ricaricando con il service client sul bucket `commesse-docs`. Il path è distinto
   da quello gestito da `salvaPdfOrdine`, che altrimenti lo rimuoverebbe alla prossima Anteprima.
   L'eventuale snapshot precedente viene rimosso dopo il caricamento del nuovo, best effort;
4. invia l'email in HTML con Resend:
   - stesso testo di oggi come corpo, più un pulsante «Visualizza l'ordine» verso
     `{NEXT_PUBLIC_APP_URL}/o/{token}`;
   - `<img src="{NEXT_PUBLIC_APP_URL}/api/track/ordine/{token}" width="1" height="1">` in fondo;
   - campo `text` mantenuto come fallback, con il link in chiaro;
   - **nessun `attachments`**;
5. registra l'evento `inviato` con `destinatario`;
6. aggiorna `inviato_at` e `stato = 'ordinato'` come oggi.

Se l'invio Resend fallisce non viene registrato nulla e `pdf_inviato_path` non viene aggiornato.

## Percorsi pubblici

Tutti senza autenticazione, tutti risolvono l'ordine per `tracking_token` con il service client.
Un token inesistente risponde 404 senza rivelare altro.

### `GET /api/track/ordine/[token]` — pixel

Registra `email_aperta` e restituisce la GIF 1×1 con `Cache-Control: no-store`, identico per forma
a `app/api/track/email/[id]/route.ts`. **Dedup:** se esiste già un `email_aperta` per lo stesso
ordine negli ultimi 60 secondi, non ne scrive un altro — i client di posta richiedono l'immagine
più volte per una sola apertura.

### `app/(public)/o/[token]/page.tsx` — pagina fornitore

Server Component che carica l'ordine e mostra una card: logo e denominazione da `getSettings`,
numero ordine formattato con `formattaNumeroOrdine`, nome fornitore, data ordine, e un `<a>` verso
`/o/{token}/pdf` con attributo `download`. Nessun `next/link`, per non innescare il prefetch.

Un piccolo Client Component monta un `useEffect` che fa `POST /api/track/ordine/{token}/visita`,
che registra `pagina_aperta`. Stessa dedup a 60 secondi.

### `GET /o/[token]/pdf` — download

Route handler in `app/(public)/o/[token]/pdf/route.ts`. Registra `pdf_scaricato`, poi scarica
`pdf_inviato_path` dal bucket con il service client e lo restituisce con
`Content-Type: application/pdf` e `Content-Disposition: attachment; filename="ORD NNN-AAAA.pdf"`.
Se `pdf_inviato_path` è nullo risponde 404.

## Footer del PDF

`OrdinePDF.tsx` riceve una prop opzionale `tracking?: TrackingOrdine`. Se assente, o se
`stato === 'non_inviato'`, non rende nulla: il PDF prima dell'invio resta identico a oggi.

Altrimenti rende in fondo alla pagina un `View` con `fixed`, sopra un filetto grigio:

```
──────────────────────────────────────────
Inviato a rossi@esempio.it il 28/07/2026 11:42
Documento aperto dal destinatario il 28/07/2026 14:03
```

La seconda riga compare solo se c'è una lettura; con il solo pixel si legge «Email aperta il ...».
Date formattate in `it-IT`, giorno e ora.

**Niente numerazione di pagina**, benché fosse nel mock iniziale: gli allegati vengono uniti con
pdf-lib *dopo* la generazione (`unisciAllegatiAlPdf`), quindi un «pag. 1/2» calcolato da react-pdf
risulterebbe sbagliato sul documento finale. Se serve, va calcolato dopo l'unione — fuori da questo
lavoro.

Chi passa la prop: `generaPdf` in `ElencoOrdini.tsx` e in `ProduzioneCommessa.tsx`. Le rispettive
pagine server devono quindi caricare il tracking insieme agli ordini.

## File toccati

**Nuovi**
- `supabase/migrations/20260728120000_tracking_email_ordini.sql`
- `lib/produzione-tracking.ts` + `lib/produzione-tracking.test.ts`
- `actions/produzione-tracking.ts`
- `components/produzione/StatoInvioOrdine.tsx`
- `components/ui/tooltip.tsx` (da shadcn)
- `app/api/track/ordine/[token]/route.ts`
- `app/api/track/ordine/[token]/visita/route.ts`
- `app/(public)/o/[token]/page.tsx` + `TracciaVisita.tsx`
- `app/(public)/o/[token]/pdf/route.ts`

**Modificati**
- `app/api/produzione/invia-ordine/route.ts` — email HTML, snapshot, evento
- `types/produzione.ts` — riesporta i tipi di tracking
- `components/produzione/OrdinePDF.tsx` — prop `tracking` e footer
- `components/produzione/ElencoOrdini.tsx` — icona in tabella, prop al PDF
- `components/produzione/ProduzioneCommessa.tsx` — idem
- `app/(dashboard)/produzione/page.tsx` e `[commessaId]/page.tsx` — caricano il tracking

## Gestione degli errori

- La scrittura di un evento non deve mai far fallire la risposta al fornitore: pixel, pagina e
  download rispondono comunque, l'errore va in `console.error` come nel route esistente.
- Snapshot non caricabile all'invio → l'invio si interrompe con errore, senza mandare l'email:
  meglio nessun invio che un link a un file inesistente.
- `pdf_inviato_path` nullo su un ordine con `tracking_token` (dati vecchi o snapshot fallito) →
  la pagina fornitore mostra un messaggio di documento non disponibile invece del pulsante.
- Ordini inviati prima di questa funzione: `tracking_token` nullo, nessun evento. L'icona mostra
  «inviato» sulla base di `inviato_at`, senza dati di lettura. Il footer non compare.

## Test

`lib/produzione-tracking.test.ts` con Vitest, sulla sola `riassumiEventi`:

- array vuoto → `non_inviato`
- solo `inviato` → `inviato`, nessuna data di lettura
- `inviato` → `email_aperta` → `letto` con `emailApertaAt` valorizzato
- `inviato` → `pdf_scaricato` senza pixel → `letto` (Gmail ha bloccato l'immagine)
- `inviato` → letture → **secondo `inviato`** → torna `inviato`, `invii = 2`, letture azzerate
- letture precedenti all'ultimo invio ignorate anche se più recenti di altre
- `aperture` conta `pagina_aperta` e `pdf_scaricato`, non `email_aperta`
- eventi in ordine non cronologico → risultato identico

I percorsi pubblici e l'invio si verificano a mano in produzione: il pixel dipende dal client di
posta reale e Resend non è simulabile utilmente qui.

## Fuori perimetro

- Notifiche push o email all'admin quando il fornitore legge: l'icona è il segnale richiesto.
- Tracking delle stesse informazioni sui preventivi, che hanno già il loro pixel.
- Numerazione di pagina sul PDF unito agli allegati.
- Scadenza o revoca dei link pubblici.
