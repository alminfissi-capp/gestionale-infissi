# Fase 3 — Rilievo in cantiere con le strutture di FP PRO

Documento di progetto, 2026-10-11. Approvato in chat. Dettaglia la Fase 3 di `2026-10-10-rilievo-preventivo-fppro-design.md` (§6, §12).

## 1. Obiettivo

In cantiere, dal telefono, anche **senza rete**, si rileva ogni serramento scegliendo **serie → tipologia** (struttura di FP PRO) e inserendo **misure esterno telaio, quote di traversi e montanti, finiture, vetri, opzioni dei kit, lato di apertura e telaio per lato**. Il disegno segue le misure. I dati si inviano da soli a WinStudio quando torna il campo.

**Riuscito quando:**
- un rilievo fatto in una cantina senza campo si ritrova in ufficio senza aver riscritto nulla;
- ogni voce punta a una struttura e a codici veri di FP PRO (colori, vetri, profili, kit), pronti per la fase 4 (costi) e la fase 5 (JIB);
- WinConfig e i rilievi di prova non esistono più.

## 2. Scelte fatte con l'utente (2026-10-11)

| Tema | Scelta |
|---|---|
| Rete | Funziona **anche senza rete** |
| Strutture sul telefono | **Tutte** (4.661, ~70 MB con immagini), poi solo le modifiche |
| Trovare la tipologia | **Cartelle come in FP PRO + preferite ⭐ e ultime usate**, ricerca per nome sempre disponibile |
| Divisioni | **Quota di traversi e montanti** (mm); vuota = proporzionale. Ante divise in parti uguali |
| Colori e vetri | **Liste brevi** (Impostazioni) per prime + **ricerca** in tutti quelli di FP PRO |
| Kit a scelta | **In cantiere, già proposti** come nella struttura; si cambiano con un tocco |
| Alette | **Profilo di telaio per lato**, scelto tra i telai della stessa serie (default: quello della struttura) |

## 3. Architettura

```
TELEFONO (PWA, IndexedDB)                         WINSTUDIO (Supabase)
───────────────────────────                       ────────────────────
catalogo locale  ◀── scarica a pagine (delta) ──  fp_strutture, fp_colori, fp_vetri,
  strutture, immagini (Blob),                      fp_profili (telai), fp_serie,
  colori, vetri, telai, serie, preferenze          fp_preferenze, fp-strutture (PNG)

rilievi + voci locali ── invio quando c'è rete ─▶ rilievi_veloci, rilievo_veloce_voci (colonna fp)
  (coda "da inviare")  ◀── rilievi fatti altrove ─
```

