# Contabilità di commessa (Fatture in Cloud, fase 3)

Data: 2026-10-04
Fasi precedenti: `2026-09-28-fatture-in-cloud-collegamento-design.md` (fatture fornitori),
`2026-10-03-fatture-in-cloud-pagamenti-design.md` (pagamenti).

## Obiettivo

Una **pagina contabile per ogni commessa** che sostituisce il foglio Excel usato oggi
(modello: `Calcolo Costi-Utili Comm ACUVA.xlsx`, commessa ACUVA 09-2026): costi reali
dei materiali presi dalle **fatture d'acquisto FiC articolo per articolo**, costi a
mano, manodopera, costi fissi, stima e utile.

La fattura serve solo a fornire **articoli e prezzi**: l'operatore apre la fattura,
spunta gli articoli che appartengono alla commessa e ne decide la quantità. La stessa
fattura, e lo stesso articolo, possono essere usati per più commesse.

## Il modello Excel (da riprodurre)

- testata: cliente, numero commessa, preventivo, **totale lavoro IVA esclusa**
  (ACUVA: 37.720 €);
- righe di costo: fornitore, numero documento, importo diviso nelle categorie
  **Barre o similari, Accessori, Accessori secondari, Riempimenti vari, Spese
  accessorie, Carburanti e trasporti, Noleggi attrezzature, Altro/Imprevisti**;
- **costi fissi di commessa** = 5% × (materiali e spese + manodopera);
- **manodopera** Posa / Produzione / Altro = persone × giorni × 70 € (a persona al giorno);
- totale costi sostenuti = materiali e spese + costi fissi + manodopera;
- **utile reale** = totale lavoro − totale costi; percentuale = utile ÷ totale costi;
- **stima costi** per categoria e utile stimato.

## Decisioni prese con l'utente

1. Riga di fattura **divisibile per quantità**: spuntando un articolo si propone tutta
   la quantità ancora libera, la cella è modificabile.
2. **Pezzi già usati si consumano**: aprendo la fattura da un'altra commessa si propone
   il rimanente e si mostra dove sono gli altri ("6 su ACUVA 09-2026"). Superarlo dà un
   avviso, non un blocco.
3. **Categoria proposta** dall'ultimo uso dello stesso codice articolo, sempre
   modificabile. Categorie identiche all'Excel.
4. **Costi a mano** ammessi (scontrini, noleggi in contanti, imprevisti), con foto
   facoltativa.
5. **Manodopera**: persone × giorni × tariffa giornaliera a persona (70 € in
   Impostazioni, modificabile per commessa), con **proposta dal cronometro** delle
   attività (ore ÷ 8).
6. **Stima** dal preventivo WinStudio se collegato, correggibile; a mano per categoria
   altrimenti.
7. **Costi fissi**: percentuale in Impostazioni (5%), modificabile per commessa.
8. **Permessi**: chi ha il permesso **Commesse** (lettura per vedere, scrittura per
   modificare), da qualunque lato entri. Chi ha solo Produzione non la vede.
9. **Statistiche invariate** per ora: un blocco "Costi e utili reali" si aggiunge in
   una fase successiva, quando ci saranno dati.
10. **Pagina vera** con il suo indirizzo, non una finestra.

## Cosa non fa

- nessuna modifica a statistiche, scadenze, pagamenti FiC, flusso di cassa, costi
  mensili;
- nessuna scrittura su Fatture in Cloud;
- nessun collegamento automatico fattura → commessa: decide sempre l'operatore;
- i tre campi manuali esistenti su `commesse` (`costo_materiali_manuale`,
  `costo_manodopera_manuale`, `utile_manuale`) restano com'erano e alimentano solo le
  statistiche di oggi.

## Pagina

Indirizzo: `/commesse/contabilita/[commessaId]`. Pulsante **"Contabilità"** nella scheda
commessa (lato Commesse: `DialogSchedaCommessa`/`TabellaCommesse`) e nella pagina della
commessa in Produzione (`/produzione/[commessaId]`), visibile solo con almeno la lettura
su `commesse`. `requireAccesso('commesse')` sulla pagina.

