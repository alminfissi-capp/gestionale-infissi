# Allega PDF dal dispositivo (accodato alla stampa) — Design

Data: 2026-07-04

## Obiettivo
Nel dettaglio preventivo, accanto al pulsante "Allega catalogo", aggiungere un pulsante
**"Allega PDF"** che permette di caricare uno o più PDF dal dispositivo (fuori dalla libreria
cataloghi). I PDF vengono **accodati alla stampa** del preventivo, esattamente come i cataloghi:
compaiono nella stampa admin e nella pagina pubblica `/p/[token]`, ma NON nel PDF inviato via email
(parità con i cataloghi, che l'email già esclude).

## Non-obiettivi (YAGNI)
- Nessun salvataggio nella libreria cataloghi riutilizzabile.
- Nessuna scelta interno/stampa: sempre in stampa.
- Nessun riordino manuale degli allegati.
- Nessuna inclusione nel PDF generato via email.

## Modello dati
- Nuova colonna `allegati_pdf JSONB NOT NULL DEFAULT '[]'` su `preventivi`.
  Ogni voce: `{ "id": uuid, "nome": string, "storage_path": string }`.
- File nel bucket pubblico esistente `preventivi-allegati`, path `{orgId}/{prevId}/allegati/{uuid}.pdf`.
- `getPreventivo` costruisce `allegati_pdf_data: { id, nome, url }[]` con `getPublicUrl`
  (identico a `cataloghi_allegati_data`). Stessa costruzione nella pagina pubblica
  `getPreventivoByToken` (service client, bucket pubblico).
- Tipo `PreventivoCompleto` → nuovo campo `allegati_pdf_data: { id; nome; url }[]`.

## Server actions (`actions/preventivi.ts`)
- `addAllegatoPdf(preventivoId, nome, storagePath)`: legge `allegati_pdf`, appende
  `{ id: crypto.randomUUID(), nome, storage_path }`, salva, `revalidatePath('/preventivi/[id]')`.
- `removeAllegatoPdf(preventivoId, allegatoId)`: rimuove la voce dall'array, `remove()` del file
  da storage (best-effort), salva, revalidate.

## UI (`DettaglioPreventivo.tsx`, box Allegati)
- Secondo pulsante **"Allega PDF"** accanto a "Allega catalogo", con `<input type=file
  accept="application/pdf">` nascosto (pattern di `ImportaPdfCosti`: hidden input + ref.click,
  upload diretto via supabase client — sicuro su mobile fuori da Dialog).
- Alla selezione: valida `.pdf` e dimensione max 10 MB → upload a
  `preventivi-allegati/{orgId}/{prevId}/allegati/{uuid}.pdf` → `addAllegatoPdf` → `router.refresh()`.
  Spinner durante upload, toast di esito. Più file consentiti (upload sequenziale).
- Sotto l'elenco cataloghi: elenco dei PDF caricati (icona + nome) con pulsante **×** per rimuovere
  (`removeAllegatoPdf` + refresh).

## Stampa (`StampaPreventivo.tsx`)
- Dopo il `.map` di `cataloghi_allegati_data`, aggiungere `p.allegati_pdf_data.map(a =>
  <AllegatoCatalogoPdf key={a.id} url={a.url} nome={a.nome} />)`. `AllegatoCatalogoPdf` è già
  generico su qualsiasi URL PDF.

## Parità tipi
- Aggiungere `allegati_pdf_data: []` ai literal `PreventivoCompleto` che compilano:
  - `app/api/preventivi/[id]/email/route.tsx` (email — resta escluso dal PDF).
  - `app/(public)/p/[token]/page.tsx` (qui popolato con i dati reali).

## Pulizia
- `deletePreventivo`: oltre alle immagini voce-libera, rimuovere anche i file elencati in
  `allegati_pdf` dal bucket `preventivi-allegati`.

## Migration
`supabase/migrations/20260704160000_preventivo_allegati_pdf.sql`:
```sql
ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS allegati_pdf JSONB NOT NULL DEFAULT '[]'::jsonb;
```
