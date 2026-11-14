# Kit e accessori come FP PRO — progetto

Data: 2026-11-14. Origine: caso Vazzana (rilievo b7057b6e…, commessa FP PRO 192-26G).

## Perché

In cantiere si fa il preventivo dal telefono con il rilievo FP di WinStudio. Il prezzo deve essere **uguale** a quello che FP PRO darebbe per lo stesso serramento. Qualche euro di scarto per serramento è accettabile; **oltre 50 € per serramento (in più o in meno) è un errore**.

Oggi non è così. Sul caso Vazzana, WinStudio è circa 1.580 € sopra FP PRO su 6.294 € di imponibile. Le cause verificate:

1. **Cerniere contate quattro volte.** Il kit "PLANET 1AR-SCOMPARSA" ha le righe 5151/D, 5151/S, 5163/D e 5163/S. FP PRO ne prende una sola: sceglie il lato con `apertura` (1 = destra, 2 = sinistra) e la portata con la seconda condizione (`dimrif2 = 201`, peso anta 1–100 kg per la 5151, 100,1–150 kg per la 5163). WinStudio non legge né l'una né l'altra, quindi le prende tutte e quattro: 287 € invece di circa 49 €.
2. **Variante cerniere sbagliata.** La scorciatoia "Cerniere: a vista / a scomparsa" (`varianteFamiglia`) ha scelto "1AR-SCOMPARSA-RISTRUTT". In FP PRO l'utente aveva scelto "1AR-SCOMPARSA-DS".
3. **Colore accessori mancante.** Senza colore WinStudio usa il prezzo più alto: ACP 50252 a 32 € invece di 8,85 € con AV.

Il punto 1 non riguarda solo le cerniere. Nel catalogo (`fp_kit_righe`, 34.819 righe):
- 24.924 righe hanno una seconda condizione;
- 5.275 righe hanno una terza condizione;
- 1.858 righe dipendono dalla mano;
- 8.773 righe valgono solo per un valore di parametro;
- i codici di misura usati sono più di 30.

Il motore (`lib/fppro/calcolo/accessori.ts` → `misura()`) conosce solo 1, 2, 3, 4 e 5 e tratta ogni altro codice come altezza. Per esempio 401 compare su 15.296 righe e 402 su 9.381.

## Obiettivi

1. **Calcolo uguale a FP PRO** per qualunque struttura: finestre, porte, scorrevoli, vasistas, persiane e tutte le altre tipologie. Vale per tutte le regole che FP PRO applica alle righe dei kit e agli accessori della struttura.
2. **Configurazione a prova di errore.** Nella voce l'utente non può mai scegliere due cose con la stessa funzione (due cerniere, due maniglie, due telai, due regolatori…). Ogni domanda ha una sola risposta, oppure "nessuno" dove FP PRO lo permette.
3. **Chiara e veloce in cantiere.** Le domande usano nomi brevi ("Kit Exens", "Kit Cremonese", "Kit Martellina"), non i codici di FP PRO.
4. **Prova continua.** Un banco di prova confronta WinStudio con FP PRO su tutte le commesse già calcolate. Serve per verificare ogni regola e per accorgersi subito di una regressione o di regole nuove aggiunte in FP PRO.

## Non obiettivi

- Non si cambia la formula del prezzo (costo puro → spese generali → utile → provvigione → spese varie): è già verificata.
- Non si cambiano profili e barre, se non per quanto serve a dare a ogni regola la misura giusta (larghezza, altezza, peso di ogni anta).
- Non si scrive niente in FP PRO, né nel MySQL né nelle cartelle: solo lettura (vedi la memoria "FP PRO mai toccato" e `ponte/src/mysql-sola-lettura.ts`).

## Anti-obiettivi (fallimento anche se "funziona")

- Un serramento che esce più di 50 € sopra o sotto FP PRO.
- Una voce che permette due kit o due accessori alternativi accesi insieme.
- Il sistema che "indovina" una variante diversa da quella che FP PRO sceglierebbe (il caso RISTRUTT).
- Destro e sinistro presi insieme.
- Una domanda tecnica che chi è in cantiere non capisce.

## Cosa è stato deciso con l'utente

1. **Le domande sono i gruppi di FP PRO.** Nella finestra "Kit opzionali" FP PRO mostra gruppi a selezione singola: per esempio "1A – Scelta telaio", "1B – Scelta cerniera 1 A/R", "2A – Scelta maniglia per ribalta". Gli accessori opzionali sono raggruppati allo stesso modo ("Regolatori", "Angolo vulcanizzato": nessuno o uno). WinStudio fa le stesse domande, nello stesso ordine, con le stesse regole di scelta. Vale anche per cricchetti, tavellini, motorini, accessori delle altre aperture e persiane.
2. **Nomi brevi.** Il sistema ricava da solo un nome breve dalla descrizione FP PRO (per esempio "Kit Exens anta ribalta" → "Kit Exens"). Una pagina di WinStudio permette di correggerlo una volta sola, e la correzione vale ovunque.
3. **Lato delle cerniere.** Lo decide il sistema:
   - se la voce ha la mano, prende quella;
   - senza mano, prende un solo kit, il destro come predefinito;
   - mai destro e sinistro insieme.
