# Articolo in Omaggio — Design

Data: 2026-06-29

## Obiettivo
Permettere di marcare un singolo articolo di un preventivo come **omaggio**: per il
cliente la riga vale €0 (prezzo pieno mostrato barrato + scritta "Omaggio"), ma i costi
di materiale e posa restano tracciati e fluiscono nella commessa, riducendone il margine.

## Modello dati
- Nuova colonna `omaggio boolean NOT NULL DEFAULT false` su `articoli_preventivo`.
- `ArticoloPreventivoRow` / `ArticoloWizard`: campo opzionale `omaggio?: boolean`
  (`undefined` = false, così i form esistenti non vanno modificati uno per uno).
- `costo_acquisto_unitario` e `costo_posa` **restano invariati** quando omaggio è attivo.
  Nessuna modifica alla logica della commessa/statistiche.

## Calcolo prezzi (`lib/pricing.ts`)
- `calcolaTotaleRiga(prezzoUnitario, quantita, sconto, omaggio = false)` → ritorna `0`
  se `omaggio === true`.
- Conseguenza automatica: subtotale, totale finale e riepilogo IVA (basati su
  `prezzo_totale_riga`) escludono la riga omaggio. `prezzo_unitario` resta pieno per
  poterlo mostrare barrato.

## UI compilazione (`TabellaArticoli.tsx`)
- Pulsante toggle **"Omaggio"** (icona Gift) accanto al `ScontoSelect`.
- Attivo → `ScontoSelect` disabilitato, `prezzo_totale_riga = 0`, badge visibile.
- Le funzioni `updateQuantita` / `updatePrezzoUnitario` / `updateSconto` rispettano il
  flag omaggio nel ricalcolo.

## Vista cliente — prezzo barrato + "Omaggio"
Tre punti, comportamento identico:
- `components/preventivi/StampaPreventivo.tsx` (pagina pubblica `/p/[token]` + stampa A4)
- `lib/pdf/preventivoPdf.tsx` (PDF scaricabile)

Per una riga omaggio:
- Colonna **P. Unit.**: prezzo pieno barrato + scritta verde "Omaggio".
- Colonna **P. Totale**: "Omaggio" al posto di € 0,00.
- Mostrato **sempre**, indipendentemente dal flag `mostra_sconto_riga`.

## Vista admin (`DettaglioPreventivo.tsx`)
- Riga marcata "Omaggio" nella colonna sconto/totale; i costi interni restano visibili
  nel report margini così l'admin sa quanto sta regalando.

## Persistenza (`actions/preventivi.ts`)
- L'insert degli articoli usa spread `...articoloDb`, quindi `omaggio` viene persistito
  automaticamente una volta presente nel tipo e nella colonna DB. Nessuna modifica
  strutturale all'action.

## Fuori scope
- Logica commessa/statistiche (i costi già confluiscono dagli articoli).
- Sconto globale e trasporto restano invariati.
