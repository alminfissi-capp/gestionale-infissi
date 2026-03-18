# PRD — Gestionale Infissi A.L.M.

**Versione:** 2.0 — Marzo 2026
**Scopo:** Documento di riferimento completo per la reimplementazione del sistema su qualsiasi stack tecnologico.

---

## 1. Panoramica

Gestionale web per aziende installatrici di infissi. Permette di creare preventivi, gestire clienti e listini prezzi, stampare documenti interni ed esterni, e condividere offerte con i clienti tramite link pubblico.

**Utenti target:** operatori interni dell'azienda. I clienti finali accedono solo alla visualizzazione pubblica del preventivo (link condivisione, senza login).

**Modello di accesso:** multi-tenant. Ogni azienda ha i propri dati completamente isolati.

---

## 2. Autenticazione e Multi-tenancy

### 2.1 Struttura utenti
- Ogni **utente** appartiene a una **organization** (1:1 attualmente, struttura pronta per multi-utente)
- Ruoli: `admin`, `operator`
- Tabella `profiles` collega l'utente autenticato alla sua organizzazione

### 2.2 Isolamento dati
- Ogni tabella ha colonna `organization_id`
- Tutte le query filtrano per `organization_id` dell'utente autenticato
- Nessun dato condiviso tra organizzazioni diverse

### 2.3 Accesso pubblico
- I preventivi possono essere condivisi via **share token** (UUID univoco)
- La rotta pubblica `/p/{token}` non richiede autenticazione
- Al primo accesso del cliente viene salvato `visualizzato_at` (timestamp)
- Il link può essere revocato (share_token → NULL)

---

## 3. Modulo Impostazioni

**Una sola riga per organizzazione** nella tabella `settings`.

### 3.1 Dati azienda
| Campo | Descrizione |
|-------|-------------|
| `denominazione` | Ragione sociale |
| `indirizzo` | Sede legale / operativa |
| `piva` | Partita IVA |
| `codice_fiscale` | |
| `telefono` | |
| `email` | |
| `logo_url` | Percorso file logo su storage privato |

### 3.2 Aliquote IVA
- Array configurabile: default `[22, 10, 4]`
- Ogni articolo di un preventivo può avere aliquota diversa
- Il sistema calcola riepilogo IVA raggruppato per aliquota

### 3.3 Numerazione automatica preventivi
**Formato generato:** `{prefisso} {nn}_{anno}` oppure `{prefisso} {nn}_{anno} {operatore}`
**Esempio:** `PRE WIN 23_2026 G`

| Campo | Descrizione |
|-------|-------------|
| `num_prefisso` | es. `PRE WIN` — se NULL la numerazione è manuale |
| `num_operatore` | es. `G` — lettera operatore (opzionale) |
| `num_contatore` | Progressivo corrente (intero) |
| `num_anno` | Anno di riferimento — se cambia → reset contatore a 1 |
| `num_padding` | Cifre del progressivo (default 2: "01", "02"...) |
| `num_prefisso_calcoli` | Titolo del foglio calcoli interni (default: "Calcoli interni") |

**Regola reset:** se l'anno corrente ≠ `num_anno` → `num_contatore = 1`, `num_anno = anno_corrente`.

**Atomicità:** il contatore deve essere incrementato in modo atomico (transazione/lock) per evitare duplicati con più operatori simultanei.

### 3.4 Trasporto
| Campo | Default | Descrizione |
|-------|---------|-------------|
| `soglia_pezzi_trasporto` | 10 | Pezzi oltre cui scatta il costo variabile |
| `costo_trasporto_fisso` | €350 | Costo fisso per 1..soglia pezzi |
| `costo_trasporto_pezzo` | €30 | Costo aggiuntivo per ogni pezzo oltre soglia |

### 3.5 Template note
- Lista di note predefinite riutilizzabili nei preventivi
- Ordine personalizzabile

---

## 4. Modulo Clienti

### 4.1 Tipi
- `privato` → nome + cognome (almeno uno obbligatorio)
- `azienda` → ragione sociale obbligatoria

### 4.2 Campi
| Campo | Note |
|-------|------|
| `tipo` | `privato` \| `azienda` |
| `ragione_sociale` | Solo aziende |
| `nome`, `cognome` | Privati |
| `telefono`, `email` | |
| `via`, `civico`, `cap`, `citta`, `provincia`, `nazione` | Indirizzo strutturato |
| `indirizzo` | Campo legacy testuale (retrocompatibilità) |
| `cantiere` | Riferimento cantiere / commessa |
| `cf_piva` | Codice fiscale o P.IVA |
| `codice_sdi` | Codice destinatario fatturazione elettronica |
| `note` | Note interne |

### 4.3 Ricerca
- Full-text su nome, cognome, cf_piva
- Lista ordinata per data creazione decrescente

---

## 5. Modulo Listini

