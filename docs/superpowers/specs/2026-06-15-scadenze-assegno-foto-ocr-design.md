# Scadenze: foto + OCR assegno in inserimento, colori righe

Data: 2026-06-15

## Obiettivo
Per le scadenze di tipo **Assegno**: poter allegare la foto già in fase di
inserimento (dialog), con OCR che precompila **numero, importo e data** (sempre
modificabili a mano). Distinguere a colpo d'occhio righe **assegno** e **rate
(finanziamento)** con un colore diverso.

## Scelte (brainstorming)
- **OCR**: Tesseract.js migliorato (gratis/offline, `eng+ita`). Affidabilità
  limitata su importo/data → campi sempre editabili.
- **Foto nel dialog**: due pulsanti — *Scatta foto* (`capture=environment`) e
  *Carica file*. La foto viene caricata solo al salvataggio.

## Design

### 1. `lib/ocrAssegno.ts` (nuovo)
`ocrAssegno(file): Promise<{ numero, importo, data }>`
- `numero`: sequenza cifre più lunga ≥ 6
- `importo`: regex importi `1.234,56` / `€ 1234,56`; sceglie il valore maggiore
- `data`: regex `gg/mm/aaaa`, `gg-mm-aaaa`, mesi italiani → `YYYY-MM-DD`
- Best-effort: ogni campo può essere `null`.

### 2. `DialogScadenza.tsx`
- Quando `categoria === 'assegno'`: riquadro foto con anteprima + pulsanti
  *Scatta foto* / *Carica file* + spinner "Lettura assegno…".
- File tenuto in stato locale (non caricato subito). OCR all'select →
  precompila `importo`, `data_scadenza`, `descrizione` (numero), editabili.
- Al submit: `createScadenza`/`updateScadenza` → poi `uploadFotoScadenza` con
  l'id ottenuto.

### 3. `ScadenzeView.tsx`
- `border-l-4` per riga colorato per categoria: assegno = blu,
  finanziamento = viola, altro = neutro. Compatibile con sfondo "pagata".
- Flusso fotocamera sulla riga refattorizzato per usare `ocrAssegno` condiviso.

## DB
Nessuna modifica: numero in `descrizione`, importo in `importo`, data in
`data_scadenza`, foto in `foto_path`.
