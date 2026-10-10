# Rilievo → Preventivo → FP PRO

Documento di progetto, 2026-10-10. Stato: **da approvare**.

## 1. Perché

Oggi rilievo, preventivo e produzione sono tre passaggi scollegati. Le misure prese in cantiere vengono ricopiate a mano nel preventivo e poi di nuovo in FP PRO per la produzione. Ogni ricopiatura costa tempo e può introdurre errori.

**Obiettivo:** ogni dato si scrive una volta sola, in cantiere, e viaggia fino alle macchine.

**Quando è riuscito:**
- un serramento rilevato in cantiere diventa una riga di preventivo con il costo dei materiali già calcolato, senza riscrivere niente;
- un preventivo confermato entra in FP PRO come commessa, senza riscrivere niente;
- una struttura nuova creata in FP PRO compare in WinStudio dopo una sincronizzazione.

## 2. Decisioni prese

| Tema | Decisione |
|---|---|
| Chi calcola la produzione | **FP PRO.** WinStudio fa solo calcoli da preventivo: un errore di ±1 cm sulle misure di anta e vetro è accettabile |
| Strutture (tipologie) | Si creano **in FP PRO** e si portano in WinStudio così come sono. Ogni serie ha le sue |
| Ordine di configurazione | **Serie → tipologia → misure, vetri, finitura**, già in cantiere |
| Misura rilevata | **Esterno telaio** |
| Anagrafiche e prezzi | Arrivano da FP PRO con un pulsante "Sincronizza". Si sincronizza **solo l'archivio EDILSIDER** |
| Collegamento al PC | Un **programma ponte** sul PC di FP PRO, installato e mantenuto da Claude. L'utente usa solo i pulsanti di WinStudio |
| Nel preventivo | **Una riga per serramento** (dettagli da definire più avanti) |
| WinConfig | **Viene tolto** e sostituito da questo sistema (verificato: nessun preventivo lo usa) |
| Rilievi veloci esistenti | Erano prove: **si cancellano** |
| Forme | In questa versione solo **forme rettangolari**. Le strutture con archi o fuori squadro si importano ma restano marcate "non supportata" |

## 3. Il flusso

```
CANTIERE (telefono)          UFFICIO (WinStudio)                PC FP PRO
──────────────────          ───────────────────                ─────────
Serie                        Riapri il rilievo
  → Tipologia (disegno)        → costo materiali calcolato
  → Misure esterno telaio      → manodopera, ricarico
  → Colore int/est             → preventivo al cliente
  → Vetro per ogni campo       ↓ cliente conferma
  → Opzioni kit                → "Invia a FP PRO"  ──────────→  Ponte scrive il file JIB
  → Apertura, note, foto                                        → FP PRO lo importa
                                                                → calcolo produzione, macchine
```

## 4. Architettura

Tre pezzi, ognuno con un solo compito:

```
┌──────────────────────┐   richieste / dati   ┌───────────────────┐   legge/scrive  ┌──────────────────────┐
│ WinStudio (Vercel +  │ ◀──────────────────▶ │ Ponte sul PC      │ ◀─────────────▶ │ FP PRO               │
│ Supabase)            │      (Supabase)      │ C:\WinStudioPonte │                 │ MySQL edilsider,     │
│ rilievo, preventivo, │                      │                   │                 │ cartelle STR, JIB    │
│ catalogo FP          │                      └───────────────────┘                 └──────────────────────┘
└──────────────────────┘
```

- **WinStudio** non parla mai direttamente col PC: scrive una richiesta in una tabella e legge il risultato.
- **Il ponte** è l'unico pezzo che vede il MySQL e le cartelle di FP PRO. Non decide niente: esegue le richieste.
- **FP PRO** non viene modificato: il ponte legge il suo database e scrive solo nella sua cartella di importazione.

## 5. Dati in WinStudio

Tabelle nuove, tutte con `organization_id` e RLS come il resto dell'app. I codici sono **quelli di FP PRO**, così l'esportazione non deve tradurre niente.

