# Fatture emesse e incassi su Fatture in Cloud (fase 4)

Data: 2026-10-04
Fasi precedenti: collegamento FiC e fatture fornitori (2026-09-28), pagamenti ai
fornitori (2026-10-03), contabilita' di commessa (2026-10-04).

## Obiettivo

Collegare le **fatture di vendita emesse su FiC** alle commesse e, quando in WinStudio si
registra un **incasso** (`acconti_commessa`), scrivere il pagamento anche sulla fattura
FiC. E' lo specchio della fase 2 (scadenze → fatture fornitori), applicato a
incassi → fatture clienti.

Dati reali al 2026-10-04: su FiC 907 fatture emesse e 52 note di credito, quasi tutte
"da incassare"; in WinStudio 314 incassi dal 2025 (155 bonifici, 152 contanti, 3 RiBa,
4 altro; 22 con ritenuta). Il token attuale legge le fatture emesse; la scrittura va
verificata con una prova reale su una fattura scelta dall'utente.

## Decisioni prese con l'utente

1. **Due passi**: prima si collegano le fatture alla commessa, poi ogni incasso si
   ripartisce da solo sulle fatture della commessa ancora da incassare (correggibile).
2. Pagina **"Fatture"** con due schede, **Fornitori** e **Clienti**, ciascuna con il suo
   pulsante Sincronizza e la sua "ultima sincronizzazione".
3. **Ritenute** (regola A): bonifico parlante 11% → la fattura si paga per intero;
   condominio 4% → si paga quanto FiC indica da incassare se la fattura riporta la
   ritenuta, altrimenti per intero. **Importo della fattura sempre visibile** durante
   l'inserimento, per vedere le discrepanze.
4. Una fattura **si puo' dividere fra piu' commesse** con una quota per commessa.
5. **Storico**: collegando le fatture a una commessa con incassi gia' registrati,
   WinStudio propone l'abbinamento; alla conferma scrive i pagamenti su FiC con le date
   vere. "Non ora" lascia il pulsante nella scheda commessa.
6. Collegamento **facoltativo**: un incasso senza fattura resta com'e'.

## Cosa non fa

- nessuna modifica a statistiche, flusso di cassa, crediti/debiti, Calcoli: gli incassi
  restano letti da `acconti_commessa`;
- il **Resoconto economico** continua a leggere i PDF: l'uso delle fatture collegate e'
  un passo successivo;
- nessuna creazione di fatture su FiC: si collegano solo quelle esistenti;
- nessuna scrittura automatica in background: solo azioni dell'utente o Riprova.

## Pagina "Fatture"

`/fatture-fornitori` diventa la pagina "Fatture" (voce di menu e permesso rinominati
"Fatture", chiave del permesso invariata `fatture_fornitori`). Scheda **Fornitori**
invariata. Scheda **Clienti**:

- barra di sincronizzazione propria: Sincronizza, ultima sincronizzazione, "Fatture
  dal …" anticipabile; stato in colonne dedicate di `fic_collegamenti`;
- elenco: data, numero (`number` + `numeration`), cliente, imponibile, IVA, totale,
  prossima scadenza, stato (incassata / parziale / da incassare / scaduta), commesse
  collegate con quota;
- filtri: anno, ricerca, stato; dettaglio con rate e sezione "Incassata con";
- riquadro "N incassi da allineare su FiC" con Riprova tutti.

Sincronizzazione identica a quella dei fornitori (riusa `lib/fic/sincronizza.ts`
generalizzato): `type=invoice` → `fattura`, `type=credit_note` → `nota_credito`
(importi negativi); `fic_updated_at` stringa grezza dell'elenco; eliminazioni solo su
elenco completo; FiC comanda la copia locale.

## Collegare le fatture a una commessa

Scheda commessa → ⋮ → **"Fatture emesse"**. Finestra larga (classi `sm:`/`xl:` come
da `components/ui/dialog.tsx`):

