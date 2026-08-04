# Assegno / Bonifico: allegati PDF nelle scadenze — Design

Data: 2026-08-04

## Obiettivo

La categoria "Assegno" diventa "Assegno / Bonifico". Oggi la riga accetta solo
foto e ne legge i dati con l'OCR; deve accettare anche il PDF di un bonifico e
leggerne importo, data e causale.

Il PDF deve comportarsi **come una foto in tutto**: anteprima a schermo quando lo
si apre, e stampa insieme alla scheda della scadenza.

## Decisioni

- **Il valore nel database resta `assegno`.** Cambia solo l'etichetta mostrata.
  Nessuna migrazione sui 346 record esistenti, nessun rischio.
- **Un solo pulsante di caricamento**, che al clic chiede cosa fare: "Scatta
  foto" oppure "Scegli file". Due campi nascosti dietro le due voci, uno con la
  fotocamera forzata e uno con il selettore di file.
- **Anteprima generata al caricamento, non alla lettura.** La prima pagina del
  PDF viene convertita in immagine e salvata accanto al PDF. Anteprima e stampa
  diventano così identiche al caso della foto, senza attese e senza ricostruire
  il PDF ogni volta.
- **Nella riga il PDF si riconosce da un'icona**, non dall'anteprima: distingue a
  colpo d'occhio un bonifico da un assegno fotografato. Il clic apre l'anteprima.
- **Lettura solo per la categoria Assegno / Bonifico.** Sulle altre categorie il
  PDF si allega ma non viene interpretato, esattamente come accade oggi con le
  foto.

## Modello dati

Una colonna nuova su `scadenze`:

| Colonna | Tipo | Note |
|---------|------|------|
| `anteprima_path` | `text` nullable | Percorso dell'immagine di anteprima, valorizzato solo per gli allegati PDF |

Per le foto resta `NULL`: l'immagine è già il file stesso. Distinguere un PDF da
una foto non richiede altro, basta l'estensione di `foto_path`.

## Lettura del bonifico

Nuovo `lib/parseBonificoScadenza.ts`, che riusa `estraiItemsPagine` da
`lib/pdf-items.ts`.

**Non riuso `lib/parseBonifico.ts`**: è tarato sui bonifici degli stipendi (cerca
causali come "Stipendio", "Acconto", "Tredicesima") e restituisce campi che qui
non servono — mensilità, periodo di competenza, IBAN del beneficiario. Le due
funzioni condividono qualche espressione regolare sugli importi e sulle date, ma
unificarle significherebbe legare le scadenze alle assunzioni del modulo
Dipendenti. Restano separate di proposito.

Campi estratti, tutti opzionali:

| Campo | Uso |
|-------|-----|
| `importo` | riempie l'importo della scadenza |
| `data` | data di esecuzione, corregge la data di scadenza |
| `causale` | riempie la descrizione |

Il fornitore **non** viene toccato: il nome che compare in banca è quasi sempre
meno preciso di quello già scritto a mano.

PDF scansionato senza testo: nessun campo riconosciuto, avviso all'utente e
niente scritto. L'anteprima si genera lo stesso, perché `renderPaginePdf`
disegna la pagina a prescindere dal testo.

## Interfaccia

**`DialogScadenza`** — etichetta della categoria: "Assegno / Bonifico".

**`ScadenzeView`**, riga:

- Il pulsante di caricamento apre un menu con "Scatta foto" e "Scegli file".
  Il primo campo nascosto ha `accept="image/*"` con fotocamera forzata, il secondo
  `accept="image/*,application/pdf"` senza.
- Allegato PDF: icona rossa da documento al posto della miniatura. Il clic apre
  l'anteprima nello stesso riquadro usato per le foto.
- Allegato immagine: miniatura come oggi, invariata.

**`SchedaScadenzaStampa`** — usa l'anteprima quando c'è, altrimenti la foto.
Nessuna modifica alla logica di attesa e stampa: riceve comunque l'indirizzo di
un'immagine.

## Server action (`actions/scadenze.ts`)

- `uploadFotoScadenza` accetta un secondo file opzionale, l'anteprima, e ne salva
  il percorso in `anteprima_path`.
- `removeFotoScadenza` cancella entrambi i file.
- `getScadenzaScheda` restituisce l'indirizzo firmato dell'anteprima quando
  presente.

## Verifica

- `parseBonificoScadenza` va coperto con vitest su testi di esempio dei due
  formati (SICILBANCA e Intesa), inclusi i casi in cui i campi mancano. Il parser
  è logica pura su stringhe: si testa senza browser, come `lib/pricing.ts`.
- A mano sulla pagina Scadenze: foto da fotocamera, foto da file, PDF con testo,
  PDF scansionato, rimozione dell'allegato, stampa della scheda con il bonifico.

## Fuori scopo

- Lettura di bonifici di banche diverse da SICILBANCA e Intesa Sanpaolo. Il
  parser è a espressioni regolari sui due formati in uso; un altro formato
  semplicemente non riconosce nulla e si compila a mano.
- PDF di più pagine: l'anteprima è la prima pagina. Un bonifico sta su una pagina.
- Unificare `parseBonifico` e `parseBonificoScadenza`.

## Foto grandi: risolto subito dopo (2026-08-04)

`uploadFotoScadenza` era una Server Action che riceveva il file. Su Vercel il
corpo di una Server Action si ferma intorno ai 4,5 MB mentre il codice ne
accettava 20: una foto scattata da un telefono recente superava il limite e
falliva **in silenzio**. Lo stesso difetto era già emerso il 2026-07-29 su
`DialogDocumenti`, con un PDF da 7,32 MB.

Applicata la stessa soluzione già adottata lì:

1. **Strada normale** — il browser carica direttamente su Supabase Storage. Il
   file non attraversa le funzioni Vercel e il limite non si applica. La nuova
   `setAllegatoScadenza` registra solo i percorsi, e `getPathAllegatoScadenza`
   fornisce la cartella su cui scrivere.
2. **Ripiego** — la Server Action originale, invariata. Su iOS e Android il
   client browser può non avere la sessione: lì il caricamento diretto
   fallirebbe, e passare dal server tiene in piedi il caso mobile.

Verificato che le policy del bucket `commesse-docs` controllano solo la prima
cartella del percorso (l'organizzazione), quindi il percorso
`{org}/scadenze/{id}/…` è ammesso e la strada normale funziona davvero, senza
ripiegare in silenzio sulla Server Action.
