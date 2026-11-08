# Rilievo grafico — misure scritte sul disegno

Data: 2026-11-08 · Riguarda `/rilievo/grafico/[id]` (scheda **1 · Struttura**). Parte dal rilievo grafico del 2026-10-19 (`2026-10-19-rilievo-grafico-fppro-design.md`); le 6 scelte di quella spec restano valide salvo dove qui detto.

## Perché

Oggi le misure del serramento si cambiano solo nel pannello laterale "Forma esterna": bisogna capire quale campo (L, H1, H2…) corrisponde a quale lato, oppure compilare la tabella dei punti "a intuito". Il pannello toglie spazio al disegno. L'utente vuole lavorare **come in FP PRO**: tocca una quota sul disegno, scrive la misura, il disegno si adegua. In cantiere misura (o calcola) un po' di tutto e vuole scrivere quello che ha; il sistema ricava il resto.

## Obiettivi

1. Ogni lato del serramento ha la sua quota sul disegno, toccabile.
2. Toccando una quota compare **una casellina direttamente sul disegno**, sopra la quota, dove si scrive la misura nuova. Niente campi nel pannello laterale.
3. Lo stesso per le quote di montanti e traversi (oggi toccarle seleziona il pezzo e la misura si scrive nel pannello).
4. I modelli servono solo a partire più in fretta: scelto un modello, la forma si modifica poi liberamente lato per lato sul disegno. Da un rettangolo si può arrivare a un trapezio o a una forma con l'arco.
5. Toccando un lato compare un piccolo menù sul disegno con **Arco** (e **Dritto** per tornare indietro). Arco → casellina per la freccia.
6. Il pannello laterale diventa apribile e richiudibile; chiuso, il disegno prende tutto lo spazio.

## Non obiettivi

