# Calendario digitale — specifica di progetto

Data: 2026-08-19
Stato: approvata, da implementare

---

## 1. Obiettivo

Un unico archivio di eventi con **due visualizzazioni** e **una visibilità decisa evento per evento**.

| Livello | Dove guarda | Cosa vede |
|---|---|---|
| **Amministrazione** | `/calendario` (pagina propria) + riquadro in dashboard | Vista stile Google (mese / settimana / giorno). Solo gli eventi con `visibile_amministrazione = true`. |
| **Produzione** | `/produzione`, scheda "Calendario" | Gantt mensile giorni × ore, riproduzione del foglio `Calendario A.L.M. WP` usato oggi in officina. Solo gli eventi con `visibile_produzione = true`. |
| **Clienti** | nessun accesso | Il cliente **non vede il calendario**. Riceve, a comando, una notifica email o WhatsApp per gli appuntamenti che lo riguardano. |

Il principio che governa tutto: **la visibilità è una proprietà del singolo evento, non del calendario**. Un evento nasce con i flag impostati secondo dove lo crei, e li ribalti a mano quando serve. Non esiste riversamento automatico da una vista all'altra, perché renderebbe illeggibile l'agenda dell'amministrazione.

---

## 2. Modello dati

### 2.1 `eventi_calendario`

Tabella unica. Le due viste sono due filtri su di essa.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL | RLS via `get_user_organization_id()` |
| `tipo` | text NOT NULL | vedi §2.2 |
| `titolo` | text | Usato da `impegno_interno` e `promemoria`; per gli altri tipi l'etichetta si compone da tipo + fornitore + cliente |
| `data` | date NOT NULL | |
| `ora_inizio` | time NOT NULL | |
| `ora_fine` | time NOT NULL | `ora_fine > ora_inizio`, vincolo CHECK |
| `tutto_il_giorno` | boolean NOT NULL default false | Per scadenze e chiusure: nella vista admin va nella fascia alta, nel Gantt occupa l'intera riga |
| `commessa_id` | uuid FK → `commesse` ON DELETE SET NULL | |
| `cliente_id` | uuid FK → `clienti` ON DELETE SET NULL | |
| `cliente_nome` | text | **Snapshot testuale.** Nel gestionale esistono clienti fuori anagrafica (vedi gotcha noto): l'etichetta `---CLIENTE---` deve funzionare anche senza `cliente_id` |
| `fornitore_id` | uuid FK → `fornitori` ON DELETE SET NULL | Per le ricezioni |
| `ordine_id` | uuid FK → `ordini_fornitore` ON DELETE SET NULL | Ricezione materializzata da un ordine |
| `scadenza_id` | uuid FK → `scadenze` ON DELETE CASCADE | Scadenza portata in calendario |
| `catena_id` | uuid | Lega i giorni di una lavorazione continuativa (§2.3) |
| `confermato_cliente` | boolean NOT NULL default false | La scritta rossa `CONFERMATO CON IL CLIENTE` |
| `note` | text | `trasferta`, `(CONSEGNAMO NOI)`, ecc. |
| `visibile_produzione` | boolean NOT NULL | |
| `visibile_amministrazione` | boolean NOT NULL | |
| `stato` | text NOT NULL default `'programmato'` | `programmato` \| `completato` \| `annullato` |
| `avvisato_email_at` | timestamptz | Ultimo avviso email al cliente |
| `avvisato_whatsapp_at` | timestamptz | Ultimo avviso WhatsApp |
| `created_by` | uuid | |
| `created_at`, `updated_at` | timestamptz | |

**Indici:** `(organization_id, data)`, `(organization_id, visibile_produzione, data)`, `(organization_id, visibile_amministrazione, data)`, `(commessa_id)`, `(ordine_id)`, `(catena_id)`.

**Vincolo di unicità parziale:** `UNIQUE (ordine_id) WHERE ordine_id IS NOT NULL` e `UNIQUE (scadenza_id) WHERE scadenza_id IS NOT NULL` — un ordine genera al massimo una ricezione, una scadenza compare al massimo una volta.

### 2.2 Tipi di evento e colori

I colori derivano dal `tipo` e non sono scelti a mano: la legenda del foglio in officina resta valida.

**Produzione** (default: `visibile_produzione = true`, `visibile_amministrazione = false`)

