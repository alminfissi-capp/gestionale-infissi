# Grafici e statistiche Commesse — Design

Data: 2026-06-26
Stato: approvato dall'utente, pronto per il piano di implementazione

## Obiettivo

Aggiungere alla sezione Commesse una pagina dedicata con grafici e statistiche che permetta di vedere a colpo d'occhio:
1. L'andamento delle commesse mese per mese (quante entrano e per quale valore).
2. Gli incassi effettuati mese per mese.
3. Un resoconto per cliente, diviso per anno, con il saldo ancora da riscuotere.

## Accesso e collocazione

- Pulsante **"Grafici e statistiche"** (icona grafico a barre, es. `BarChart3` di lucide-react) nell'intestazione della pagina `/commesse`, accanto al titolo "Commesse / Scadenze".
- Porta a una **nuova pagina** `/commesse/statistiche` con pulsante "← Indietro" verso i blocchi.
- In cima alla pagina un **selettore Anno** (dropdown con gli anni ricavati dai dati esistenti: data_conferma delle commesse e data_pagamento degli acconti). Tutti i grafici reagiscono all'anno scelto (eccetto la vista C, vedi sotto).

## Ambito dati

- Aggrega **tutte le commesse di tutti i blocchi** dell'organizzazione (nessun filtro per blocco).
- Filtro temporale tramite selettore anno per le viste A e B.

## Le tre viste

### A) Andamento commesse per mese
- 12 mesi (gen–dic) dell'anno selezionato.
- Grafico combinato (recharts `ComposedChart`):
  - **Barre** = valore € totale delle commesse entrate nel mese (raggruppate per `commesse.data_conferma`).
  - **Linea** = numero di commesse entrate nel mese.
- Riga riepilogo sotto il grafico: totale commesse dell'anno (numero) + valore complessivo €.

### B) Incassi per mese
- 12 mesi (gen–dic) dell'anno selezionato.
- Grafico a barre: somma degli **acconti** incassati nel mese (raggruppati per `acconti_commessa.data_pagamento`, campo `importo`).
- Riga riepilogo: totale incassato nell'anno.
- Nota: gli incassi seguono la data del pagamento, quindi un acconto può cadere in un mese diverso dalla conferma della relativa commessa — comportamento corretto per il cashflow.

### C) Ricerca per cliente
- Campo di ricerca cliente (per `commesse.cliente_nome`).
- Selezionato un cliente, mostra una **tabella resoconto per anno**: per ogni anno → numero commesse, totale fatturato €, totale incassato €, **saldo residuo €** (verde se 0, arancione se > 0).
- Riga finale "Totale complessivo" su tutti gli anni.
- Questa vista **ignora il selettore anno** in alto: mostra tutti gli anni del cliente.

## Dati e architettura

- **Pagina** `app/(dashboard)/commesse/statistiche/page.tsx` (Server Component):
  - Query su `commesse` (campi: `id, cliente_nome, totale, data_conferma`) filtrata per `organization_id`.
  - Query su `acconti_commessa` (campi: `commessa_id, importo, data_pagamento`) filtrata per `organization_id`.
  - Aggregazione mese/anno in JS. Calcolo della lista anni disponibili.
  - Passa i dati a un Client Component.
- **Client** `components/commesse/StatisticheCommesse.tsx`:
  - Stato `annoSelezionato` + testo ricerca cliente.
  - Rendering grafici con recharts (già installato, `^3.8.0`).
  - Riuso di `formatEuro` da `lib/pricing.ts`.
- **Pulsante** nell'header → modifica a `app/(dashboard)/commesse/page.tsx`.

## Casi limite

- Nessuna commessa / anno senza dati → grafici vuoti con messaggio "Nessun dato".
- Commesse senza `data_conferma` → escluse dai conteggi mensili (omesse di default).
- Ricerca cliente senza risultati → "Nessun cliente trovato".
- Mesi senza dati → mostrati comunque a 0 (asse completo gen–dic).

## Fuori scope (YAGNI)

- Distribuzione per operatore/reparto/stato (non richiesto in questa iterazione).
- Export PDF/Excel dei grafici.
- Filtri per blocco singolo.