I listini sono organizzati in **categorie**. Ogni categoria può essere di tipo `griglia` o `libero`.

### 5.1 Categorie listini
- `nome`, `icona` (emoji), `ordine`
- `tipo`: `griglia` | `libero`
- Il tipo è selezionabile solo in fase di creazione (non modificabile dopo)

---

### 5.2 Listino a Griglia (tipo = 'griglia')

Per infissi con prezzi da matrice larghezza × altezza.

**Struttura dati:**
| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `tipologia` | TEXT | Nome prodotto es. "Finestra PVC 2 ante" |
| `larghezze` | INT[] | Array misure disponibili in mm, ordinato crescente |
| `altezze` | INT[] | Array misure disponibili in mm, ordinato crescente |
| `griglia` | JSONB | Oggetto `{ "{altezza}_{larghezza}": prezzo_euro }` |
| `immagine_url` | TEXT | Immagine prodotto (opzionale) |
| `sconto_fornitore` | NUMERIC | % sconto acquisto fornitore (per calcolo margini) |

**Esempio griglia:**
```json
{
  "800_600": 120.00,
  "800_800": 145.00,
  "1000_600": 135.00,
  "1000_800": 162.00
}
```

**Algoritmo ricerca prezzo dalla griglia:**
1. L'operatore inserisce larghezza e altezza reali in mm
2. Cerca la prima larghezza nell'array `larghezze` che sia `≥` larghezza inserita
3. Cerca la prima altezza nell'array `altezze` che sia `≥` altezza inserita
4. Se trovate entrambe → legge prezzo da `griglia["{altezza_trovata}_{larghezza_trovata}"]`
5. Se la misura è stata arrotondata → `misura_arrotondata = true`
6. Se nessuna misura copre le dimensioni → prodotto non disponibile (errore)

#### Finiture
Modificatori di prezzo associati al listino:

| Campo | Descrizione |
|-------|-------------|
| `nome` | es. "RAL personalizzato" |
| `aumento` | % di aumento sul prezzo base (es. 15.00) |
| `aumento_euro` | Importo fisso aggiuntivo in € (opzionale) |

`prezzo_con_finitura = prezzo_base × (1 + aumento/100) + aumento_euro`

#### Accessori Griglia
Accessori opzionali associati al listino, raggruppati in **gruppi**:

| Campo | Tipo | Valori |
|-------|------|--------|
| `gruppo` | TEXT | Nome gruppo (es. "Vetro", "Maniglia") |
| `gruppo_tipo` | TEXT | `multiplo` (checkbox) \| `unico` (radio) |
| `nome` | TEXT | Nome accessorio |
| `tipo_prezzo` | TEXT | `pezzo` \| `mq` \| `percentuale` |
| `prezzo` | NUMERIC | Prezzo vendita |
| `prezzo_acquisto` | NUMERIC | Costo acquisto (uso interno) |
| `mq_minimo` | NUMERIC | Superficie minima fatturata (solo per tipo `mq`) |

**Calcolo prezzo accessorio:**
```
tipo 'pezzo':       prezzo
tipo 'mq':          prezzo × max(larghezza_mm × altezza_mm / 1_000_000, mq_minimo)
tipo 'percentuale': prezzo_base_infisso × (valore_percentuale / 100)
```

---

### 5.3 Listino Libero / Catalogo Prodotti (tipo = 'libero')

Per prodotti a prezzo fisso (es. veneziane, zanzariere, accessori).

**Listino libero** (`listini_liberi`): contiene solo `tipologia` e `categoria_id`.

**Prodotti** (`prodotti_listino`):
| Campo | Descrizione |
|-------|-------------|
| `nome` | |
| `prezzo` | Prezzo vendita |
| `prezzo_acquisto` | Costo acquisto (uso interno) |
| `descrizione` | Testo descrittivo opzionale |
| `immagine_url` | |

**Accessori del listino** (`accessori_listino`):
| Campo | Descrizione |
|-------|-------------|
| `nome` | |
| `prezzo` | Prezzo vendita per unità |
| `prezzo_acquisto` | Costo acquisto |

**Calcolo prezzo finale articolo catalogo:**
`prezzo_unitario = prodotto.prezzo + Σ(accessorio.prezzo × qty_selezionata)`

---

## 6. Modulo Preventivi

### 6.1 Struttura preventivo
Un preventivo è composto da:
1. **Intestazione** — numero, cliente, data, stato
2. **Articoli** — righe (da listino griglia, da catalogo, o voce libera)
3. **Totali calcolati** — subtotale, sconto, IVA, trasporto, totale finale
4. **Note** — testo libero
5. **Allegati commerciali** — cataloghi/brochure PDF da allegare alla stampa cliente
6. **Allegati calcoli** — PDF interni da allegare alla stampa calcoli (non visibili al cliente)

### 6.2 Stati preventivo
`bozza` → `inviato` → `accettato` | `rifiutato` | `scaduto`