4. **Portata e misure.** Le decide il sistema dalle regole, come FP PRO: braccio corto o lungo, kit fino a 100 o fino a 150 kg, forbici per gruppo di larghezza, aste per altezza, carrelli per peso.
5. **Tolta la scorciatoia** "Cerniere: a vista / a scomparsa" che sceglieva da sola la variante. Si sceglie direttamente fra le voci del gruppo, con i nomi brevi.
6. **Soglia di accettazione.** Pochi euro di differenza per serramento vanno bene; oltre 50 € no.

## Come funziona (parti decise da Claude, da verificare sul banco di prova)

### 1. Regole complete delle righe dei kit e degli accessori

Ogni riga (dal file della struttura `FP_FITTING` o dal catalogo `fp_kit_righe.dati`) vale solo se sono vere **tutte** le sue condizioni.

- **Mano** (`apertura` / `Apertura`): 0 = sempre, 1 = destra, 2 = sinistra. La mano viene dalla voce; senza mano vale destra.
- **Prima condizione:** `dim_rif` con `lim_inf_range`…`lim_sup_range` (nello STR: `RefDim`, `RMin`, `RMax`).
- **Seconda condizione:** `dimrif2` con `liminfrange2`…`limsuprange2`. Nello STR è `RefDim2` con `RMin2x100`/`RMax2x100`, cioè valori ×100 da dividere per 100.
- **Terza condizione:** `dim_rif3` con `lim_inf_range3`…`lim_sup_range3`. Sono state viste anche `dimrif4` (6 righe) e i campi 5–8, oggi vuoti: vanno letti comunque, così se FP PRO li usa domani il calcolo non sbaglia in silenzio.
- **Parametro** (`parametrica = 1`, `codice_param`, `valore_param`): la riga vale solo se il parametro del kit (`kit_parametri`, `kit_parametri_valori` con `is_default`) ha quel valore. Il parametro diventa una domanda della voce, con il predefinito di FP PRO.
- **Quantità:** `num_base`, passo (`step` + `dimrifdist`/`formuladist`), massimo (`num_max`), metri (`tipo` 2/4 con `dim_calc` e `formulal`), correzione `corr_ml`.
- **Condizione combinata** `condparam`: 48 righe, da capire sul banco di prova.
- **Serie** della riga (`serieprofflg`, `fp_kit_righe_serie`): resta com'è oggi.

**Codici di misura.** Dalle etichette di FP PRO (`C:\FP_PRO\FP_PRO.MSG`, `FP_GUI.MSG`) l'ipotesi è:

| Codici | Misura |
|---|---|
| 1, 2, 3, 4, 5 | come oggi (H, L, perimetro, 2H + L, formula) |
| 101 / 102 / 103 | larghezza anta 1 / 2 / 3, lato maniglia |
| 201 / 202 | peso anta 1 / 2 (kg) |
| 301 / 302 / 303 | altezza anta lato cerniera |
| 401 / 402 / 403 | larghezza anta compreso riporto |
| 21–26 | larghezza / peso / altezza dell'anta scorrevole e binari |
| 9 | altezza maniglia |
| 200 | peso vano |
| 6, 901–904 | da ricavare |

**Questa tabella è un'ipotesi.** Ogni codice va confermato sul banco di prova prima di essere usato. Un codice che il motore non conosce **non** deve mai diventare "altezza": la voce mostra un avviso chiaro ("regola FP PRO non gestita: codice X sull'accessorio Y") e il banco di prova lo conta.

**Peso dell'anta.** Il peso di ogni anta (profili + vetro o pannello della zona dell'anta) serve ai codici 2xx e 23. Va calcolato come FP PRO: confrontare con `PESO_ANTA_MANIGLIA` e lo `StyleWeight*` del jobrecord.

### 2. Banco di prova su tutte le commesse di FP PRO

Uno strumento del ponte, in sola lettura come `ponte/strumenti/estrai-commessa.ts`, lavora così:

1. Prende ogni commessa con prezzi nel MySQL (oggi 198; 190 hanno la cartella JOB; in tutto 1.074 serramenti).
2. Per ogni voce legge dal jobrecord la struttura, le misure, le scelte confermate, i colori e i tempi. Calcola la voce col motore di WinStudio, usando i prezzi salvati in quella commessa (`preventivoprezzi*`), così i cambi di listino non sporcano il confronto.
3. Confronta la lista accessori (codice + quantità) e i costi per gruppo (profili, accessori, vetri, pannelli, lavoro) con quello che FP PRO ha salvato. Poi confronta il totale della voce.
4. Produce un riepilogo: voci entro pochi euro, voci tra pochi euro e 50 €, voci oltre 50 €, con il motivo per codice di regola e per accessorio.

Le commesse servono come dati e restano sul PC: niente fixture con dati di clienti nel repository. Le fixture esistenti 170-26G e 172-26G restano.