- Lunghezza vera dei lati inclinati sul disegno: **non serve** (detto dall'utente).
- Aggiungere angoli/vertici a mano sul disegno: le forme particolari (casetta, "L", ecc.) si prendono dai modelli.
- Diagonali (resta la scelta 6 della spec del 2026-10-19).
- Offline, stampa, tagli veri, collegamenti: argomenti separati.
- La scheda **2 · Profili e vetri** non cambia, salvo che anche lì il pannello diventa richiudibile.

## Da non fare (sarebbe un fallimento anche se "funziona")

- Rimettere campi di misura nel pannello laterale o una tabella da compilare.
- Che il sistema "indovini" da che parte mettere uno scarto in modo diverso da quanto descritto sotto.

## Comportamento delle quote del contorno (decisioni dell'utente)

Esempi su un rettangolo 1200 × 1400 (vedi schizzi in `.superpowers/brainstorm/906-1794139242/content/quote-lati.html`).

**Una quota per lato.** Base, testa, altezza sinistra, altezza destra: tutte toccabili. Le quote sono misure in orizzontale (base, testa) o in verticale (altezze), come in FP PRO, non la lunghezza vera del lato.

**Testa diversa dalla base → si centra.** Base 1200, scrivo 1000 in testa: la testa resta centrata sulla base e compaiono accanto due quote piccole di scarto, **100 a sinistra e 100 a destra**. Anche gli scarti sono toccabili.

**Scarto a 0 → lato a squadra.** Tocco lo scarto di sinistra e scrivo 0: il lato sinistro va a squadra con la base e tutta la differenza passa a destra (**0 | 1000 | 200**). In pratica la testa scivola tenendo la sua lunghezza.

**Altezze: stessa regola, centrata come FP PRO.** Altezza sinistra 1400, scrivo 1200 a destra: il lato destro si centra, **100 sopra e 100 sotto** (la base si inclina). Scrivendo 0 sotto, la base torna dritta a terra e il dislivello di 200 va tutto in alto. L'utente ha scelto esplicitamente il centrato anche per le altezze, non "base a terra" di partenza.

**Arco.** Tocco un lato → menù → **Arco** → casellina per la **freccia** (quanto sale l'arco dal centro della corda; non è il raggio). Scritta la freccia compaiono:
- **altezza totale** = altezza del lato + freccia, anch'essa toccabile: se la scrivo, la freccia si ricalcola e i lati dritti restano fermi;
- **raggio**, solo da leggere (serve in officina per curvare).

**Il sistema ricava.** Principio generale detto dall'utente: scrivo i dati che ho, il sistema ricava e mostra gli altri.

**Forme con più di 4 lati (casetta, "L", "T", scalini…)** — proposta accettata dall'utente. Oltre alle quote dei lati compaiono:
- **altezza da terra degli angoli** che non stanno su un lato a squadra (il colmo della casetta, lo scalino della "L");
- **larghezza totale e altezza totale** della forma.

Toccandole si sposta solo quell'angolo (o quel tratto) e **i lati che erano orizzontali o verticali restano tali**. Il centrato con gli scarti resta per base, testa e lati del quadrilatero (e in generale per i lati orizzontali/verticali "liberi", vedi regola sotto).

## Scelte mie (il builder può verificarle con l'utente se ha dubbi)

1. **Forma sempre a punti dopo la scelta del modello.** Scegliere un modello lo esegue come oggi (`eseguiModello`) e lo converte subito in forma a punti (`{ tipo: 'punti', punti }` con `freccia` per i lati curvi). Ogni arco circolare tra due vertici è determinato esattamente dalla sua freccia, quindi la conversione non perde niente (archi a tre centri, angoli arrotondati, ovale, cerchio = più lati ad arco). Da lì tutte le modifiche lavorano sui punti. Il tipo `modello` resta leggibile per i rilievi già salvati e si converte alla prima modifica della forma.
2. **Id del telaio stabili.** I pezzi telaio sono `T{i}` per indice di lato dopo `normalizzaContorno`: la conversione deve tenere lo stesso ordine dei lati, così le assegnazioni dei profili sopravvivono.
3. **Quale regola su quale quota.** Ogni lato è "orizzontale" se si sviluppa più in larghezza che in altezza, altrimenti "verticale"; la sua quota è la proiezione in quella direzione. Su un **quadrilatero** cambiare la quota di un lato sposta i suoi due estremi in modo simmetrico (centrato) e i lati vicini seguono, inclinandosi: sono gli esempi sopra. Sulle **forme con più di 4 lati** le quote dei lati e degli angoli spostano i vertici mantenendo orizzontali/verticali i lati che lo erano (un lato a squadra resta a squadra); il centrato con gli scarti vale solo per i lati i cui vicini sono già inclinati o che non hanno vincoli di squadra. Larghezza/altezza totali spostano gli angoli che stanno sul bordo destro / in alto (con i lati a squadra che li seguono), tenendo fermo il lato sinistro / la base: sulla casetta l'altezza totale è l'altezza al colmo. Gli scarti sono la distanza degli estremi del lato dai bordi dell'ingombro; cambiare uno scarto fa scivolare il lato tenendo la sua quota.
4. **Quando si vedono gli scarti.** Solo sui lati che non coprono tutto l'ingombro; quando appaiono si vedono entrambi, anche quello a 0. Se il lato torna a coprire tutto (entrambi 0), spariscono. **L'ingombro per gli scarti si calcola sui vertici (le corde), senza la gobba degli archi**: un muro sotto un arco non mostra scarti solo perché c'è l'arco.
5. **Lato ad arco.** Ha la quota della corda (con le stesse regole di un lato dritto), la freccia, l'altezza totale e il raggio da leggere. **Altezza totale = da terra (punto più basso della forma) al punto più alto dell'arco**; per un arco su un lato verticale, l'equivalente in larghezza. Si salva **solo la freccia** (punti + freccia, come oggi): se poi cambiano i muri o la corda, la freccia resta e l'altezza totale si aggiorna. Freccia negativa = arco che rientra, come oggi.
5b. **Archi che i modelli disegnano a pezzi.** Nella conversione modello → punti, archi consecutivi sullo stesso cerchio diventano **un solo lato** (es. arco ribassato, lunetta, mezzaluna, tratto centrale dell'arco a tre centri), così toccando l'arco si lavora su tutto l'arco. Il cerchio pieno (oblò) resta di due mezzi lati. Per i rilievi già salvati con questi modelli la numerazione dei lati del telaio può cambiare: le assegnazioni di profilo del telaio orfane si potano come già succede al salvataggio (sono rilievi recenti e pochi).
6. **Cambio modello.** Si apre da un pulsante **Forme** nella barra sopra il disegno (griglia delle miniature in un riquadro che si chiude dopo la scelta). Il modello nuovo parte con larghezza e altezza complessive del disegno attuale dove il modello ha `L`/`H`; montanti, traversi e ante restano (come oggi).
7. **Casellina.** Tastiera numerica, conferma con Invio o toccando fuori, Esc annulla. Valori non validi (≤ 0, forma che si incrocia o diventa invalida) non si applicano: la casellina resta rossa con un messaggio breve. Una conferma = un passo di Annulla.
8. **Pannello laterale.** Pulsante per aprirlo/chiuderlo; lo stato si ricorda nel dispositivo (localStorage, con try/catch). Dentro restano i comandi che non sono misure: dividi, apertura, riempimento, numero ante, mano. Il riquadro "Forma esterna" con i campi e la tabella dei punti sparisce. Sul telefono il pannello oggi sta sotto il disegno: anche lì si apre e chiude.
9. **Quote di montanti e traversi.** Toccandole si apre la casellina sul disegno. I pulsanti "a metà / da sinistra / da destra" restano nel pannello del pezzo selezionato.

## Vincoli

- Logica geometrica pura in `lib/rilievo-grafico/` (niente React), con test Vitest in `rilievo-grafico.test.ts`: conversione modello → punti, testa centrata, scarto a 0, altezze centrate, freccia ↔ altezza totale, raggio.
- React Compiler: niente letture di `ref.current` in render (vedi gotcha_react_compiler_refs). La casellina va posizionata con coordinate calcolate, non misurando il DOM in render.
- In cantiere si usa col dito: quote, scarti e lati devono essere facili da toccare sul telefono.
- `npm run lint` a zero, `npm run build` pulito.

## Lasciato al builder

Posizionamento delle quote (fuori dal contorno, senza sovrapporsi), aspetto del menù sul lato, come mostrare in modo leggibile freccia/altezza totale/raggio, gestione dello zoom della casellina sul telefono.
