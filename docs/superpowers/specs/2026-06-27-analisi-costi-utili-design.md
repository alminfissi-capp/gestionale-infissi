# Analisi costi/utili stimati dai preventivi — Design

Data: 2026-06-27
Stato: approvato dall'utente, pronto per il piano di implementazione

## Obiettivo

Aggiungere alla pagina `/commesse/statistiche` (sezione "Grafici e statistiche") un'analisi
dei costi e degli utili **stimati** ricavati dai preventivi **interni** collegati alle
commesse. Mostra, per il blocco/anno selezionato, l'andamento mensile di materiali,
manodopera/posa e utile. I preventivi esterni (caricati a mano, solo file) sono ignorati.

## Collocazione

- Nuova Card **dentro** la pagina `/commesse/statistiche`, sotto i grafici esistenti.
  Nessuna pagina o pulsante di navigazione aggiuntivo.
- Reagisce allo **stesso selettore anno (= blocco)** già presente in pagina.
- In cima alla Card un selettore con 3 viste del grafico (toggle, default "Impilato"):
  1. **Impilato** — barre impilate materiali + posa + utile (altezza totale = ricavo).
  2. **Costi + utile** — barre per i costi (materiali + posa), linea per l'utile.
  3. **Solo utile** — barre col solo utile.

## Quali preventivi

- Per ogni **commessa del blocco selezionato** (stessa logica per-blocco dell'andamento),
  si considerano i preventivi **interni** collegati:
  - `commesse.preventivo_id` (link diretto), e
  - `preventivi_commessa.preventivo_id` (junction) **non null**.
- I collegamenti esterni (`preventivi_commessa` con `preventivo_id` null, solo
  `storage_path`/`nome_file`) sono **ignorati**.
- Se una commessa ha più preventivi interni, i loro valori si **sommano**.

## Formula (coerente col "Report interno" di DettaglioPreventivo)

Per ogni articolo del preventivo, costi via `getCosti(a)`:
- `su_misura` + config: `acq = config_su_misura.totale_prodotto + totale_accessori`, `posa = config_su_misura.mano_dopera`
- `scorrevole` + config: `acq = config_scorrevole.dettaglio.totale_riga`, `posa = config_scorrevole.posa ?? costo_posa`
- `winconfig` + config: `acq = config_winconfig.costo_totale`, `posa = costo_posa`
- default: `acq = costo_acquisto_unitario`, `posa = costo_posa`

Aggregazione per preventivo:
- `materiali = Σ acq × quantita`
- `posa = Σ posa × quantita`
- `utile = totale_articoli − (materiali + posa + spese_trasporto)`

## Attribuzione temporale

- Ogni commessa è attribuita al **mese della sua `data_conferma`** (coerente con l'andamento
  commesse) e all'**anno = blocco** selezionato.
- Asse completo gen–dic (12 mesi). Mesi senza dati a 0.

## Cosa mostra

- Il grafico nella vista scelta, 12 mesi.
- Riga riepilogo anno: totale **materiali**, totale **posa**, totale **utile**,
  **% margine** = utile / (materiali + posa + trasporto) × 100 (null se costi = 0).
- Contatore: "N commesse del blocco senza preventivo interno — escluse dalla stima".

## Architettura

- `lib/preventivo-costi.ts` (nuovo) — funzione pura riusabile:
  - `costiArticolo(a): { acq: number; posa: number }` (logica `getCosti`).
  - `calcolaCostiPreventivo(articoli, totaleArticoli, speseTrasporto): { materiali: number; posa: number; utile: number }`.
  - Rifattorizzazione di `components/preventivi/DettaglioPreventivo.tsx` per usare queste
    funzioni al posto della logica inline (DRY — un'unica fonte della formula).
- `app/(dashboard)/commesse/statistiche/page.tsx` — query aggiuntive:
  - link commesse → preventivi interni (preventivo_id diretto + junction non null),
  - articoli dei preventivi interni (con campi costo + config su_misura/scorrevole/winconfig),
  - calcolo per preventivo → attribuzione alla commessa → al mese (data_conferma) del blocco.
  - Passa al client: per ogni (blocco, mese) → `{ materiali, posa, utile }`, più il conteggio
    commesse-senza-preventivo-interno per blocco.
- `components/commesse/StatisticheCommesse.tsx` — nuova Card con selettore vista (stato locale)
  + 3 grafici recharts (ComposedChart/BarChart con stacking) + riepilogo + contatore.
- `lib/statistiche-commesse.ts` — eventuali tipi/aggregatori puri per i punti mensili
  costi/utile (`PuntoCostiUtili`, `aggregaCostiUtiliMese`).

## Casi limite

- Blocco senza preventivi interni → grafico vuoto con "Nessun dato".
- Preventivo con costi tutti a 0 → utile = ricavo; incluso comunque.
- Commessa con solo preventivi esterni → esclusa, conteggiata nel contatore.
- `data_conferma` non valida → commessa esclusa dai bucket mensili (caso teorico).

## Fuori scope (YAGNI)

- Costi/utili consuntivi (reali a fine commessa): qui è solo **stima** da preventivo.
- Export, drill-down per singola commessa, confronto tra anni.
