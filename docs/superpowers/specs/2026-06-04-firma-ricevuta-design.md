# Spec — Firma ricevuta di pagamento

**Data:** 2026-06-04  
**Stato:** approvato

---

## Obiettivo

Permettere allo staff ALM di apporre la propria firma digitale (disegnata con il dito o precaricata) su una ricevuta di pagamento direttamente da mobile. La firma viene salvata in modo permanente sull'acconto e inclusa nel PDF condivisibile.

---

## Flusso utente

1. Staff apre la pagina ricevuta (`/commesse/[id]/ricevuta/[accontoId]`) su mobile
2. Toolbar mostra pulsante **"Firma"** (se già firmata: badge verde "Firmata" + pulsante "Modifica firma")
3. Tap su Firma → si apre uno Sheet (pannello dal basso) `DrawerFirmaRicevuta`
4. Nel drawer:
   - Se `impostazioni.firma_default` è presente: mostra anteprima con pulsante **"Usa questa firma"**
   - Canvas touch per tracciare una firma nuova con il dito
   - Pulsanti: **"Cancella"** (svuota canvas) / **"Salva e applica"**
5. Tap "Salva e applica" → server action salva base64 su `acconti_commessa.firma_immagine`
6. Drawer si chiude; la firma appare nella sezione "Firma del ricevente" nella preview HTML
7. Tap "Condividi PDF" → `RicevutaPdfDocument` include l'immagine della firma

---

## Database

### Migration: `acconti_commessa`
```sql
ALTER TABLE acconti_commessa ADD COLUMN firma_immagine TEXT;
```
Stringa base64 PNG (`data:image/png;base64,...`). Nullable — assente = non ancora firmata.

### Migration: `impostazioni`
```sql
ALTER TABLE impostazioni ADD COLUMN firma_default TEXT;
```
Firma predefinita riusabile per tutte le ricevute. Nullable.

---

## Componenti nuovi

### `components/ui/SignaturePad.tsx`
Canvas per disegnare la firma. Supporta touch (mobile) e mouse (desktop).

```typescript
interface SignaturePadProps {
  onChange: (base64: string | null) => void
  className?: string
}
```

- Canvas bianco con bordo tratteggiato
- Gestisce `touchstart`, `touchmove`, `touchend` e relativi mouse events
- `onChange` emette il data URL PNG quando l'utente smette di disegnare, `null` dopo cancella
- Pulsante "Cancella" interno che resetta il canvas

### `components/commesse/DrawerFirmaRicevuta.tsx`
Sheet (shadcn Sheet) con:
- Anteprima firma default (se `firmaDefault` prop è valorizzata) + pulsante "Usa questa"
- `SignaturePad` per nuova firma
- Pulsanti Cancella / Salva e applica
- Stato loading durante salvataggio

```typescript
interface DrawerFirmaRicevutaProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  accontoId: string
  firmaDefault: string | null        // da impostazioni.firma_default
  onFirmaSalvata: (base64: string) => void
}
```

---

## Server actions (`actions/commesse.ts`)

### `salvaFirmaAcconto(accontoId: string, firmaBase64: string): Promise<void>`
- Valida che `firmaBase64` inizi con `data:image/png;base64,`
- Update su `acconti_commessa` via server client
- `revalidatePath('/commesse', 'layout')`

---

## Server actions (`actions/impostazioni.ts`)

### `salvaFirmaDefault(firmaBase64: string): Promise<void>`
- Salva in `impostazioni.firma_default` per l'org corrente
- `revalidateTag(\`settings-${orgId}\`, {})`

---

## Aggiornamenti componenti esistenti

### `components/commesse/RicevutaAcconto.tsx`
- Riceve `firmaDefault: string | null` come prop aggiuntiva dalla page
- Stato locale `firmaCorrente: string | null` inizializzato da `acconto.firma_immagine`
- Toolbar: pulsante "✍️ Firma" (grigio se già firmata: "✅ Firmata" badge + "Modifica")
- Sezione "Firma del ricevente": se `firmaCorrente` è valorizzata, mostra `<img>` con la firma; altrimenti riga vuota come adesso
- `handleShare()` passa `firmaCorrente` al `RicevutaPdfDocument`

### `components/commesse/RicevutaPdfDocument.tsx`
- Nuova prop `firmaImmagine?: string | null`
- Nella sezione firma: se presente, `<Image src={firmaImmagine} style={{ height: 36, width: 140 }} />`; altrimenti riga vuota

### `app/(print)/commesse/[id]/ricevuta/[accontoId]/page.tsx`
- Carica `settings.firma_default`
- Passa `firmaDefault` a `RicevutaAcconto`

### `types/commessa.ts`
- `AccontoCommessa`: aggiungere `firma_immagine: string | null`

### `types/impostazioni.ts`
- `Settings`: aggiungere `firma_default: string | null`

---

## Impostazioni — sezione "Firma predefinita"

Nella pagina `/impostazioni`, nuova sezione sotto le info aziendali:
- Titolo: "Firma predefinita ricevute"
- Se `firma_default` presente: mostra anteprima + pulsante "Cambia"
- Se assente: `SignaturePad` per disegnare + pulsante "Salva firma"
- Pulsante "Elimina" se già presente

---

## Vincoli tecnici

- La firma viene salvata come base64 direttamente nel DB (non in Storage) per semplicità — le dimensioni tipiche sono 5–15 KB, accettabili per Postgres TEXT
- Il canvas usa `willReadFrequently: true` per ottimizzare `getImageData` su mobile
- La firma deve avere sfondo bianco esplicito nel PNG (il canvas è trasparente di default) affinché sia visibile nel PDF
- `@react-pdf/renderer` accetta `data:image/png;base64,...` direttamente come `src` di `<Image>`
- Il drawer usa shadcn `Sheet` con `side="bottom"` per comportamento nativo su mobile

---

## Fuori scope

- Firma del cliente sul preventivo (rimandato)
- Validità legale EU-SES (la firma canvas è "di fatto", non firma digitale qualificata)
- Upload immagine firma da file (solo canvas)