| Tabella | Contenuto | Da FP PRO (MySQL `fp_pro32_edilsider`) |
|---|---|---|
| `fp_serie` | serie (ES40, AL_62UP, EKOS_66TH…) | `serie_profili` |
| `fp_profili` | codice, descrizione, kg/m, larghezza, barra | `profili`, `barlen` |
| `fp_profili_costi` | €/kg o €/m per profilo **e colore** | `costo_profili` |
| `fp_colori` | finiture (codice + descrizione) | `trattamenti_superficiali`, `colori` |
| `fp_accessori` | codice, prezzo confezione, unità di vendita | `accessori`, `costo_accessori` |
| `fp_vetri` | codice, €/m², minimo fatturabile, spessore | `vetri` |
| `fp_kit` + `fp_kit_righe` | kit con le regole di quantità | `kit`, `dettagliokit` |
| `fp_strutture` | una riga per file `.STR`: serie, nome, albero dei pezzi (JSON), anteprima, kit inclusi | cartella `STR` |
| `fp_detrazioni` | misure di anta e vetro rispetto al telaio, per serie | vedi §7 |
| `fp_ponte_richieste` | richieste a ponte (tipo, stato, esito, errori) | — |
| `fp_ponte_stato` | ultimo segnale del ponte, ultima sincronizzazione | — |

**Sincronizzazione:** il ponte riscrive le tabelle `fp_*` con i dati di FP PRO (inserisce, aggiorna, segna come "non più in FP PRO" quello che è sparito). Non cancella mai una riga usata da un rilievo o da un preventivo.

**Rilievo:** la voce del rilievo veloce (`rilievo_veloce_voci`) passa da testi liberi a riferimenti: `struttura_id`, `colore_int`/`colore_est` (codici FP), `vetri` per ogni campo, `opzioni_kit` scelte, variabili (lato e altezza maniglia). Restano misure, quantità, note e allegati. La tabella `rilievo_opzioni` (testi liberi) non serve più.

## 6. Rilievo in cantiere

1. **Serie:** elenco delle serie sincronizzate.
2. **Tipologia:** le strutture di quella serie, ognuna con il suo disegno.
3. **Misure:** larghezza × altezza esterno telaio, quantità.
4. **Finitura:** colore interno, colore esterno (bicolore se diversi).
5. **Vetri:** uno per ogni campo vetrato della struttura (proposto lo stesso per tutti).
6. **Opzioni:** i kit a scelta della struttura (es. martellina / cremonese), lato e altezza maniglia.
7. **Note e foto:** come oggi.

Funziona **senza rete**: serie, strutture, colori e vetri vengono salvati sul telefono (IndexedDB, come già avviene per i listini) e si aggiornano a ogni sincronizzazione.

Il disegno è un SVG generato dall'albero della struttura: un trapezio per ogni profilo (angoli a 45° o dritti come in FP PRO), vetri colorati, simboli di apertura. Si ridisegna in tempo reale con le misure inserite.

## 7. Calcolo del costo materiali

Funzioni pure in `lib/` (nessun accesso al database), testate con Vitest.

**7.1 Misure dei pezzi.** Dalla struttura si conoscono i pezzi (telaio, ante, fermavetri, traversi) e su quali lati stanno. Le misure dipendono da L e H con delle **detrazioni fisse per serie**:
- anta = telaio − detrazione telaio→anta (es. AL_72UP: −79,6 in larghezza, −65,3 in altezza);
- vetro = anta − detrazione anta→vetro (es. AL_72UP: −73);
- vetro fisso nel telaio = telaio − detrazione telaio→vetro.

Le detrazioni si ottengono in due modi:
- **automatico:** dalle commesse già calcolate da FP PRO che usano quella serie (le misure reali di anta e vetro sono salvate nei file della commessa). Il ponte le legge durante la sincronizzazione;
- **manuale:** si scrivono una volta per serie in una schermata di WinStudio, e prevalgono su quelle automatiche.

