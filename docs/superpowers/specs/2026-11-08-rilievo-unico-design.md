# Rilievo unico: voci da FP PRO e voci disegnate, riepilogo e dettagli costruttivi

Data: 2026-11-08. Stato: da approvare.

## Perche'

Oggi ci sono due rilievi separati:
- **Rilievo veloce** (`/rilievo/cantiere`, `rilievi_veloci` + `rilievo_veloce_voci.fp`): piu' voci per rilievo, ogni voce e' una struttura FP PRO con misure, colori, vetri, kit; funziona senza rete; ha riepilogo stampabile (5 voci per A4), Calcolo e trasferimento in Preventivi.
- **Rilievo grafico** (`/rilievo/grafico`, `rilievi_grafici`): un rilievo = un serramento disegnato (forma, quote, divisioni, ante, profili assegnati in ufficio); cliente = testo libero; niente colori, niente accessori, niente riepilogo; la pagina dell'editor non e' disponibile senza rete.

L'utente: "in fondo sono simili, cambia solo il modo in cui il serramento viene costruito". Vuole **un rilievo solo**, e al momento di aggiungere una voce decide se e' **veloce** (da struttura FP PRO) o **disegnata** (grafico). Vuole inoltre un foglio interno per l'officina, **Dettagli costruttivi**, dove si leggono i codici dei profili, per ricopiare fedelmente il serramento in FP PRO (non serve per tagliare; un giorno sara' la base per importare in FP PRO, ma l'importazione e' fuori da questo lavoro).

## Obiettivi

1. Un unico rilievo con voci di due tipi, nello stesso elenco, nello stesso riepilogo e negli stessi Dettagli costruttivi.
2. Cliente del rilievo scelto con il modulo dei preventivi (`components/preventivi/StepCliente.tsx`: ricerca in anagrafica + scheda completa), per tutti i rilievi.
3. La voce disegnata ha quello che ha la voce veloce dove ha senso: posizione, quantita', note, colori (unico/bicolore), colore accessori, accessori aggiunti, testo per lato.
4. Pagina **Dettagli costruttivi**: 4 voci per A4, codici di tutti i profili, note scrivibili anche da li'.

## Non obiettivi