### 6.3 Snapshot cliente
Al salvataggio, i dati del cliente vengono copiati in `cliente_snapshot` (JSONB). Questo garantisce che le modifiche future al cliente non alterino i preventivi già creati.

Struttura snapshot:
```json
{
  "tipo": "privato",
  "nome": "Mario",
  "cognome": "Rossi",
  "ragione_sociale": null,
  "telefono": "333...",
  "email": "...",
  "via": "Via Roma",
  "civico": "1",
  "cap": "20100",
  "citta": "Milano",
  "provincia": "MI",
  "nazione": "Italia",
  "cantiere": "Villa Bianchi",
  "cf_piva": "RSSMRA...",
  "codice_sdi": "ABC123"
}
```

### 6.4 Tipi di articolo

#### Tipo `listino` — da listino a griglia
| Campo | Descrizione |
|-------|-------------|
| `listino_id` | Riferimento listino |
| `larghezza_mm`, `altezza_mm` | Dimensioni inserite dall'operatore |
| `larghezza_listino_mm`, `altezza_listino_mm` | Dimensioni effettive usate dalla griglia |
| `misura_arrotondata` | true se arrotondata |
| `finitura_nome`, `finitura_aumento`, `finitura_aumento_euro` | Finitura applicata |
| `accessori_griglia` | JSONB array accessori selezionati |
| `prezzo_base` | Prezzo dalla griglia (prima di finitura) |
| `prezzo_unitario` | prezzo_base + finitura + accessori |
| `costo_acquisto_unitario` | Calcolato con sconto fornitore |
| `costo_posa` | Costo manodopera installazione (uso interno) |
| `aliquota_iva` | |

#### Tipo `listino_libero` — da catalogo prodotti
| Campo | Descrizione |
|-------|-------------|
| `listino_libero_id`, `prodotto_id` | Riferimenti |
| `accessori_selezionati` | JSONB array: `[{ id, nome, prezzo, prezzo_acquisto, qty }]` |
| `prezzo_unitario` | Calcolato: prodotto.prezzo + Σ(acc.prezzo × acc.qty) |
| `larghezza_mm`, `altezza_mm` | NULL (non applicabili) |

#### Tipo `libera` — voce libera
| Campo | Descrizione |
|-------|-------------|
| `tipologia` | Testo descrittivo (multiriga, whitespace preservato) |
| `prezzo_unitario` | Inserito manualmente |
| `immagine_url` | Foto opzionale (es. foto del cantiere) |
| Dimensioni, finitura, listino | Tutti NULL |

### 6.5 Calcolo totali (eseguito lato server al salvataggio)

```
subtotale         = Σ(prezzo_totale_riga)          [senza sconto globale]
                    dove prezzo_totale_riga = prezzo_unitario × quantita × (1 - sconto_articolo/100)

importo_sconto    = subtotale × (sconto_globale / 100)
totale_articoli   = subtotale - importo_sconto

spese_trasporto   = calcola_trasporto(totale_pezzi)
                    → 0 pz: €0
                    → 1..soglia pz: costo_fisso
                    → >soglia pz: costo_fisso + (pz - soglia) × costo_per_pezzo

riepilogo_iva     = raggruppa articoli per aliquota, applica sconto proporzionale,
                    ripartisce trasporto proporzionalmente sugli articoli imponibili
                    → [{aliquota, imponibile, iva}]

iva_totale        = Σ(riepilogo_iva[].iva)

totale_finale     = totale_articoli + iva_totale + spese_trasporto  (se modalita='separato')
                  oppure
totale_finale     = totale_articoli + iva_totale                    (se modalita='ripartito',
                                                                     trasporto già incluso nelle righe)

totale_pezzi      = Σ(quantita)
totale_costi_acquisto = Σ(costo_acquisto_unitario × quantita)
```

### 6.6 Modalità trasporto
- `separato` — il trasporto appare come voce distinta nel documento cliente
- `ripartito` — il costo trasporto è distribuito internamente sulle righe, non compare come voce a sé

### 6.7 Sconto
- `sconto_globale` (0–60%) — applicato sul subtotale totale
- `sconto_articolo` (0–50%) — applicato sulla singola riga
- `mostra_sconto_riga` (bool) — controlla se lo sconto per riga appare nel PDF cliente

### 6.8 Duplicazione preventivo
Crea copia identica con:
- Nuovo ID
- Nuovo numero (se numerazione automatica attiva)
- Stato = `bozza`
- Tutti gli articoli copiati

---

## 7. Stampa

Il sistema produce due documenti distinti, ottimizzati per stampa A4 via `window.print()` del browser.

