# Esportazione PDF Elenco Clienti

**Data:** 2026-05-30
**Stato:** Approvato

## Obiettivo

Aggiungere un pulsante "Esporta PDF" nella pagina Gestione Clienti che genera e scarica un PDF con l'elenco dei clienti correntemente visibili (filtrati o completi).

## Comportamento

- Se la ricerca è vuota → esporta tutti i clienti
- Se la ricerca è attiva → esporta solo i clienti filtrati, con indicazione "X di Y filtrati" nell'header del PDF
- Il file scaricato si chiama `clienti-YYYY-MM-DD.pdf`
- La generazione avviene interamente lato client (nessuna chiamata al server)

## Architettura

### File nuovi
- `components/clienti/ClientiPdfDocument.tsx` — componente React-PDF

### File modificati
- `components/clienti/TabellaClienti.tsx` — aggiunta prop `denominazione`, bottone PDFDownloadLink
- `app/(dashboard)/clienti/page.tsx` — chiama `getSettings()` e passa `denominazione` a TabellaClienti

## Componente ClientiPdfDocument

**Props:**
```ts
{
  clienti: Cliente[]        // lista filtrata da esportare
  denominazione: string     // nome azienda (da impostazioni)
  totaleClienti: number     // totale non filtrato (per il conteggio)
}
```

**Layout PDF (A4 verticale):**

```
Header
  - Sinistra: denominazione azienda (bold, 14pt)
  - Destra: data generazione (gg/mm/aaaa)
  - Seconda riga: "Elenco Clienti" (12pt, grigio)
  - Terza riga: "Tot. N clienti" oppure "N di M filtrati"

Tabella (6 colonne)
  - Intestazione: sfondo teal #0E8F9C, testo bianco, 9pt bold
  - Righe alternate: bianco / grigio chiaro #F9FAFB
  - Bordi: grigio #E5E7EB
  - Colonne: Nome/Rag.Soc. | Tipo | Telefono | Email | Indirizzo | CF/P.IVA

Footer (ogni pagina)
  - Destra: "Pagina X di Y"
```

**Larghezze colonne (su 540pt disponibili):**
- Nome: 130pt
- Tipo: 40pt
- Telefono: 75pt
- Email: 115pt
- Indirizzo: 110pt
- CF/P.IVA: 70pt

**Font:** Helvetica (built-in React-PDF, no embed needed)

## UI in TabellaClienti

- Bottone "Esporta PDF" posizionato a sinistra del bottone "Nuovo cliente"
- Variante: `outline`
- Icona: `FileDown` (lucide-react)
- Label: "Esporta PDF" (testo visibile sempre, non solo su desktop)
- Durante generazione PDF: testo "Generazione..." disabilitato
- Visibile a tutti (non richiede permesso di scrittura)

## Dati indirizzo

Compone la stringa indirizzo così: `via civico, cap città (provincia)` — omette i campi null/vuoti. Se tutti i campi indirizzo sono null usa `—`.

## Gestione nome cliente

- `tipo === 'azienda'` → `ragione_sociale`
- `tipo === 'privato'` → `nome cognome`
- Fallback: `—`