- Calcolo del prezzo delle voci disegnate (in futuro: tasto includi/escludi nel Calcolo, spento di partenza; poi il calcolo vero).
- Esportazione/importazione verso FP PRO.
- Misure di taglio, barre, distinta materiali nei Dettagli costruttivi.
- Cambiare il modo in cui si disegna (quote sul disegno, archi, divisioni: gia' fatto il 2026-11-08).

## Anti-obiettivi (sarebbe un fallimento anche se funziona)

- Perdere il funzionamento senza rete del cantiere, o rompere la sincronizzazione esistente (segno_server, eliminazioni, voci inviate).
- Toccare il calcolo o i preventivi delle voci veloci gia' esistenti (risultati diversi da prima).
- Scrivere in FP PRO (regola fissa: solo lettura).
- Dettagli costruttivi generici: devono mostrare i codici veri, una riga per ogni cosa.

## Decisioni dell'utente

- **Rilievo unico**; in inserimento si sceglie veloce o disegnata.
- I rilievi grafici salvati finora sono **prove: si cancellano** (non si convertono).
- Voci disegnate **fuori dal calcolo** per ora.
- **Trasferisci in Preventivi** con voci disegnate: non entrano nel preventivo; prima del trasferimento compare un **avviso con l'elenco delle voci lasciate fuori** (risposta A, 2026-11-08).
- Cliente con il **modulo dei preventivi**, anche nel rilievo veloce (al posto di nome/cognome/telefono attuali).
- Il riepilogo compatto attuale del veloce **resta** (5 per A4) e vale anche per le voci disegnate.
- **Colore**: un campo unico; tasto **Bicolore** che fa comparire colore interno ed esterno separati. Vale per tutte le voci (veloci e disegnate).
- Voce disegnata: **un campo di testo per ogni lato della forma** (non 4 fissi); nel rilievo veloce restano i 4 campi attuali (alto, basso, sinistra, destra).
- Accessori nella voce disegnata come nel veloce: colori accessori dagli elenchi FP PRO + tasto "Aggiungi accessorio" che cerca nel catalogo.
- **Dettagli costruttivi** (bozza approvata, `.superpowers/brainstorm/.../scheda-costruzione-5.html`):
  - 4 voci per A4; intestazione con cliente, data, cantiere, "uso interno"; pie' di pagina con numero pagina.
  - Ogni voce: a sinistra il disegno, con in alto **POS., mq per pezzo, Q.ta'**, sotto misure e mano; attorno al disegno le scritte dei campi di ogni lato.
  - Al centro **una riga per ogni cosa**, etichetta in grassetto maiuscolo e accanto il codice: TELAIO, ANTA, RIPORTO, MONTANTI, TRAVERSI, FERMAVETRO, VETRI, ACCESSORI, COLORI. Riga senza contenuto = trattino (stessa forma per tutte le voci). Prima riga: struttura/serie (veloce) o forma/serie (disegnata).
  - A destra riquadro **NOTE** a righe; le note **si scrivono anche da questa pagina** (stesso campo note della voce, salvato nel rilievo) e in stampa escono come testo.
  - Disponibile sia per le voci veloci sia per le disegnate, mescolate nell'ordine del rilievo.

## Scelte mie (da controllare)

1. **La base e' il rilievo veloce**: `rilievi_veloci` e `rilievo_veloce_voci` restano le tabelle; la voce disegnata e' una riga di `rilievo_veloce_voci` con un nuovo campo jsonb `grafico` (il `DisegnoGrafico` di oggi + testi per lato, colori, accessori) e `fp` nullo. Il tipo di voce si ricava da quale dei due e' valorizzato. Motivo: il veloce ha gia' cliente, cantiere, offline, sync, ordinamento, copia, riepilogo e trasferimento.
2. **L'editor disegnato si apre dentro la pagina del cantiere** come vista (niente navigazioni Next), cosi' funziona senza rete come le voci FP PRO. L'assegnazione dei profili in ufficio (`PannelloProfili`, usa server action) resta solo con la rete, come oggi.
3. Dopo il lavoro la sezione **"Rilievo grafico" separata sparisce** (menu, `/rilievo/grafico` reindirizza al cantiere), tabella `rilievi_grafici` e tabelle Dexie del grafico svuotate e poi rimosse. La cancellazione dei dati di prova in produzione si conferma con l'utente prima di eseguirla.
4. **mq per pezzo** = larghezza x altezza dell'ingombro (rettangolo che contiene la forma), come si fattura; per le voci veloci L x H come oggi.
5. Testi per lato della voce disegnata legati all'**indice del lato** (lato i = pezzo telaio `T{i}`): la forma a punti non rinumera i lati (scelta del 2026-11-08), quindi i testi restano al loro lato quando cambiano le misure. Se un lato viene tolto o aggiunto i testi in piu' si perdono, come i profili assegnati.
6. **Colore unico**: nei dati restano `coloreInt`/`coloreEst`; "unico" = stessi valori. Una voce gia' salvata con due colori diversi si apre in modalita' Bicolore. Il calcolo non cambia.
7. **Cliente**: il modulo dei preventivi lavora sull'elenco clienti gia' nel telefono (Dexie `clienti`) e sulla fotografia `cliente_snapshot` con `clienteId`; senza rete un cliente nuovo resta fotografia e lo registra il trasferimento, come oggi. Il campo cantiere resta.
8. Righe dei Dettagli costruttivi per la voce disegnata dai profili assegnati per pezzo: TELAIO raggruppa i lati con lo stesso codice (i codici diversi per lato si elencano con il lato), MONTANTI/TRAVERSI con codice e quota, ANTA/RIPORTO/FERMAVETRO dai pezzi di quel ruolo, VETRI dai riempimenti per zona. Pezzo senza profilo assegnato = "da assegnare".
9. Le note scritte nei Dettagli costruttivi si salvano come una modifica della voce nel dispositivo (segnata da inviare), cosi' funzionano anche senza rete.
10. **Profili e riempimenti assegnati in ufficio** della voce disegnata stanno in una **colonna separata** di `rilievo_veloce_voci` (non dentro `grafico`), come `correzioni_fp`: un telefono con una copia vecchia del disegno, inviandola, non deve cancellare le assegnazioni fatte al PC. Il disegno (`grafico`) lo riscrive chi disegna; le assegnazioni le scrive solo l'ufficio. Assegnazioni orfane (pezzo che non esiste piu') si ignorano nel disegno e nei Dettagli.
11. Riga **ACCESSORI** delle voci veloci: come il riepilogo di oggi (`datiRiepilogo`): kit attivi, accessori opzionali spuntati, accessori aggiunti; non si esplodono i codici dentro i kit. Riga **VETRI**: vetro/pannello di ogni campo, uguali raggruppati. Testo troppo lungo: va a capo dentro la sua riga e si rimpicciolisce, mai fuori dal riquadro della voce.
12. **Colori accessori** della voce disegnata: elenco completo dei colori accessori di FP PRO (`per_accessori`), stessa scelta ordinata (`coloriAcc`) del veloce; il filtro per copertura dei kit non si applica (la voce disegnata non ha kit).

## In tre parti (ognuna con il suo piano)

1. **Rilievo unico e cliente**: campo `grafico` sulle voci, scelta del tipo all'inserimento, editor disegnato come vista del cantiere, elenco/copia/elimina/trascina per i due tipi, modulo cliente dei preventivi, sezione grafico separata tolta, prove cancellate (con conferma). Il Calcolo ignora le voci disegnate e lo dice ("voce disegnata: esclusa dal calcolo"); il trasferimento in Preventivi le lascia fuori con l'avviso che le elenca.
2. **Voce disegnata completa + colore unico**: testi per lato, colore unico/Bicolore (anche nel veloce), colore accessori, Aggiungi accessorio; riepilogo compatto anche per le voci disegnate.
3. **Dettagli costruttivi**: la pagina, la stampa A4 (stesso metodo del riepilogo: vista nel cantiere + `window.print()`), le note scrivibili.

## Vincoli tecnici da rispettare (da [[project_catalogo_fp]])

- Pagina del cantiere: niente navigazioni Next; viste con stato + history; non leggere `history.state` (Next lo riscrive).
- Sync: si riceve per `segno_server`, mai per orario del telefono; eliminazioni in `fp_rilievi_eliminati`.
- `correzioni_fp` mai dentro `fp`; il telefono riscrive `fp` intero (lo stesso varra' per `grafico`).
- Dexie: un upgrade non svuota le tabelle che servono offline.
- React Compiler: niente letture di ref in render.
- Stampa: il CSS di stampa forza `overflow: visible`; testi su `leading-tight`, altrimenti le schede sbordano nella successiva.

## Lasciato a chi costruisce

Nomi di componenti e funzioni, divisione in file, forma esatta del jsonb `grafico` oltre a quanto sopra, migrazione Dexie, testi dei pulsanti non fissati qui, impaginazione fine della stampa purche' restino 4 voci per A4 leggibili.
