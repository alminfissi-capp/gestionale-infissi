# Rilievo FP PRO — costi per colore, minuti, miniature profili, schermata unica della voce

Data: 2026-10-18 · Stato: approvato in chat, da rivedere per iscritto

## Obiettivo

Rendere il rilievo FP PRO usabile in ufficio come FP PRO: una sola schermata per la
voce (non 8 passi), prezzi giusti, manodopera in minuti. Il dispositivo di
riferimento è **PC/tablet in orizzontale**; il telefono resta utilizzabile (pannelli
impilati) ma non è curato nel dettaglio. Il lavoro senza rete del cantiere non cambia.

Detto dall'utente:
- campi piccoli e liberi per le **note del telaio**, attaccati ai 4 lati del disegno;
- scelta del telaio per lato e del profilo anta da elenchi FP PRO con **codice,
  descrizione e miniatura del DXF**;
- elenchi di colori e vetri, poi gli accessori da spuntare;
- in cima larghezza, altezza, quantità e un campo libero per riconoscere il
  serramento in cantiere;
- prezzi **non** nella schermata della voce: restano in "Calcolo e preventivo";
- **i menu a tendina si chiudono dopo la scelta** mostrando il prodotto scelto.

## Ordine di lavoro

1. Costi per colore degli accessori (errore di calcolo).
2. Minuti al posto delle ore.
3. Miniature dei profili (ponte).
4. Schermata unica della voce.

Ogni parte si pubblica da sola.

## 1. Costi mancanti

**Causa verificata (2026-10-18).** Gli avvisi "Accessorio X senza prezzo" nei calcoli
salvati (ACP 8020M, ACP 8009, ACP 50552, ACP 50400, ACP 99124, ACP 6609,
A9133NEOPA.3, 00259376U) riguardano accessori con `fp_accessori.prezzo = 0` e prezzi
per trattamento in `fp_accessori_costi` (`colore_fp_id`, `prezzo`, `unita_vendita`,
`codice_trattato` = codice + suffisso colore, es. `ACP 8020M-9010`). Il calcolo
(`actions/calcolo-fp.ts` → `listinoDaRighe`) legge solo `fp_accessori`.

**Correzione.**
- `calcolaRilievoFp` carica anche `fp_accessori_costi` degli accessori in uso.
- Prezzo unitario dell'accessorio per la voce: riga di `fp_accessori_costi` del
  colore della voce — nell'ordine colore accessori, colore esterno, colore interno
  — `prezzo / unita_vendita`; se non c'è, `fp_accessori.prezzo / unita_vendita`
  come oggi. L'avviso "senza prezzo" resta solo se entrambi mancano.
- Il colore accessori è un campo nuovo della voce (`coloreAcc`, facoltativo); se
  vuoto vale l'esterno, poi l'interno.
- Da chiarire nel lavoro (non cambiano il disegno): "SCARICO ACQUA non trovato"
  (codice senza riga in `fp_accessori`) e "Profilo  non trovato" con codice vuoto
  sulla struttura `09B-UNI_PFIN1A_AG+SERR+DOGHE`.
- Funzione pura con test (Vitest) per la scelta del prezzo; verifica sui rilievi
  già calcolati: gli avvisi spariscono e il totale si confronta con FP PRO.

## 2. Minuti

- Nella pagina "Calcolo e preventivo" le correzioni per voce mostrano **minuti**
  (manodopera e posa in opera, come FP PRO) e la colonna "Ore" diventa "Minuti".
- Dentro il motore restano le ore (`OreVoce`): la conversione è solo
  all'ingresso/uscita della UI (`campiOre`/`oreDaSalvare` in
  `lib/fppro/calcolo/correzioni.ts`). Le correzioni già salvate non cambiano.
- Arrotondamento al minuto in visualizzazione; il valore scritto sostituisce, non
  si somma (regola esistente).

## 3. Miniature dei profili

- Il ponte (`ponte/`, gira sul PC) legge già `DXF\<serie>\<codice>.DXF` per
  vista/aletta. In più ricava il contorno della sezione (LINE/LWPOLYLINE/ARC/CIRCLE)
  e lo salva come path SVG normalizzato in una colonna nuova
  `fp_profili_sezioni.anteprima` (testo, pochi KB).
- Funzione pura `dxfInSvg` senza import (il ponte la esegue senza build), con test.
- Le miniature arrivano nel telefono/tablet col catalogo (Dexie), quindi anche
  senza rete. `VERSIONE_LETTURA` del ponte si alza per rileggere i DXF una volta.
- **FP PRO resta in sola lettura**: si leggono file e MySQL, non si scrive niente
  (vedi `feedback_fppro_mai_toccato`). Dopo la modifica si reinstalla il ponte
  (`ponte/installa.ps1`).

## 4. Schermata unica della voce

Sostituisce `WizardVoce` (8 passi). Stessi dati (`VoceFp` in Dexie, invio come oggi).

**Testata (sempre visibile):** Indietro · Rif. cantiere (testo libero, è l'attuale
`posizione`) · Larghezza · Altezza · Quantità · Salva.

**Centro:** il disegno (`DisegnoVoceSvg`) che si aggiorna a ogni modifica. Attaccati
ai 4 lati, seguendo il bordo, 4 campi piccoli di testo libero: **note telaio**
sinistra/alto/destra/basso (campo nuovo `noteTelaio: Partial<Record<Lato,string>>`).
Sotto il disegno le quote di traversi/montanti se la struttura ne ha.

**Pannelli a destra (richiudibili, aperti di default su PC):**
1. Serie e struttura — scelta con immagini (riusa `SceltaTipologia`). Cambiare
   struttura conserva misure, riferimento e note.
2. Telai — 4 scelte (sx, alto, dx, basso) tra i profili della serie con utilizzo
   telaio (8050); ogni riga: miniatura, codice, descrizione.
3. Ante — profilo anta tra quelli della serie con utilizzo anta (8090/8100), con
   miniatura. Campo nuovo nella voce; il calcolo lo usa come già fa per i telai.
4. Colori — interno, esterno, accessori.
5. Vetri — uno per campo, con "uguale per tutti".
6. Accessori — kit opzionali da spuntare.
7. Apertura (mano) e Note.

**Menu a tendina.** Ogni scelta è un campo chiuso che mostra il valore scelto
(miniatura + codice + descrizione per i profili). Si apre, si cerca, si sceglie:
**si chiude subito** e mostra la scelta. Componente unico (`SceltaFp`) che
sostituisce `ListaConRicerca` sempre aperta. Preferiti in cima come oggi.

**Telefono:** stessa schermata in colonna (testata, disegno con note, pannelli
chiusi). Nessuna cura particolare oltre al funzionamento.

**Invarianti da conservare (fase 3):** niente navigazioni Next nella pagina del
cantiere; salvataggio locale solo se qualcosa è cambiato; al telefono va
`alberoLeggero`; struttura sparita dal catalogo = si modificano solo riferimento,
quantità e note.

**Dove finiscono i campi nuovi:** `noteTelaio` e il profilo anta vanno nel
preventivo (descrizione della riga / `config_fppro`); `coloreAcc` nel calcolo.

## Test

- Vitest: prezzo accessorio per colore; conversione minuti↔ore; `dxfInSvg` su DXF
  reali di FP PRO; scelta profili per utilizzo e serie.
- Verifica su dati reali: ricalcolo dei rilievi esistenti senza avvisi di prezzo.
- La schermata si prova a mano su PC (e un controllo sul telefono).

## Fuori da questo lavoro

Prezzi nella schermata della voce (scelto: no). Autofatture FiC. Export JIB.