- **Pagina unica** `/rilievo/cantiere`, tutta lato client: elenco rilievi, scheda rilievo e inserimento voce sono viste interne, non navigazioni (una navigazione senza rete fallisce). Il service worker conserva la pagina (NetworkFirst con cache) per riaprirla senza campo.
- **Catalogo locale:** Dexie (versione 6). Download a pagine da 200 righe tramite server action, solo righe con `sincronizzato_at` successivo all'ultimo scaricamento. Immagini con URL firmati, scaricate come Blob.
- **Rilievi locali:** ogni rilievo e ogni voce ha un `id` (uuid) creato sul telefono e un `aggiornato_at`. Le modifiche finiscono in coda; l'invio è un upsert per id (ripetibile senza doppioni). Le cancellazioni sono "lapidi" in coda. Regola dei conflitti: vince la modifica più recente (`aggiornato_at`).
- **Allegati (foto):** restano come oggi, solo con rete (si aggiungono riaprendo la voce quando c'è campo).

## 4. Dati

**`rilievo_veloce_voci.fp` (jsonb)** — la voce nuova (le colonne vecchie restano, non usate):

| Campo | Contenuto |
|---|---|
| `strutturaId`, `percorso`, `nome`, `serie` | struttura di FP PRO (copia di nome e percorso, per non perderla se sparisce) |
| `larghezza`, `altezza` | mm, esterno telaio |
| `quote` | `{ [codiceNodo]: mm }` per traversi (dal basso) e montanti (da sinistra), all'asse del profilo |
| `coloreInt`, `coloreEst` | `{ fpId, descrizione }` |
| `vetri` | `{ [codiceNodoRiempimento]: { fpId, codice } }` |
| `kit` | `{ [chiaveKit]: boolean }` solo per i kit opzionali; chiave = `codiceNodo:indiceKit` |
| `mano` | `'sx' \| 'dx' \| null` (lato di apertura dell'anta principale) |
| `telai` | `{ sinistra?, alto?, destra?, basso? }` → codice profilo FP PRO |

Più colonne: `posizione` (= `voce`, già esistente), `quantita`, `ordine`, `note`, `updated_at`.

**`fp_preferenze`** — `(organization_id, tipo in ('struttura','colore','vetro'), rif text, ordine)`: preferite e liste brevi, uniche per azienda.

**Telai di una serie** = `fp_profili` della serie con utilizzo 8050 (`dati.utilizzo1..10`). Il pezzo di telaio di una struttura si riconosce dal nome DXF = codice profilo.

## 5. Disegno che segue le misure

Funzione pura `disegnoVoce(struttura, voce)`:
- parte dai poligoni della struttura (misure nominali L0 × H0);
- per ogni asse costruisce una mappa a tratti: **zone rigide** (bordo telaio ~150 mm, e ±75 mm attorno all'asse di ogni traverso/montante) che si spostano senza deformarsi; **tratti intermedi** (vetri) che si allungano;
- l'asse di un traverso/montante va alla quota scritta, altrimenti in proporzione;
- se le misure sono troppo piccole per le zone rigide: riduzione uniforme (disegno comunque leggibile);
- vetro azzurro sotto i profili; simbolo di apertura per ante battenti (se la mano è indicata) e frecce per le scorrevoli.

## 6. Interfaccia (telefono)

1. **Elenco rilievi** (locali + scaricati), con indicatore "N da inviare" e stato del catalogo ("aggiornato il…", "scaricamento 1.200/4.661").
2. **Rilievo:** cliente/cantiere, note, voci con disegno in miniatura, pulsante "Aggiungi voce".
3. **Voce** (passi, avanti/indietro, si salva a ogni passo):
   1. Serie (recenti in cima)
   2. Tipologia: preferite ⭐ e recenti, poi cartelle navigabili, ricerca
   3. Misure: L, H, quantità, posizione; quote dei traversi/montanti della struttura
   4. Finitura: colore int/est (lista breve, poi ricerca)
   5. Vetri: uno per campo (proposto uguale per tutti)
   6. Opzioni: kit opzionali (spunta), mano di apertura
   7. Telaio per lato: telai della serie
   8. Note
4. **Impostazioni → Rilievo:** liste brevi colori/vetri. La stella ⭐ delle strutture si mette dal rilievo o dal Catalogo FP PRO.

## 7. Cosa si toglie

- WinConfig: pagine, componenti, azioni, tipi, `lib/winconfig-geometry.ts`, tabelle `wc_*`, colonna `config_winconfig`, tipo riga `winconfig`, modulo permessi `winconfig` (1 riga di permesso). Verificato: 0 righe di preventivo lo usano.
- I 2 rilievi di prova (5 voci, 1 allegato) e le 75 opzioni in testo libero (`rilievo_opzioni`), con le pagine di impostazione delle opzioni.
- Il vecchio modulo di inserimento voce del rilievo veloce; `/rilievo/veloce` porta a `/rilievo/cantiere`.
- "Crea preventivo" dal rilievo: nascosto fino alla fase 4.

Resta: il vecchio "rilievo a vani".

## 8. Rischi

| Rischio | Cosa si fa |
|---|---|
| Primo scaricamento pesante (~70 MB) | a pagine, riprende da dove era rimasto, avviso "meglio con Wi-Fi", si può usare il rilievo con le strutture già scaricate |
| Telefono con poco spazio / IndexedDB svuotato dal sistema | `navigator.storage.persist()`; se il catalogo manca si riscarica; i rilievi non inviati sono segnalati in rosso |
| Due telefoni modificano la stessa voce | vince la modifica più recente |
| Struttura sparita da FP PRO dopo il rilievo | la voce conserva nome e percorso; avviso "struttura non più in FP PRO" |
| Disegno impreciso su strutture complesse | è un disegno da rilievo; riduzione uniforme come riserva |

## 9. Fuori dalla fase 3

Costi e preventivo (fase 4), invio a FP PRO (fase 5), foto senza rete, archi e fuori squadro, larghezza delle singole ante.
