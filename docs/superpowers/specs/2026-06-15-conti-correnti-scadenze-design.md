# Conti correnti: anagrafica, scelta su scadenza, collegamento Calcoli

Data: 2026-06-15

## Obiettivo
Introdurre i **conti correnti** come anagrafica. Si impostano nelle
Impostazioni generali, si scelgono (facoltativamente) in fase di inserimento
scadenza, e l'etichetta della banca compare in elenco scadenze e nei Calcoli.
Il saldo del conto concorre alla liquidità nei Calcoli.

## Scelte (brainstorming)
- **Legame Calcoli**: solo etichetta banca (nessun calcolo per conto). La
  liquidità resta una somma unica; i saldi dei conti vi concorrono.
- **Dati conto**: nome + saldo attuale.
- **Conto su scadenza**: facoltativo (default "— nessuno —").
- **Saldo**: modificabile sia in Impostazioni sia inline nei Calcoli (stesso
  valore, due punti d'accesso).

## Design

### 1. Dati
Migration nuova:
```sql
CREATE TABLE conti_correnti (
  id uuid PK default gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome text NOT NULL,
  saldo_attuale numeric NOT NULL DEFAULT 0,
  ordine int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
-- RLS org_access (come scadenze)
ALTER TABLE scadenze ADD COLUMN conto_id uuid REFERENCES conti_correnti(id) ON DELETE SET NULL;
```
Tipi: `ContoCorrente`, `ContoCorrenteInput`; `conto_id: string | null` su
`Scadenza` e `ScadenzaInput`.
Actions `actions/conti.ts`: `getConti`, `createConto`, `updateConto`
(nome+saldo), `updateSaldoConto` (solo saldo, per inline Calcoli),
`deleteConto`.

### 2. Impostazioni
Card **"Conti correnti"** in alto (sotto Tema) + componente client
`FormConti`: elenco, aggiungi, modifica nome/saldo, elimina.

### 3. Scadenza
`DialogScadenza`: `<select>` "Conto corrente" facoltativo popolato dai conti
(default "— nessuno —"); `conto_id` nel payload.
`ScadenzeView`: badge neutro col nome conto sulla riga quando impostato.
Loader pagina blocco: aggiunge `getConti()` e passa `conti` ai due componenti.

### 4. Calcoli (`TabellaCalcoli`)
- Pagina `calcoli`: aggiunge `getConti()`, passa `conti`.
- "Scadenze selezionate": ogni riga mostra il badge banca.
- "Giacenze e liquidità": i conti correnti compaiono in cima con saldo
  editabile inline (`updateSaldoConto`), sommati alla **Liquidità corrente**
  insieme alle righe libere esistenti.

## Note
- Eliminare un conto non cancella le scadenze (FK SET NULL): tornano "senza
  conto".
- Nessun calcolo saldo-per-banca: fuori scope per scelta.
