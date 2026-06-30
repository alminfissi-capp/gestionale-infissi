# Copia voce articolo in altro preventivo — Design

Data: 2026-06-30

## Obiettivo
Dalla vista dettaglio di un preventivo (sola lettura, non in modifica), copiare una
singola voce articolo dentro un altro preventivo già esistente, mantenendo tutte le
caratteristiche (foto, dimensioni, finitura, prezzo, sconti, omaggio, accessori,
configurazioni, IVA, costi di acquisto e posa, note). L'articolo sorgente resta intatto
(duplicazione, non spostamento).

## UI — vista dettaglio (`components/preventivi/DettaglioPreventivo.tsx`)
- Nuova colonna azioni a destra della tabella articoli.
- Per ogni riga, un pulsante icona **"Copia in"** (icona `Copy`) che apre il dialog,
  passando l'`id` dell'articolo.

## Dialog `components/preventivi/DialogCopiaArticolo.tsx` (nuovo, client)
- Campo **ricerca** in cima: filtra per numero preventivo o nome cliente.
- Lista dei preventivi **più recenti** (ordine data discendente), esclude il preventivo
  corrente. Ogni voce mostra: numero, cliente, data, totale.
- Preventivi con `firma_stato` = `in_attesa` o `firmato` → riga **disabilitata** (grigia,
  non cliccabile) con etichetta "firmato": non si altera un documento firmato.
- Clic su preventivo valido → chiama l'azione in `useTransition`, toast di conferma
  ("Voce copiata nel preventivo N°…"), chiude il dialog, `router.refresh()`.

## Server action `copiaArticoloInPreventivo(articoloId, targetPreventivoId)`
In `actions/preventivi.ts`:
1. `createClient()` + `getOrgId()`.
2. Legge la riga articolo sorgente (`select('*')`, filtrata per `organization_id`).
3. Verifica il target: esiste, stessa org, e `firma_stato` non è `in_attesa`/`firmato`
   (guardia server-side oltre al blocco UI). Altrimenti `throw`.
4. Calcola `ordine = max(ordine) + 1` fra gli articoli del target.
5. Inserisce una **nuova riga** in `articoli_preventivo` copiando tutti i campi della
   sorgente tranne `id`, `created_at`, `preventivo_id`, `ordine`; imposta
   `preventivo_id = target`, `organization_id`, nuovo `ordine`. Config nullable
   normalizzate (`config_scorrevole`/`config_su_misura`/`config_winconfig` → `?? null`).
6. Chiama `ricalcolaTotaliPreventivo` sul target.
7. `revalidatePath('/preventivi')` e `revalidatePath('/preventivi/${target}')`.

## Helper `ricalcolaTotaliPreventivo(supabase, orgId, preventivoId)`
Nuovo helper dedicato alla copia (NON rifattorizza `updatePreventivo`, che invece
ri-deriva i costi dal listino in fase di modifica — comportamento da preservare):
- Legge `sconto_globale` / `sconto_importo_fisso` dal preventivo e tutte le righe articolo.
- Riusa gli helper esistenti: `calcolaTotalePezzi`, `calcolaSubtotale`,
  `calcolaSpeseTrasportoInput`, `calcolaQuoteTrasportoPerArticolo`, `calcolaRiepilogoIva`,
  `calcolaTotalePreventivo` (con `getRegoleTrasporto` / `getRegoleTrasportoLiberi` sui
  listino_id presenti).
- `totale_costi_acquisto` = somma di `costo_acquisto_unitario × quantita` delle righe
  **già memorizzate** (preserva i costi copiati, non li ri-deriva).
- Aggiorna la riga `preventivi` con: subtotale, importo_sconto, totale_articoli,
  spese_trasporto, totale_costi_acquisto, iva_totale, riepilogo_iva, totale_finale,
  totale_pezzi.

## Lista preventivi destinazione
Nuova action leggera `getPreventiviPerCopia()` che seleziona i campi minimi (id, numero,
cliente_snapshot, totale_finale, created_at, stato, firma_stato) ordinati per data,
senza l'update "marca scaduti" di `getPreventivi` (evita side-effect all'apertura dialog).

## Note
- Costi e sconti della sorgente preservati; lo sconto globale del target si applica sopra
  nel ricalcolo.
- Nessuna modifica a commesse/statistiche né al DB schema (nessuna migrazione).
- La modalità trasporto del target resta invariata.