Dall'alto in basso:

1. **Testata**: cliente, numero commessa, preventivo collegato, **totale lavoro IVA
   esclusa** (`totale_finale − iva_totale` della commessa). Riquadri: **totale costi**,
   **utile reale** (€ e %), **utile stimato** (€ e %), **differenza** stimato/reale.
2. **Materiali e spese**: riga dei **totali per categoria**; sotto, l'**elenco dei
   documenti** (fornitore, numero, data, totale attribuito) apribile sugli articoli
   (descrizione, quantità, prezzo, importo, categoria); i costi a mano nello stesso
   elenco con etichetta "manuale" e foto. Pulsanti **"Aggiungi da fattura"** e
   **"Aggiungi costo a mano"**. Avviso sulle righe la cui fattura FiC è cambiata.
3. **Manodopera**: righe Posa / Produzione / Altro con persone, giorni (decimali, es.
   2,5), tariffa, costo; accanto la proposta dal cronometro con **"Usa"**.
4. **Costi fissi**: percentuale (di Impostazioni o della commessa) × (materiali e spese +
   manodopera).
5. **Stima**: categorie + manodopera, importi stimati, scostamento dal reale.

Su telefono e tablet le tabelle diventano schede impilate.

Tutti gli importi sono **IVA esclusa** (il `net_price` degli articoli FiC è già netto).

## Finestra "Aggiungi da fattura"

**Passo 1 — scegli il documento.** Ricerca per fornitore o numero; periodo "dal … al …"
come nella finestra dei pagamenti, iniziale **da 2 mesi prima della `data_conferma`
della commessa a oggi**, applicato all'uscita dal campo. Ogni documento mostra
fornitore, numero, data, totale e "articoli ancora liberi" (in grigio se tutto
attribuito). Compaiono anche le **note di credito**: i loro articoli entrano con
importo negativo.

**Passo 2 — scegli gli articoli.** Le righe di `fic_dati.items_list` del documento:

| Colonna | Note |
|---|---|
| casella | spunta |
| codice, descrizione | `code`, `name` |
| quantità in fattura | `qty` + `measure` |
| già usata altrove | somma per commessa delle altre attribuzioni ("6 su ACUVA 09-2026") |
| quantità per questa commessa | proposta = rimanente, modificabile (decimali ammessi: metri, kg) |
| prezzo unitario netto | `net_price` (negativo per le note di credito) |
| importo | quantità × prezzo, al centesimo |
| categoria | proposta dall'ultimo uso dello stesso `code`, modificabile |

Totale in fondo. Quantità oltre il rimanente → riga arancione "ne restano X, ne stai
attribuendo Y", salvabile. Righe senza prezzo o senza quantità (riferimenti DDT, note)
in grigio, non selezionabili. Riaprendo un documento già usato le righe attribuite sono
spuntate con le loro quantità; togliere la spunta elimina l'attribuzione.

## Dati

Migrazione unica. RLS per organizzazione su tutte le tabelle nuove; scritture dalle
Server Action con controllo del permesso.

### `costi_commessa`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid | DEFAULT `get_user_organization_id()` |
| `commessa_id` | uuid NOT NULL | FK `commesse` ON DELETE CASCADE |
| `origine` | text | CHECK `fattura` / `manuale` |
| `categoria` | text NOT NULL | CHECK nelle 8 categorie |
| `descrizione` | text NOT NULL | copia di `name` o testo libero |
| `quantita` | numeric(12,3) | attribuita (null per i manuali) |
| `importo` | numeric(12,2) NOT NULL | quantità × prezzo, o importo a mano; negativo per NC |
| `fic_documento_id` | bigint | solo origine fattura |
| `fic_riga_id` | bigint | `items_list[].id` |
| `tipo_documento` | text | `fattura` / `nota_credito` |
| `fornitore_nome`, `numero_documento` | text | copia |
| `data_documento` | date | copia |
| `codice` | text | copia di `code` |
| `unita` | text | copia di `measure` |
| `quantita_fattura` | numeric(12,3) | copia di `qty` al momento dell'attribuzione |
| `prezzo_unitario` | numeric(12,4) | copia di `net_price` (con segno) |
| `foto_path` | text | solo manuali, bucket `commesse-docs` |
| `created_at`, `updated_at` | timestamptz | |

