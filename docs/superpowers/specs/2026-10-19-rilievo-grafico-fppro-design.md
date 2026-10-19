# Rilievo grafico come FP PRO — design

Data: 2026-10-19. Sostituisce il vecchio "Nuovo rilievo grafico" (vani + CanvasVano).

## Perché
Serve un sistema a sé per i serramenti fuori standard (verande inclinate, archi, forme strane).
Come lavora l'utente: in cantiere disegna per bene la struttura e la salva; in ufficio, con calma,
assegna a ogni pezzo la barra (profilo FP PRO) e a ogni zona vetro, pannello, doghe o lamelle.
Deve essere preciso come FP PRO. Collegamenti ad altro (preventivi, rilievo misure) li decide l'utente dopo.

## Come costruisce FP PRO (analisi dei file .STR, sola lettura)
- La forma esterna è uno script parametrico `Prm\MODELS\MODEL-xx.PRM` (VAR/SET, MOVETO/LINETO/ARCTO...).
- Dentro, un albero di nodi inseriti "cliccando nella zona": montanti (8060) e traversi (8070)
  dividono la zona all'asse; ante (8610 battente, 8620 scorrevole) con N ante; riempimenti
  (8510 vetro, 8500 pannello) dentro fermavetro/fermapannello.
- Ogni lato di ogni nodo è un pezzo con il suo profilo (DXF) e il suo ruolo (utilizzo).

## Deciso con l'utente
- Sezione a parte: `/rilievo/grafico` (elenco) e `/rilievo/grafico/[id]` (editor). Un rilievo = un serramento.
- Forma: i modelli di FP PRO tranne lunetta ad anello (61), arco con spalle (62) e due archetti (63),
  oppure forma a punti. Nella forma a punti ogni angolo si dà con **distanza dal lato sinistro e
  altezza da terra** (niente diagonali); un lato ad arco si dà con la **freccia**.
- Tre modi di dividere, tutti insieme: tocca la zona e scegli (A), traccia col dito (B), griglia (C).
- In ufficio: si scelgono **una o più serie** e si vedono solo le loro barre. **Il sistema non assegna
  niente da solo**. Il filtro "solo profili del ruolo" è acceso di partenza e si può spegnere.

## Scelte mie (da verificare con l'uso)
- 29 modelli: tolte anche le copie identiche 12 (= 19) e 99 (= 10); riscritti puliti 68/69 (metà arco
  ribassato) e 71 (triangolo equilatero), che in FP PRO disegnano con trucchi o con un'espressione
  sbagliata. Gli script sono interpretati in TS (`lib/rilievo-grafico/prm.ts`), senza eval.
- Le quote dei tagli si misurano dal bordo della zona all'asse del profilo: "da sinistra/da destra"
  per i montanti, "dal basso/dall'alto" per i traversi; altrimenti "a metà" o in parti uguali.
  Correggendo le misure della forma, un traverso a 800 resta a 800.
- Pezzi: telaio (uno per lato della forma), montanti, traversi, ante (un pezzo per lato di ogni anta),
  riporto tra ante battenti, fermavetro/fermapannello (uno per lato della zona riempita). Doghe e
  lamelle: profili con utilizzo 8300. Pannelli: i file `Dxf\PANELS` usati nelle strutture (in MySQL
  non c'è un elenco), più un codice scritto a mano.
- Gli id dei pezzi sono stabili (derivano dall'albero), quindi le assegnazioni restano quando si
  cambiano le misure; quelle dei pezzi che non esistono più si tolgono al salvataggio.
- Spessori solo per il disegno (telaio 70, montante 70, anta 60, fermo 20 mm): misure e tagli veri
  dipenderanno dai profili assegnati (non in questa fase). Le lunghezze in tabella sono indicative.
- Salvataggio automatico nel dispositivo (Dexie v8, `rilieviGrafici`), poi sul server
  (`rilievi_grafici`) quando c'è la rete; vince la modifica più recente (`aggiornato_at`).
- L'ufficio (serie, profili, vetri, pannelli) richiede la rete.

## Fuori da questa fase
Tagli e angoli veri dai profili, distinta, prezzi, collegamento a preventivo/rilievo misure/FP PRO,
pagina disponibile senza rete in cantiere (come `/rilievo/cantiere`), stampa.