| `tipo` | Etichetta | Colore |
|---|---|---|
| `ricez_alluminio` | Ricez. Alluminio | blu `#6699CC` |
| `lavorazione` | Lavorazione | arancione `#FF8C00` |
| `ricez_vetri` | Ricez. Vetri | ciano `#00E5EE` |
| `ricez_accessori` | Ricez. Accessori | grigio `#C8C8C8` |
| `carico` | Carico/Imballo/Trasp. | giallo `#FFFF00` |
| `posa` | Posa/Consegna | verde `#A6D64B` |

**Amministrazione** (default: `visibile_amministrazione = true`, `visibile_produzione = false`)

| `tipo` | Etichetta | Note |
|---|---|---|
| `appuntamento` | Appuntamento cliente | Sopralluogo, rilievo, firma preventivo, showroom. È l'unico tipo che abilita le notifiche cliente |
| `impegno_interno` | Impegno interno | Ferie, permessi, riunioni, manutenzioni |
| `promemoria` | Promemoria | Senza cliente né commessa: titolo, data/ora, note |
| `scadenza` | Scadenza | Sola lettura, specchio di una riga di `scadenze`. Sempre `tutto_il_giorno` |

I default sono solo default: qualunque evento può essere reso visibile all'altra vista spuntando il flag nel dialog.

### 2.3 Lavorazioni su più giorni

Una lavorazione che prosegue per giorni è **una riga per giorno**, tutte con lo stesso `catena_id`. Fedele al foglio esistente, dove ogni giornata ha i suoi orari, e semplice da disegnare: il connettore verticale a sinistra del Gantt è il rendering della catena.

Regole:
- Creando una lavorazione su N giorni si generano N righe con `catena_id` comune, saltando i giorni chiusi.
- Spostare **una** barra modifica solo quella riga; la catena si ridisegna.
- Eliminare una barra chiede se togliere solo quel giorno o l'intera catena.

### 2.4 `chiusure`

| Colonna | Tipo |
|---|---|
| `id` | uuid PK |
| `organization_id` | uuid NOT NULL |
| `data_inizio` | date NOT NULL |
| `data_fine` | date NOT NULL (uguale a `data_inizio` per un giorno solo) |
| `descrizione` | text NOT NULL (`Natale`, `Ferie estive`) |
| `created_at` | timestamptz |

### 2.5 Orari di lavoro — colonna su `settings`

Colonna JSONB `orari_lavoro` sulla tabella `settings` già esistente, dove stanno le altre impostazioni dell'organizzazione. Forma: array di 7 elementi indicizzati `0 = lunedì … 6 = domenica`.

```ts
type OrarioGiorno = {
  aperto: boolean
  apertura: string   // 'HH:MM'
  chiusura: string   // 'HH:MM'
}
```

Default alla migration (ricavato dal foglio esistente): lun–ven `08:00–19:00`, sabato `08:00–12:30`, domenica chiuso.

Le colonne orarie del Gantt **nascono da qui**, non sono scritte nel codice: se l'apertura passa alle 07:30 la griglia parte da lì.

### 2.6 `fornitori.categoria_calendario`

Colonna text nullable su `fornitori`: `alluminio` | `vetri` | `accessori`. Decide quale dei tre tipi di ricezione nasce da un ordine di quel fornitore. Si imposta una volta nell'anagrafica fornitori. Se è NULL, la coda propone `ricez_accessori` e chiede conferma.

---

## 3. La coda "da pianificare"

Nessuna generazione automatica silenziosa. L'automatismo **propone**, non **impone**: un evento esiste solo dopo che è stato collocato. Così non c'è nulla che possa desincronizzarsi.

La colonna a lato del Gantt raccoglie ciò che aspetta una collocazione:

- **Commesse aperte** (`stato` in `STATI_COMMESSA_APERTI`) prive di eventi `lavorazione` / `posa` / `carico`. Mostrano numero commessa, cliente e quali dei tre tipi mancano.
- **Ordini fornitore** in stato `ordinato` con `data_consegna_prevista` valorizzata e senza evento collegato. Mostrano fornitore, numero ordine e data prevista.

Trascinando un elemento sulla griglia si apre il dialog con tipo, orari e riferimenti già compilati; al salvataggio nasce l'evento e l'elemento esce dalla coda.

La coda è **calcolata**, non memorizzata: è semplicemente l'assenza di eventi collegati. Nessuna colonna nuova su `commesse` o `ordini_fornitore`, e nessuno stato da tenere allineato. Chi non vuole pianificare una commessa la lascia dov'è; l'ordinamento per data la spinge in fondo.

---

## 4. Vista Produzione — Gantt

Percorso: `/produzione`, nuova scheda "Calendario" accanto al cruscotto esistente.