UNIQUE (`commessa_id`, `fic_documento_id`, `fic_riga_id`) dove `origine = 'fattura'`.
Indici su `commessa_id` e (`organization_id`, `fic_documento_id`). Dato solo WinStudio:
la sincronizzazione FiC non lo tocca.

### `contabilita_commessa`

| Colonna | Tipo | Note |
|---|---|---|
| `commessa_id` | uuid PK | FK `commesse` ON DELETE CASCADE |
| `organization_id` | uuid | |
| `posa_persone`, `posa_giorni` | numeric | |
| `produzione_persone`, `produzione_giorni` | numeric | |
| `altro_persone`, `altro_giorni` | numeric | |
| `tariffa_giornaliera` | numeric(10,2) | null = Impostazioni |
| `perc_costi_fissi` | numeric(5,2) | null = Impostazioni |
| `stima` | jsonb | importi per categoria + `manodopera` + `materiali_preventivo` |
| `updated_at` | timestamptz | |

### `settings` — due colonne

`tariffa_manodopera_giornaliera numeric(10,2) NOT NULL DEFAULT 70`,
`perc_costi_fissi numeric(5,2) NOT NULL DEFAULT 5`. Modificabili in Impostazioni,
scheda "Preventivi e altro".

## Calcoli (logica pura, `lib/contabilita-commessa.ts`)

- `totaliPerCategoria(costi)` → importi per le 8 categorie e totale materiali e spese;
- `costoManodopera(voci, tariffa)` → per voce e totale (persone × giorni × tariffa);
- `costiFissi(base, perc)`;
- `riepilogo(totaleLavoro, materiali, manodopera, perc)` → totale costi, utile, **ricarico
  sui costi** (utile ÷ costi, come l'Excel), **margine sul lavoro** (utile ÷ totale
  lavoro), imprevisti (= categoria Altro/Imprevisti);
- `rimanente(qtaFattura, attribuzioniAltrove)` e avviso di superamento;
- `propostaCronometro(eventi)` → giorni per voce: `posa` → Posa, `lavorazione` →
  Produzione, `carico`/`ricez_*`/`rilievo_misure` → Altro; secondi ÷ 3600 ÷ 8,
  arrotondato al quarto di giornata; gli altri tipi esclusi;
- `categoriaProposta(codice, storico)` → ultima categoria usata per lo stesso codice;
- `confrontoFattura(salvato, rigaAttuale)` → `null` | "prezzo cambiato su FiC" |
  "quantità cambiata su FiC" | "riga non più presente";
- `stimaDaPreventivo(costiPreventivo)` → materiali in `materiali_preventivo`, posa in
  manodopera, trasporto in Carburanti e trasporti (riusa `lib/preventivo-costi.ts`);
- arrotondamenti al centesimo sugli importi.

## Test

Vitest sulla logica pura: ogni funzione sopra, con note di credito in negativo,
quantità decimali, rimanente con più commesse, superamento, cronometro (tipi esclusi,
arrotondamento), categoria proposta (nessuno storico, storico multiplo), confronto
fattura (tre casi), percentuali con totale lavoro zero.

Prova reale: rifare la commessa **ACUVA 09-2026** (imponibile 37.720 €) con le fatture
del foglio Excel (Edilsider 1F/4205, 1F/4887, 1F/4701; Profilsider 2F/3490, 2F/3621,
2F/3327) e confrontare totali per categoria, costi fissi, manodopera e utile.