Se una serie non ha detrazioni, il serramento si può rilevare, ma il preventivo mostra "detrazioni mancanti" e non calcola il costo.

**7.2 Quantità accessori.** Le regole dei kit di FP PRO:
- quantità fissa;
- per fasce di misura (es. ×4 con H da 1500 a 2500, ×6 oltre);
- a passo (1 ogni N mm);
- a formula in metri (es. `4*H+4*L`), con le variabili L, H, W e le loro frazioni.

Le formule non riconosciute fanno comparire un avviso sulla riga, invece di un numero sbagliato.

**7.3 Prezzi** (verificati al centesimo su commesse reali di FP PRO):
- **profilo:** peso = metri × kg/m × 1,03; costo = peso × €/kg del colore scelto (oppure metri × €/m se il profilo è a metro);
- **vetro:** m² di ogni pezzo, con il minimo fatturabile (es. 0,5 m²), × €/m²;
- **accessorio:** prezzo della confezione ÷ unità per confezione × quantità.

Il risultato è il **costo materiali** del serramento, con la distinta (profili, accessori, vetri) salvata come fotografia nella riga di preventivo.

**Vetri senza prezzo:** in FP PRO solo 64 vetri su 198 hanno un prezzo. Per gli altri, il preventivo mostra "prezzo vetro mancante". Il prezzo si completa in FP PRO, oppure con un €/m² di riserva impostabile in WinStudio.

## 8. Preventivo

- Nuovo tipo di riga `fppro` in `articoli_preventivo`, al posto di `winconfig`.
- La riga mostra: disegno, serie, tipologia, misure, finitura, costo materiali.
- Manodopera e ricarico portano dal costo materiali al prezzo di vendita della riga. Come inserirli e presentarli è da definire prima della fase 4 (vedi §12).
- Il pulsante "Crea preventivo" su un rilievo trasforma tutte le voci in righe `fppro`.

## 9. Il ponte sul PC

- **Dove:** `C:\WinStudioPonte`, programma Node.js (Node è già installato sul PC).
- **Avvio:** automatico all'accesso a Windows (Utilità di pianificazione), in background, senza finestre.
- **Funzionamento:** ogni 30 secondi lascia un segnale di vita (`fp_ponte_stato`) e controlla `fp_ponte_richieste`. Esegue le richieste una alla volta e scrive l'esito.
- **Sincronizzazione automatica:** una al giorno, alla prima accensione del PC, più quelle richieste col pulsante.
- **Richieste:**
  - `sincronizza`: legge il MySQL (sola lettura) e le cartelle `STR` e aggiorna le tabelle `fp_*`;
  - `invia_commessa`: genera il file JIB e lo mette nella cartella di importazione di FP PRO.
- **In WinStudio:** stato "collegato" / "PC spento o non raggiungibile" (nessun segnale da più di 2 minuti), data dell'ultima sincronizzazione, errori dell'ultima richiesta in chiaro. Le richieste fatte a PC spento restano in coda.
- **Credenziali:** la chiave di accesso a Supabase e i dati del MySQL stanno solo sul PC, in un file locale fuori dal repository.
- **Registro:** file di log giornaliero in `C:\WinStudioPonte\log`, per capire cosa è successo.
- **Codice:** sta nel repository (cartella `ponte/`), così si aggiorna come il resto dell'app.

## 10. Esportazione verso FP PRO (file JIB)

FP PRO ha un'importazione ufficiale di commesse in formato **JIB** (comando "Importa JIB", cartella di importazione, programma `fp_pro_cmd_jib.exe`). Sono stati trovati due file JIB veri (`Dropbox\FP_PRO\Import`) generati dal configuratore web di EdilSider. Contengono cliente, cantiere, percorso della struttura `.STR`, colori, vetri, kit e variabili delle ante.

Il formato è a blocchi (lunghezza + tipo + dati), ma il contenuto di ogni blocco è una struttura binaria con campi in posizioni fisse non documentate.