### 7.1 Stampa Preventivo (documento cliente)
| Sezione | Contenuto |
|---------|-----------|
| Intestazione | Logo + dati azienda |
| Cliente | Nome, indirizzo, cantiere |
| Riferimento | Numero preventivo, data |
| Tabella articoli | Descrizione, L×A mm, finitura, qtà, prezzo unitario, sconto riga (se `mostra_sconto_riga`), totale riga |
| Riepilogo | Subtotale, sconto globale, IVA per aliquota, trasporto (se separato), **totale finale** |
| Note | Testo libero |
| Allegati PDF | Ogni catalogo allegato, renderizzato pagina per pagina in coda |
| Footer | Data, numero preventivo, denominazione azienda |

### 7.2 Stampa Calcoli (documento interno riservato)
Marcato in modo evidente: **"DOCUMENTO RISERVATO — USO INTERNO — NON DIVULGARE AL CLIENTE"**

| Sezione | Contenuto |
|---------|-----------|
| Intestazione | Logo + dati azienda |
| Cliente | Nome, cantiere |
| Titolo | Configurabile da `num_prefisso_calcoli` |
| Tabella articoli | Descrizione, qtà, ricavo unitario, C.Acq. unitario, posa unitaria, costo totale riga, margine riga (verde/rosso) |
| Riepilogo economico | Ricavo netto (IVA esclusa), costi acquisto fornitore, costi posa, spese trasporto, **utile lordo** + % sul costo, IVA totale (nota: non è ricavo) |
| Allegati PDF interni | Ogni allegato calcoli, renderizzato pagina per pagina in coda |
| Footer | Data, numero, "USO INTERNO — RISERVATO" |

### 7.3 Rendering PDF allegati per la stampa
Entrambi i documenti possono avere PDF allegati in coda. Il rendering avviene **lato client** tramite libreria pdfjs:
1. Ogni pagina del PDF viene renderizzata su un canvas HTML
2. Il canvas viene convertito in immagine JPEG (qualità 0.92)
3. Ogni immagine occupa una "pagina" nel documento stampato (CSS `page-break-before: always`)
4. Durante il caricamento → spinner visibile ma nascosto in stampa (`print:hidden`)
5. Dopo il rendering → `window.print()` stampa tutto incluse le pagine PDF

---

## 8. Condivisione Pubblica

| Funzione | Dettaglio |
|---------|-----------|
| Generazione token | UUID univoco assegnato al preventivo |
| URL | `https://{dominio}/p/{token}` |
| Autenticazione | Non richiesta |
| Contenuto | Preventivo in sola lettura, senza dati interni (no costi, no margini, no allegati calcoli) |
| Tracking | Al primo accesso → salva `visualizzato_at` |
| Revoca | Share_token → NULL |
| Email | Apertura client email con oggetto/corpo precompilati |
| WhatsApp | Link `wa.me/{numero}` con messaggio precompilato + link preventivo |

---

## 9. Allegati

### 9.1 Cataloghi / Brochure (commerciali)
- Libreria PDF a livello organizzazione (gestita in `/cataloghi`)
- Un catalogo può essere allegato a più preventivi
- Allegati al **preventivo cliente** (stampa cliente)
- Storage: bucket **pubblico** — URL diretto senza autenticazione

### 9.2 Allegati Calcoli (interni)
- PDF specifici per singolo preventivo (preventivi fornitore, dettagli costi, ecc.)
- Allegati al **foglio calcoli** (stampa interna)
- Non visibili al cliente né nel link pubblico
- Storage: bucket **privato** — URL firmati con scadenza 1 ora, generati lato server
- Struttura path: `{org_id}/{preventivo_id}/{uuid}.pdf`

---

## 10. Modulo Rilievo

Tool grafico per disegnare la forma geometrica di un serramento non standard.

### 10.1 Forme serramento (`forme_serramento`)
Libreria di forme configurabili per organizzazione. Ogni forma è descritta da un **shape JSONB**:

```json
{
  "punti": [
    { "id": "p1", "gx": 0.0, "gy": 1.0 },
    { "id": "p2", "gx": 1.0, "gy": 1.0 },
    { "id": "p3", "gx": 0.5, "gy": 0.0 }
  ],
  "segmenti": [
    {
      "id": "s1",
      "fromId": "p1",
      "toId": "p2",
      "tipo": "retta",
      "cpDx": 0, "cpDy": 0,
      "misuraNome": "Larghezza",
      "misuraTipo": "input",
      "misuraFormula": null
    },
    {
      "id": "s2",
      "fromId": "p2",
      "toId": "p3",
      "tipo": "curva",
      "cpDx": 0.1, "cpDy": 0.2,
      "misuraNome": "Freccia",
      "misuraTipo": "calcolato",
      "misuraFormula": "L / 2"
    }
  ],
  "angoliConfig": [
    { "puntoId": "p1", "tipo": "fisso", "gradi": 90 }
  ],
  "chiusa": true
}
```