### 4.1 Struttura

- **Righe = giorni del mese**, altezza variabile secondo il numero di barre impilate.
- **Colonne = ore**, dall'apertura minima alla chiusura massima della settimana (§2.5), passo 30 minuti per lo snap, etichette all'ora piena.
- **Barre** posizionate e larghe secondo `ora_inizio` / `ora_fine`, impilate verticalmente quando si sovrappongono.
- Etichetta barra: `Tipo` + fornitore quando c'è + `---CLIENTE---`, poi `CONFERMATO CON IL CLIENTE` in rosso corsivo se `confermato_cliente`, poi le note.

### 4.2 Giorni chiusi e mezze giornate

Letti dalle impostazioni, mai scritti nel codice:

- **Giorno chiuso** (domenica o data in `chiusure`) → riga rossa piena con la descrizione (`CHIUSO — Natale`). Nessuna barra collocabile: il drop viene rifiutato con un messaggio.
- **Mezza giornata** (sabato, chiusura alle 12:30) → la fascia oltre l'orario di chiusura è grigia. Il drop è permesso ma avvisa che è fuori orario.

### 4.3 Interazione

- **Trascinamento** della barra: cambia giorno e ora. `@dnd-kit`, già in uso in `ScadenzeView`.
- **Ridimensionamento** dai bordi: cambia la durata.
- **Clic**: apre il dialog evento.
- **Snap** a 30 minuti.
- Chi ha `produzione = 'lettura'` vede tutto ma non trascina e non modifica.

### 4.4 Stampa

Stampa A4 orizzontale che riproduce il foglio appeso in officina: intestazione con mese, logo e legenda, una pagina per blocco di giorni. Segue il pattern dei componenti di stampa esistenti (`SchedaScadenzaStampa`, `StampaCommessa`).

### 4.5 Mobile

Sotto i 900px la griglia oraria non è leggibile. La vista diventa un **elenco per giorno** con gli stessi colori e le stesse etichette, ordinato per ora. Il Gantt resta su desktop e tablet, dove viene usato davvero.

---

## 5. Vista Amministrazione

Percorso: `/calendario`, voce in barra laterale con icona `CalendarDays`.

- **Mese / settimana / giorno**, come Google.
- Mese: celle con i primi N eventi e `+n altri`.
- Settimana e giorno: griglia oraria con gli eventi posizionati, fascia alta per gli eventi `tutto_il_giorno`.
- Clic su uno slot vuoto → creazione. Clic su un evento → dettaglio.
- Mostra **solo** `visibile_amministrazione = true`.

**Riquadro in dashboard**: "Prossimi impegni", i prossimi 7 giorni in forma di elenco compatto, con collegamento alla pagina intera. Rispetta il permesso `calendario`: chi non ce l'ha non lo vede.

**Scadenze**: nel modulo Commesse ogni scadenza guadagna una spunta *"Mostra in calendario"*. Spuntandola nasce un evento `scadenza` collegato (`scadenza_id`), `tutto_il_giorno`, sola lettura, che si aggiorna con la scadenza e sparisce togliendo la spunta o cancellando la scadenza (`ON DELETE CASCADE`).

---

## 6. Notifiche al cliente

Solo per eventi di tipo `appuntamento` con un recapito disponibile.

- **Invia email** — Resend, testo già composto con data, ora, luogo e riferimento commessa. Registra `avvisato_email_at`.
- **WhatsApp** — apre `wa.me` col messaggio precompilato, come già avviene per il link di firma. Registra `avvisato_whatsapp_at`.

Entrambi sono **a comando**: nessun invio automatico, nessun cron. Correggere l'orario di un appuntamento non deve generare email a raffica. Il dialog mostra quando e su quale canale il cliente è stato avvisato l'ultima volta.

**Nessuna pagina pubblica per il cliente.** Il requisito è che non veda il calendario, quindi non se ne costruisce una.

---

## 7. Permessi

Nuovo modulo `calendario` in `types/permessi.ts`, da aggiungere in **quattro punti**: `MODULI_APP`, `MODULO_LABELS`, `PERMESSI_ADMIN`, `PERMESSI_VUOTI`. In più:

- voce in `components/layout/Sidebar.tsx` (`/calendario`, `modulo: 'calendario'`);
- riga in `MODULO_HOME` dentro `lib/permessi.ts`, altrimenti `primoModuloAccessibile` non sa dove mandare chi ha solo questo modulo — è lo stesso inciampo già visto con la dashboard;
- `requireAccesso('calendario')` nella pagina, `requireAccesso('calendario', 'scrittura')` per le action di mutazione.