**Strada principale:** chiedere a Emmegisoft le specifiche del formato JIB o la loro libreria FPPJIB (la stessa che usa EdilSider).

**Strada di riserva:** ricostruire le posizioni dei campi confrontando file JIB generati apposta (stessa struttura con misure diverse).

Finché il formato non è chiaro, il pulsante "Invia a FP PRO" resta disattivato: **le fasi 1–4 non dipendono da questo**.

## 11. Cosa si toglie

- Modulo WinConfig: pagine `/winconfig`, `components/winconfig/`, `actions/winconfig.ts`, `lib/winconfig-geometry.ts`, `types/winconfig.ts`, tabelle `wc_*`, tipo riga `winconfig` e i suoi riferimenti in preventivi, contabilità, statistiche e rilievo. Verificato il 2026-10-10: 0 righe di preventivo, 1 serie e 2 profili di prova.
- I 2 rilievi veloci di prova e le 75 opzioni in testo libero di `rilievo_opzioni`.

## 12. Fasi

Ogni fase si può usare da sola prima di passare alla successiva.

| Fase | Contenuto | Si può usare per |
|---|---|---|
| **1. Ponte e anagrafiche** | ponte installato, sincronizzazione MySQL → `fp_*`, pagina "Catalogo FP PRO" con stato del ponte e pulsante Sincronizza | consultare serie, profili, accessori, vetri e prezzi in WinStudio |
| **2. Strutture** | lettura dei `.STR`, disegno SVG, catalogo strutture per serie | vedere le tipologie di ogni serie |
| **3. Rilievo nuovo** | rilievo con serie → tipologia → misure/finitura/vetri/opzioni, offline; rimozione rilievi di prova, opzioni libere e WinConfig | rilevare in cantiere |
| **4. Costo e preventivo** | detrazioni (automatiche e manuali), distinta, prezzi, riga `fppro`, "Crea preventivo" dal rilievo | preventivare |
| **5. Invio a FP PRO** | scrittura JIB e invio tramite ponte | mandare in produzione |

La fase 5 parte quando c'è il formato JIB (§10).

## 13. Test

- **Prezzi:** test con i casi reali verificati (profilo 49,405 kg × 11,16 = 551,36 €; vetri 267×1148 con minimo 0,5 m²; accessorio 432 € ÷ 400 × 16 = 17,28 €).
- **Strutture:** lettura di file `.STR` veri (EKOS 66TH 1 e 2 ante, SLIDE65 scorrevole 2 ante) con verifica dei pezzi e dei kit trovati.
- **Detrazioni:** confronto con le misure reali di commesse calcolate da FP PRO (es. AL_72UP 1000×2100 → anta 920,4×2034,7, vetro 847,4×1961,7).
- **Ponte:** sincronizzazione su una copia dei dati, controllo dei conteggi (40 serie, 2.601 profili…).
- **JIB:** il file generato viene importato in FP PRO su una commessa di prova prima dell'uso vero.

## 14. Rischi

| Rischio | Cosa si fa |
|---|---|
| Emmegisoft non fornisce le specifiche JIB | strada di riserva (§10); le fasi 1–4 restano utili |
| Aggiornamento di FP PRO che cambia il database o il formato | il ponte controlla le colonne che usa e segnala l'errore invece di scrivere dati sbagliati |
| PC spento a lungo | rilievo e preventivo funzionano coi dati già sincronizzati; le richieste restano in coda |
| Detrazioni imprecise | ±1 cm è accettato; quelle manuali prevalgono; il calcolo esatto resta di FP PRO |
| Prezzi mancanti (vetri) | avviso sulla riga e prezzo di riserva |

## 15. Fuori da questo progetto

- Archi, fuori squadro e forme speciali.
- Calcolo esatto delle barre e ottimizzazione dei tagli (lo fa FP PRO).
- Sincronizzazione degli archivi ALSISTEM, ALPHACAN e VARIE.
- Ritorno dei dati da FP PRO a WinStudio dopo la produzione.