**Criterio di fine lavoro:**
- **nessuna** voce del banco di prova oltre 50 € per serramento;
- la grande maggioranza entro pochi euro;
- le voci che restano fuori hanno un motivo scritto e accettato dall'utente (per esempio squadrette di giunzione già note, struttura vecchia).

Il caso 192-26G va confrontato appena l'utente salva il preventivo in FP PRO.

### 3. Configurazione della voce: una scelta per funzione

**Domande.**
- Ogni nodo della struttura propone i suoi gruppi di kit (`fp_kit.dati.raggruppamentoid` → `fp_kit_gruppi`, cioè MySQL `gruppiopzkit`, con `grptype`). Una domanda per gruppo, a selezione singola, o "nessuno" se il gruppo lo permette.
- Stesso schema per gli accessori opzionali dentro i kit (`gruppoid`) e per i parametri del kit.
- Un kit opzionale senza gruppo diventa una casella sì/no, ma solo se non ha la stessa funzione di un'altra domanda. Oggi `opzioni-voce.ts` ricava le famiglie dal nome: va mantenuto solo come rete di sicurezza, e il banco di prova deve dire quanti kit restano senza gruppo.
- Le domande della voce seguono l'ordine dei gruppi di FP PRO (1A, 1B, 2A…).

**Risposte.** Nome breve, con il nome completo FP PRO disponibile toccando (per chi vuole controllare).

**Nomi brevi.**
- Tabella per organizzazione: chiave = nome kit / codice accessorio / valore parametro.
- Il nome automatico si ricava dalla descrizione FP PRO togliendo serie e parole ripetute del gruppo.
- La pagina di correzione è in Catalogo FP PRO.
- Al telefono i nomi arrivano col catalogo (Dexie), quindi funzionano anche offline.

**Lato e portata.** Non sono domande. Un gruppo che in FP PRO contiene solo varianti destra/sinistra dello stesso kit (es. "…-DX" / "…-SX") diventa una sola risposta: il lato lo dà la mano della voce.

**Impossibile scegliere due cose uguali.**
- L'interfaccia non lo permette: risposta unica.
- Il salvataggio lo rifiuta: un controllo nel dato della voce.
- Il calcolo lo segnala come errore bloccante, non come avviso, se arriva comunque una voce con due alternative accese (voci salvate prima di questa modifica, o dati arrivati dal telefono).

### 4. Voci già salvate

Le voci salvate prima con due alternative accese (come Vazzana voci 2–3, o PF2A con SORMONTO + SCOMPARSA) **non** vengono corrette d'ufficio: scelta già presa il 2026-10-25 e da mantenere. Aprendo la voce, la domanda doppia è evidenziata e chiede la scelta; finché non si sceglie, il calcolo di quel rilievo non si trasferisce nel preventivo. Il trasferimento rifiuta già un calcolo superato: qui si aggiunge "voce con scelte doppie".

### 5. Telefono e offline

- I nuovi campi delle regole arrivano al telefono dentro `alberoLeggero` e nelle righe del catalogo kit.
- Le nuove tabelle (nomi brevi, parametri dei kit) vanno in Dexie con una nuova versione che **non** svuota gli elenchi offline (regola già in uso: azzerare solo i cursori).
- Il ponte deve copiare `kit_parametri` e `kit_parametri_valori` (oggi non sincronizzate).
- Se cambia la lettura delle .STR va alzato `VERSIONE_LETTURA` e lanciato `ponte/installa.ps1`.

## Vincoli

- FP PRO solo in lettura: ogni accesso MySQL passa da `apriDbSolaLettura`.
- Rispettare le invarianti già scritte in memoria per catalogo, rilievo cantiere, fase 4a e opzioni della voce (formula prezzo, barre sulla commessa, colori accessori come elenco, kit cercati senza maiuscole, `correzioni_fp` fuori da `fp`).
- Next.js 16, Supabase con RLS e `organization_id`, Vitest per il motore puro in `lib/fppro/calcolo/`.

## Lasciato a chi costruisce

- Il significato esatto dei codici 6, 9, 21–26, 200, 901–904 e di `condparam`, ricavato dal banco di prova.
- Come calcolare il peso dell'anta per arrivare allo stesso numero di FP PRO.
- Il formato del riepilogo del banco di prova (file nel ponte o pagina in WinStudio).
- Le regole per accorciare i nomi.

## Scelte di Claude da controllare

- Senza mano: **destra**. L'utente ha detto "un solo kit"; il lato destro è una scelta di Claude.
- Codice di misura sconosciuto = avviso e nessuna applicazione della riga, mai "altezza".
- Il banco di prova usa i prezzi salvati nella commessa, non quelli di oggi.
- Voci vecchie con scelte doppie: trasferimento bloccato finché non si sceglie.
- Pagina dei nomi brevi dentro Catalogo FP PRO.
- La vista "Avanzate" della voce (elenco completo dei kit) resta, ma rispetta le stesse regole: non permette due alternative accese.
- Le domande sui parametri del kit (colore copertura, cilindro, altezza maniglia…) stanno in una sezione chiusa "Altre opzioni" con il valore predefinito di FP PRO, perché nella prova l'utente non le ha toccate.