| Campo | Descrizione |
|-------|-------------|
| `punti[].gx`, `punti[].gy` | Coordinate normalizzate [0–1] relative alla bounding box |
| `segmenti[].tipo` | `retta` \| `curva` (bezier) |
| `segmenti[].misuraTipo` | `input` (inserita dall'operatore) \| `calcolato` (derivata da formula) |
| `angoliConfig[].tipo` | `fisso` (valore noto) \| `automatico` (calcolato) |

**Forme standard pre-configurate disponibili:** Rettangolo, Arco a Tutto Sesto, Arco Ribassato, Arco Rialzato, Arco Gotico, Triangolo Isoscele, Triangolo Equilatero, Casa simmetrica, Casa asimmetrica.

### 10.2 Rilievo vani
- Wizard: nome cantiere, cliente opzionale
- Per ogni vano: selezione forma → inserimento misure → anteprima SVG in tempo reale
- Campi vano: forma scelta, misure inserite (JSONB), note libere
- Il modulo rilievo non è ancora integrato con il modulo preventivi (roadmap futura)

---

## 11. Schema Database Completo

```sql
-- ────────────────────────────────────────────
-- ORGANIZZAZIONI E UTENTI
-- ────────────────────────────────────────────

organizations (
  id          UUID PK,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ
)

profiles (
  id              UUID PK → auth.users,
  organization_id UUID NOT NULL → organizations,
  full_name       TEXT,
  role            TEXT DEFAULT 'operator'  -- 'admin' | 'operator'
)

settings (
  id                        UUID PK,
  organization_id           UUID UNIQUE → organizations,
  denominazione             TEXT,
  indirizzo                 TEXT,
  piva                      TEXT,
  codice_fiscale            TEXT,
  telefono                  TEXT,
  email                     TEXT,
  logo_url                  TEXT,
  aliquote_iva              JSONB DEFAULT '[22, 10, 4]',
  num_prefisso              TEXT,         -- NULL = numerazione manuale
  num_operatore             TEXT,
  num_contatore             INTEGER DEFAULT 0,
  num_anno                  INTEGER DEFAULT 0,
  num_padding               INTEGER DEFAULT 2,
  num_prefisso_calcoli      TEXT,
  soglia_pezzi_trasporto    INTEGER,
  costo_trasporto_fisso     NUMERIC,
  costo_trasporto_pezzo     NUMERIC,
  created_at                TIMESTAMPTZ,
  updated_at                TIMESTAMPTZ
)

note_templates (
  id              UUID PK,
  organization_id UUID → organizations,
  testo           TEXT NOT NULL,
  ordine          INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ
)

-- ────────────────────────────────────────────
-- CLIENTI
-- ────────────────────────────────────────────

clienti (
  id              UUID PK,
  organization_id UUID → organizations,
  tipo            TEXT DEFAULT 'privato',   -- 'privato' | 'azienda'
  ragione_sociale TEXT,
  nome            TEXT,
  cognome         TEXT,
  telefono        TEXT,
  email           TEXT,
  via             TEXT,
  civico          TEXT,
  cap             TEXT,
  citta           TEXT,
  provincia       TEXT,
  nazione         TEXT,
  indirizzo       TEXT,   -- legacy, mantenuto per retrocompatibilità
  cantiere        TEXT,
  cf_piva         TEXT,
  codice_sdi      TEXT,
  note            TEXT,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ,
  CONSTRAINT: (nome IS NOT NULL OR cognome IS NOT NULL) -- solo per privati
)

-- ────────────────────────────────────────────
-- LISTINI
-- ────────────────────────────────────────────

categorie_listini (
  id              UUID PK,
  organization_id UUID → organizations,
  nome            TEXT NOT NULL,
  icona           TEXT DEFAULT '📂',
  tipo            TEXT DEFAULT 'griglia',  -- 'griglia' | 'libero'
  ordine          INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ
)

listini (
  id              UUID PK,
  organization_id UUID → organizations,
  categoria_id    UUID → categorie_listini CASCADE,
  tipologia       TEXT NOT NULL,
  larghezze       INTEGER[],           -- array misure disponibili in mm
  altezze         INTEGER[],           -- array misure disponibili in mm
  griglia         JSONB DEFAULT '{}',  -- { "{alt}_{larg}": prezzo }
  immagine_url    TEXT,
  sconto_fornitore NUMERIC DEFAULT 0,  -- % sconto acquisto
  ordine          INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ,
  UNIQUE(categoria_id, tipologia)
)

finiture (
  id          UUID PK,
  listino_id  UUID → listini CASCADE,
  nome        TEXT NOT NULL,
  aumento     NUMERIC(5,2) DEFAULT 0,      -- % aumento
  aumento_euro NUMERIC(10,2) DEFAULT 0,   -- importo fisso aggiuntivo
  ordine      INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ
)

accessori_griglia (
  id              UUID PK,
  listino_id      UUID → listini CASCADE,
  organization_id UUID,
  gruppo          TEXT DEFAULT '',
  gruppo_tipo     TEXT DEFAULT 'multiplo',   -- 'multiplo' | 'unico'
  nome            TEXT NOT NULL,
  tipo_prezzo     TEXT DEFAULT 'pezzo',      -- 'pezzo' | 'mq' | 'percentuale'
  prezzo          NUMERIC(10,2) DEFAULT 0,
  prezzo_acquisto NUMERIC(10,2) DEFAULT 0,
  mq_minimo       NUMERIC(10,4),
  ordine          INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ
)

listini_liberi (
  id              UUID PK,
  organization_id UUID → organizations,
  categoria_id    UUID → categorie_listini CASCADE,
  tipologia       TEXT NOT NULL,
  ordine          INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ,
  UNIQUE(categoria_id, tipologia)
)

prodotti_listino (
  id                UUID PK,
  organization_id   UUID → organizations,
  listino_libero_id UUID → listini_liberi CASCADE,
  nome              TEXT NOT NULL,
  prezzo            NUMERIC(10,2) DEFAULT 0,
  prezzo_acquisto   NUMERIC(10,2) DEFAULT 0,
  descrizione       TEXT,
  immagine_url      TEXT,
  ordine            INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ
)

accessori_listino (
  id                UUID PK,
  organization_id   UUID → organizations,
  listino_libero_id UUID → listini_liberi CASCADE,
  nome              TEXT NOT NULL,
  prezzo            NUMERIC(10,2) DEFAULT 0,
  prezzo_acquisto   NUMERIC(10,2) DEFAULT 0,
  ordine            INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ
)

-- ────────────────────────────────────────────
-- PREVENTIVI
-- ────────────────────────────────────────────

preventivi (
  id                    UUID PK,
  organization_id       UUID → organizations,
  cliente_id            UUID → clienti SET NULL,
  numero                TEXT,
  cliente_snapshot      JSONB NOT NULL DEFAULT '{}',
  sconto_globale        NUMERIC(4,2) DEFAULT 0,    -- 0-60
  note                  TEXT,
  subtotale             NUMERIC(12,2) DEFAULT 0,
  importo_sconto        NUMERIC(12,2) DEFAULT 0,
  totale_articoli       NUMERIC(12,2) DEFAULT 0,
  spese_trasporto       NUMERIC(12,2) DEFAULT 0,
  modalita_trasporto    TEXT DEFAULT 'separato',   -- 'separato' | 'ripartito'
  totale_costi_acquisto NUMERIC DEFAULT 0,
  iva_totale            NUMERIC DEFAULT 0,
  riepilogo_iva         JSONB DEFAULT '[]',        -- [{aliquota, imponibile, iva}]
  totale_finale         NUMERIC(12,2) DEFAULT 0,
  totale_pezzi          INTEGER DEFAULT 0,
  stato                 TEXT DEFAULT 'bozza',      -- 'bozza'|'inviato'|'accettato'|'rifiutato'|'scaduto'
  mostra_sconto_riga    BOOLEAN DEFAULT false,
  share_token           UUID UNIQUE,
  condiviso_at          TIMESTAMPTZ,
  visualizzato_at       TIMESTAMPTZ,
  cataloghi_allegati    UUID[],                    -- array di catalogo.id
  created_at            TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ
)

articoli_preventivo (
  id                      UUID PK,
  preventivo_id           UUID → preventivi CASCADE,
  organization_id         UUID → organizations,
  tipo                    TEXT,       -- 'listino' | 'libera' | 'listino_libero'
  listino_id              UUID → listini SET NULL,
  listino_libero_id       UUID → listini_liberi SET NULL,
  prodotto_id             UUID → prodotti_listino SET NULL,
  accessori_selezionati   JSONB DEFAULT '[]',  -- [{id,nome,prezzo,prezzo_acquisto,qty}]
  accessori_griglia       JSONB DEFAULT '[]',  -- [{id,nome,gruppo,tipo_prezzo,prezzo,prezzo_acquisto,mq_minimo}]
  tipologia               TEXT NOT NULL,
  categoria_nome          TEXT,
  larghezza_mm            INTEGER,
  altezza_mm              INTEGER,
  larghezza_listino_mm    INTEGER,
  altezza_listino_mm      INTEGER,
  misura_arrotondata      BOOLEAN DEFAULT false,
  finitura_nome           TEXT,
  finitura_aumento        NUMERIC(5,2) DEFAULT 0,
  finitura_aumento_euro   NUMERIC(10,2) DEFAULT 0,
  note                    TEXT,
  immagine_url            TEXT,
  quantita                INTEGER DEFAULT 1,   -- > 0
  prezzo_base             NUMERIC(10,2),
  prezzo_unitario         NUMERIC(10,2) NOT NULL,
  sconto_articolo         NUMERIC(4,2) DEFAULT 0,  -- 0-50
  prezzo_totale_riga      NUMERIC(12,2) NOT NULL,
  costo_acquisto_unitario NUMERIC DEFAULT 0,
  costo_posa              NUMERIC DEFAULT 0,
  aliquota_iva            NUMERIC,
  ordine                  INTEGER DEFAULT 0,
  created_at              TIMESTAMPTZ
)

-- ────────────────────────────────────────────
-- ALLEGATI
-- ────────────────────────────────────────────

cataloghi (
  id              UUID PK,
  organization_id UUID → organizations,
  nome            TEXT NOT NULL,
  storage_path    TEXT NOT NULL,
  ordine          INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ
)
-- I cataloghi allegati a un preventivo sono referenziati via preventivi.cataloghi_allegati (UUID[])

allegati_calcoli (
  id              UUID PK,
  organization_id UUID → organizations,
  preventivo_id   UUID → preventivi CASCADE,
  nome            TEXT NOT NULL,
  storage_path    TEXT NOT NULL,
  ordine          INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ
)

-- ────────────────────────────────────────────
-- RILIEVO
-- ────────────────────────────────────────────

forme_serramento (
  id              UUID PK,
  organization_id UUID,
  nome            TEXT NOT NULL,
  attiva          BOOLEAN DEFAULT true,
  ordine          INTEGER DEFAULT 0,
  shape           JSONB NOT NULL DEFAULT '{"punti":[],"segmenti":[],"angoliConfig":[],"chiusa":false}',
  created_at      TIMESTAMPTZ
)

-- ────────────────────────────────────────────
-- ALTRO
-- ────────────────────────────────────────────

subscription (
  id              UUID PK,
  organization_id UUID → organizations,
  -- campi piano abbonamento (struttura predisposta, non ancora in uso)
)
```

---

## 12. Storage File

| Bucket | Visibilità | Limite | Formati | Uso |
|--------|-----------|--------|---------|-----|
| `logos` | Privato (URL firmato) | 2 MB | PNG, JPG, SVG, WebP | Logo azienda |
| `product-images` | Privato | 5 MB | PNG, JPG, WebP | Immagini prodotti listino |
| `preventivi-allegati` | Pubblico | 5 MB | JPG, PNG, WebP, HEIC | Foto voci libere preventivo |
| `cataloghi-brochure` | Pubblico | — | PDF | Cataloghi/brochure commerciali |
| `allegati-calcoli` | Privato (URL firmato 1h) | 20 MB | PDF | PDF interni allegati ai calcoli |

**Convenzioni path:**
- Logo: `{org_id}/logo.{ext}`
- Immagini prodotto: `{org_id}/{uuid}.webp`
- Foto voci libere: `{org_id}/{uuid}.webp` (preprocessate: max 1200px, WebP 85%)
- Allegati calcoli: `{org_id}/{preventivo_id}/{uuid}.pdf`

---

## 13. Regole di Business — Riepilogo

### Calcolo prezzo articolo griglia
```
prezzo_base           = griglia["{alt_arrotondata}_{larg_arrotondata}"]
prezzo_con_finitura   = prezzo_base × (1 + finitura_aumento/100) + finitura_aumento_euro
prezzo_accessori      = Σ calcola_accessorio(acc, larghezza_mm, altezza_mm, prezzo_base)
prezzo_unitario       = prezzo_con_finitura + prezzo_accessori
prezzo_totale_riga    = prezzo_unitario × quantita × (1 - sconto_articolo/100)
```

### Calcolo singolo accessorio griglia
```
'pezzo':        prezzo_accessorio
'mq':           prezzo_accessorio × max(larghezza_mm × altezza_mm / 1_000_000, mq_minimo)
'percentuale':  prezzo_base × (valore_percentuale / 100)
```

### Calcolo costo acquisto (uso interno)
```
costo_acquisto_unitario = prezzo_base × (1 - sconto_fornitore/100)
-- applicato solo sulla quota base, NON su finitura e accessori
```

### Calcolo margini (uso interno)
```
costo_tot_riga = (costo_acquisto_unitario + costo_posa) × quantita
margine_riga   = prezzo_totale_riga - costo_tot_riga

utile_lordo    = totale_articoli
               - totale_costi_acquisto
               - totale_posa
               - spese_trasporto

margine_pct    = utile_lordo / (totale_costi_acquisto + totale_posa + spese_trasporto) × 100
```

### Calcolo IVA con sconto proporzionale
```
Per ogni aliquota_iva:
  imponibile_aliquota = Σ(prezzo_totale_riga degli articoli con quella aliquota)

Dopo aver calcolato il subtotale per aliquota, applicare lo sconto globale proporzionalmente:
  quota_sconto_aliquota = importo_sconto × (imponibile_aliquota / subtotale)
  imponibile_netto      = imponibile_aliquota - quota_sconto_aliquota

Aggiungere quota trasporto proporzionale (solo se modalità 'ripartito'):
  quota_trasporto = spese_trasporto × (imponibile_aliquota / totale_articoli)
  imponibile_finale = imponibile_netto + quota_trasporto

iva_aliquota = imponibile_finale × (aliquota / 100)
```

---

## 14. Pagine e Navigazione

```
/ (auth richiesta)
├── /impostazioni           Dati azienda, IVA, numerazione, trasporto, note template, logo
├── /clienti                Lista + CRUD clienti
├── /listini                Lista categorie → gestione listini griglia e liberi
├── /cataloghi              Gestione libreria PDF cataloghi commerciali
├── /preventivi             Lista preventivi (filtro stato, ricerca)
│   ├── /preventivi/nuovo   Wizard creazione preventivo
│   └── /preventivi/{id}
│       ├── (dettaglio)
│       ├── /modifica       Wizard modifica
│       ├── /stampa         Stampa preventivo (layout A4, no sidebar)
│       └── /stampa-calcoli Stampa calcoli interni (layout A4, no sidebar)
├── /rilievo                Lista vani rilevati
│   ├── /rilievo/impostazioni  Gestione forme serramento
│   └── /rilievo/nuovo      Wizard nuovo rilievo
└── /import-export          (predisposta, in sviluppo)

/ (senza autenticazione)
└── /p/{share_token}        Visualizzazione pubblica preventivo
```

---

## 15. Funzionalità PWA / Offline

L'applicazione funziona parzialmente offline:

| Funzione | Dettaglio |
|---------|-----------|
| Service Worker | Cache delle pagine e asset principali |
| Sync clienti | Lista clienti sincronizzata in IndexedDB al caricamento |
| Sync listini | Dati listini sincronizzati in IndexedDB al caricamento |
| Preventivi offline | Se offline durante creazione → salvato in coda locale (IndexedDB) |
| Flush automatico | Al ritorno online → preventivi pending inviati al server |
| Badge stato | Indicatore visivo "Offline" / "Sincronizzazione" nella top bar |
| Badge pending | Preventivi in coda mostrati in lista con badge ambra |

**Nota:** la modifica preventivi e la gestione listini richiedono connessione. Solo la creazione è offline-capable.

---

## 16. Roadmap (funzionalità non ancora implementate)

| Priorità | Funzione | Note |
|---------|---------|------|
| Alta | PDF rilievo | Documento con piantine vani + tabella misure + raggi archi |
| Alta | Collegamento rilievo → preventivo | Pre-popola preventivo dai vani rilevati |
| Alta | Import/Export | CSV/Excel clienti e listini; import listino da foglio |
| Alta | Ordini produzione | Da preventivo accettato → documento per officina |
| Media | Dashboard avanzata | Grafico fatturato, conversion rate, top clienti |
| Media | Installazioni/Cantieri | Calendario appuntamenti, stato avanzamento |
| Media | Firma digitale | Cliente firma dal link pubblico |
| Media | Email integrata | Invio PDF direttamente dall'app |
| Media | Multi-utente avanzato | Ruoli per commerciale, tecnico, admin |
| Bassa | App mobile nativa | Wrapper Capacitor se offline PWA insufficiente |
| Bassa | Integrazione contabilità | Export verso Fatture in Cloud o equivalenti |

---

## 17. Note critiche per la reimplementazione

1. **Griglia prezzi**: la logica di arrotondamento alle misure disponibili è il cuore del sistema — testare accuratamente con casi limite (misura esatta, misura oltre il massimo, misura zero).

2. **Snapshot cliente**: i dati del cliente vengono copiati al momento del salvataggio. Modifiche successive al cliente non alterano i preventivi esistenti. È fondamentale copiare tutti i campi rilevanti.

3. **Calcolo IVA con sconto**: la distribuzione dello sconto globale proporzionale alle aliquote IVA è la parte più complessa — implementare e testare con attenzione.

4. **Numerazione atomica**: il contatore preventivi deve essere incrementato in modo atomico. In Laravel: usare una transazione con `lockForUpdate()` o un database sequence dedicato.

5. **Rendering PDF per stampa**: la stampa degli allegati PDF avviene lato client tramite pdfjs. In un'implementazione Laravel con Blade, si può usare la stessa tecnica (JS + pdfjs) oppure generare PDF server-side con DomPDF/Browsershot e concatenare i file.

6. **URL firmati per allegati interni**: gli allegati calcoli usano URL temporanei (1h). In Laravel con filesystem S3-compatible, usare `Storage::temporaryUrl()`.

7. **Vista pubblica /p/{token}**: non mostrare mai costo_acquisto_unitario, costo_posa, riepilogo margini, allegati calcoli.

8. **JSONB vs colonne relazionali**: in Laravel si può scegliere di normalizzare gli accessori_griglia e accessori_selezionati in tabelle relazionali invece di JSONB — più query ma più integrità referenziale.