- cliente precompilato dal nome della commessa, ricerca tollerante
  (`fornitoreCorrisponde`); periodo da 2 mesi prima della conferma a oggi;
- per fattura: numero, data, totale, da incassare (FiC), gia' assegnata ad altre
  commesse ("4.000 € su 08-2026"), casella, **quota** (proposta = parte libera,
  modificabile); note di credito col segno meno;
- barra: totale commessa · fatture collegate · mancano (informativa); quota oltre la
  parte libera → avviso, salvabile;
- dopo il salvataggio, se la commessa ha incassi non collegati → proposta storico.

## Incassi

Nella finestra dell'incasso (`DialogAcconto`), se la commessa ha fatture collegate,
sezione **"Fatture pagate da questo incasso"**:

- ripartizione automatica dalla fattura piu' vecchia, su
  `min(quota della commessa non ancora incassata, residuo FiC)`;
- per fattura: totale, da incassare su FiC, ritenuta in fattura, quota modificabile;
- quota proposta con la regola delle ritenute (decisione 3);
- barra di controllo come la fase 2: avvisi con conferma, blocco oltre il residuo.

Scrittura su FiC con il motore della fase 2 generalizzato (presa del collegamento,
intenzione prima del PUT, rilettura, si annulla solo cio' che WinStudio ha scritto):
`PUT /c/{company}/issued_documents/{id}` con il solo `payments_list`, data = data
dell'incasso, conto FiC dal metodo. Modifica → riscrive; eliminazione → annulla prima
(si ferma se FiC non risponde). Stati: `non_scritto` / `scritto` / `da_allineare` /
`da_verificare` / `in_corso`.

**Metodi**: in Impostazioni → Fatture in Cloud, tabella metodo WinStudio (bonifico,
contanti, riba, altro) → conto FiC, precompilata per nome. Senza abbinamento non si
scrive e lo si segnala.

**Storico**: proposta che abbina gli incassi non collegati della commessa alle fatture
in ordine di data (incasso piu' vecchio → fattura piu' vecchia), mostrata come tabella,
confermabile; scrive con le date vere.

## Dati

- `fatture_emesse` + `fatture_emesse_rate`: come le tabelle fornitori; `numero` testo
  composto, `cliente_nome`, `cliente_piva`, `ritenuta` (= `amount_withholding_tax`),
  `fic_dati` senza URL temporanei. RLS sola lettura.
- `commesse_fatture`: `commessa_id` (FK CASCADE), `fic_documento_id`, `tipo_documento`,
  `quota` (con segno), UNIQUE (`commessa_id`, `fic_documento_id`). RLS sola lettura.
- `incassi_fatture`: `acconto_id` (FK `acconti_commessa` ON DELETE RESTRICT),
  `fic_documento_id`, `tipo_documento`, `importo` > 0, `stato_fic`, `messaggio_fic`,
  `scrittura_fic`, `intenzione_fic`, `scritto_at`, UNIQUE (`acconto_id`,
  `fic_documento_id`). RLS sola lettura.
- `fic_collegamenti`: colonne di sincronizzazione delle emesse (`emesse_*`) e
  `metodi_incasso jsonb`.

## Permessi

Scheda Clienti: permesso "Fatture" (`fatture_fornitori`). Collegare fatture e incassi:
scrittura su Commesse e almeno lettura su "Fatture". Controlli lato server.

## Test

Logica pura: quota libera di una fattura divisa fra commesse; ripartizione di un
incasso con ritenute (11%, 4% con e senza ritenuta in fattura); proposta storico;
abbinamento metodi per nome; mappatura documento emesso (numero composto, note di
credito negative). Il motore di scrittura e' quello gia' testato della fase 2.

Prove reali: scrittura/ripristino su una fattura emessa scelta dall'utente (verifica del
permesso di scrittura del token), poi una commessa vera con fatture, incasso, verifica
su FiC, eliminazione e riverifica.