Il Gantt **non** ha un permesso proprio: sta sotto `produzione`, che viene già assegnato. `lettura` guarda, `scrittura` modifica.

RLS su `eventi_calendario` e `chiusure` con `get_user_organization_id()`, come tutte le altre tabelle.

---

## 8. Struttura dei file

```
supabase/migrations/
  20260819HHMMSS_calendario.sql        eventi_calendario, chiusure,
                                       settings.orari_lavoro,
                                       fornitori.categoria_calendario, RLS

types/calendario.ts                    TipoEvento, EventoCalendario, EventoInput,
                                       OrarioGiorno, Chiusura, VoceDaPianificare

lib/calendario.ts                      logica pura, niente React né Supabase:
                                       giornoAperto, fasciaOraria, slotDaOra,
                                       impilaEventi, coloreTipo, etichettaEvento,
                                       espandiCatena
lib/calendario.test.ts                 test Vitest

actions/calendario.ts                  getEventi, createEvento, updateEvento,
                                       deleteEvento, spostaEvento,
                                       getVociDaPianificare, getOrariLavoro,
                                       setOrariLavoro, CRUD chiusure,
                                       avvisaClienteEmail

components/calendario/
  GrigliaGantt.tsx                     griglia giorni × ore (Produzione)
  BarraEvento.tsx                      singola barra, drag e resize
  CodaDaPianificare.tsx                colonna laterale
  ListaGiorniMobile.tsx                fallback sotto i 900px
  StampaGantt.tsx                      stampa A4 orizzontale
  CalendarioMese.tsx                   vista mese (Amministrazione)
  CalendarioSettimana.tsx              vista settimana e giorno
  DialogEvento.tsx                     creazione e modifica, flag visibilità,
                                       pulsanti notifica
  ProssimiImpegni.tsx                  riquadro dashboard

app/(dashboard)/calendario/page.tsx    vista Amministrazione
app/(dashboard)/impostazioni/          sezione "Orari di lavoro" + chiusure
```

La logica pura in `lib/calendario.ts` è la parte dove gli errori si nascondono meglio — slot, sovrapposizioni, giorni chiusi — e va coperta da test Vitest, che il progetto ha già.

---

## 9. Fasi

| Fase | Contenuto | Criterio di completamento |
|---|---|---|
| **1 — Fondamenta** | Migration, `types/calendario.ts`, `lib/calendario.ts` + test, action CRUD, modulo permessi, sezione Orari e chiusure in Impostazioni, campo categoria sul fornitore | Orari e chiusure si impostano e si rileggono. Le action creano e leggono eventi. Nessuna UI calendario. |
| **2 — Gantt Produzione** | Griglia, barre, colori, chiusure e mezze giornate, catene multi-giorno, coda da pianificare, drag e resize, fallback mobile, stampa | Il foglio appeso in officina si genera dal gestionale. |
| **3 — Vista Amministrazione** | Mese, settimana, giorno, dialog evento, flag di visibilità, scadenze spuntate, riquadro in dashboard | L'agenda esiste e si decide cosa vedere della produzione. |
| **4 — Notifiche** | Email Resend, WhatsApp, registrazione invii | Il cliente si avvisa dall'evento. |

La fase 2 è la più grossa ed è anche quella che dà subito valore.

---

## 10. Decisioni prese, da non ribaltare senza motivo

1. **La visibilità sta sull'evento, non sul calendario.** Due flag booleani, nessun riversamento automatico.
2. **La coda "da pianificare" sostituisce la generazione automatica.** Gli eventi nascono solo quando qualcuno li colloca.
3. **Una riga per giorno** per le lavorazioni lunghe, legate da `catena_id`. Non un intervallo `data_inizio`–`data_fine`.
4. **Orari e chiusure vivono nelle impostazioni**, mai nel codice. Domenica rossa e sabato mezza giornata sono conseguenze, non regole scritte a mano.
5. **Il colore deriva dal tipo.** Nessun colore libero per evento: la legenda deve restare vera.
6. **Notifiche solo a comando.** Niente cron, niente invii automatici allo spostamento.
7. **Nessuna libreria calendario.** Il Gantt giorni × ore non esiste in nessuna libreria e va scritto comunque; prenderne una per la sola vista mese lascerebbe due sistemi di trascinamento da mantenere.
8. **`cliente_nome` è uno snapshot testuale** accanto a `cliente_id`, perché esistono clienti fuori anagrafica.
