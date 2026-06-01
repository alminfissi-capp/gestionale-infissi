# Design: Gruppi Commesse (Blocchi per Anno)

**Data:** 2026-06-01  
**Stato:** Approvato dall'utente  

---

## Contesto

Il modulo Commesse mostra attualmente tutte le commesse dell'anno 2026 in una lista piatta. L'utente vuole poter registrare anche commesse di anni precedenti (es. 2025) e future, organizzandole in "blocchi" rinominabili. I dati esistenti sono critici e non devono mai essere persi.

---

## Obiettivi

- Raggruppare le commesse in blocchi nominati (es. "2025", "2026", nomi personalizzati)
- Navigazione a due livelli: pagina indice blocchi → lista commesse del blocco
- Blocchi rinominabili e creabili liberamente
- Assegnazione automatica al blocco corrente (quello con ordine più alto), con possibilità di spostamento manuale
- Migrazione non-distruttiva dei dati esistenti

---

## Decisioni di design

| Domanda | Scelta |
|---------|--------|
| Navigazione | Pagina indice con card blocchi → click → lista commesse (due livelli) |
| Assegnazione nuova commessa | Automatica al blocco corrente + override manuale (sposta in...) |
| Struttura dati | Tabella separata `gruppi_commesse` con FK su `commesse` |

---

## Database

### Nuova tabella `gruppi_commesse`

```sql
CREATE TABLE gruppi_commesse (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ordine int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE gruppi_commesse ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access" ON gruppi_commesse
  USING (organization_id = get_org_id());
```

### Modifica tabella `commesse`

```sql
ALTER TABLE commesse ADD COLUMN gruppo_id uuid REFERENCES gruppi_commesse(id);
```

La colonna è nullable per consentire la migrazione graduale senza rollback forzati.

### Migrazione dati esistenti (nella stessa migration SQL)

```sql
-- Per ogni org che ha commesse, crea un gruppo "2026" e assegna tutte le commesse esistenti
INSERT INTO gruppi_commesse (organization_id, nome, ordine)
SELECT DISTINCT organization_id, '2026', 0
FROM commesse
WHERE organization_id IS NOT NULL;

UPDATE commesse c
SET gruppo_id = g.id
FROM gruppi_commesse g
WHERE g.organization_id = c.organization_id
  AND g.nome = '2026'
  AND c.gruppo_id IS NULL;
```

**Invariante di sicurezza:** la migration è idempotente e additiva — non elimina righe, non modifica dati esistenti, aggiunge solo colonne e righe nuove.

---

## Architettura applicativa

### Nuove routes

| Route | Descrizione |
|-------|-------------|
| `app/(dashboard)/commesse/page.tsx` | Pagina indice blocchi (sostituisce la pagina lista attuale) |
| `app/(dashboard)/commesse/[gruppoId]/page.tsx` | Lista commesse del blocco (contiene `TabellaCommesse`) |

La `TabellaCommesse` e tutta la logica esistente vengono spostate a `[gruppoId]/page.tsx` senza modifiche funzionali.

### Aggiornamenti actions (`actions/commesse.ts`)

Nuove funzioni:
- `getGruppiCommesse()` — lista gruppi dell'org ordinati per `ordine DESC`
- `createGruppo(nome: string)` — crea gruppo, ordine = max(ordine esistente) + 1
- `renameGruppo(id: string, nome: string)` — aggiorna solo il campo nome
- `deleteGruppo(id: string)` — verifica che il gruppo non abbia commesse prima di eliminare; lancia errore altrimenti
- `spostaCommessa(commessaId: string, gruppoId: string)` — aggiorna `gruppo_id` sulla commessa

Funzioni aggiornate:
- `getCommesse(gruppoId: string)` — aggiunge filtro `WHERE gruppo_id = $1`
- `createCommessa(input)` — accetta `gruppo_id` nel payload; se assente, usa il gruppo con `ordine` massimo

### Nuovi componenti

| Componente | Responsabilità |
|------------|---------------|
| `components/commesse/GruppiCommesse.tsx` | Griglia di card blocchi, pulsante "Nuovo blocco" |
| `components/commesse/DialogGruppo.tsx` | Dialog per creare o rinominare un blocco (campo nome + conferma) |

Nessuna modifica a: `TabellaCommesse`, `DialogCommessa`, `DialogAcconto`, `DialogDocumenti`, `RicevutaAcconto`.

---

## UI — Pagina indice blocchi (`/commesse`)

- Griglia di card responsive (2-3 colonne su desktop, 1 su mobile)
- Ogni card mostra: nome blocco, numero commesse, saldo totale del blocco
- Menu (⋮) su ogni card con: "Rinomina", "Elimina" (disabilitato se il blocco ha commesse)
- Pulsante "Nuovo blocco" in alto a destra
- I blocchi sono ordinati con il più recente in cima (`ordine DESC`)

## UI — Pagina lista commesse (`/commesse/[gruppoId]`)

- Breadcrumb: `Commesse > [nome blocco]`
- Identica alla pagina attuale, con aggiunta di:
  - Voce "Sposta in..." nel menu azione di ogni riga commessa
  - Popover con lista degli altri blocchi disponibili per lo spostamento

## UI — Creazione commessa

- Dal redirect `/commesse?from=PREVENTIVO_ID`: la pagina indice rileva il param `from` e fa un server-redirect a `/commesse/[gruppoCorrente]?from=ID` (gruppoCorrente = gruppo con ordine massimo). Non si modifica `TabellaPreventivi`.
- Da `/commesse/[gruppoId]`: la nuova commessa viene assegnata automaticamente al gruppo della pagina corrente
- Edge case — blocco unico: se esiste un solo blocco, la voce "Sposta in..." è nascosta dalla riga commessa (non ha destinazioni disponibili)

---

## Gestione errori

- Eliminazione blocco con commesse → errore visibile in UI ("Sposta prima le commesse in un altro blocco")
- Creazione blocco con nome vuoto → validazione lato client nel dialog
- `gruppo_id` null (commesse pre-migrazione non coperte) → `getCommesse` tratta `null` come appartenente al gruppo con ordine massimo (fallback sicuro, non si perdono dati)

---

## Sicurezza dati (garanzie)

1. La migration SQL non contiene `DROP`, `DELETE`, o `TRUNCATE`
2. La colonna `gruppo_id` è aggiunta come nullable — nessuna commessa esistente viene rifiutata
3. Il gruppo "2026" viene inserito solo se non esiste già (`INSERT ... SELECT DISTINCT`)
4. L'assegnazione delle commesse usa `UPDATE ... WHERE gruppo_id IS NULL` — non sovrascrive assegnazioni già presenti
5. `deleteGruppo` verifica l'assenza di commesse lato server prima di procedere

---

## File da creare / modificare

### Creare
- `supabase/migrations/XXX_gruppi_commesse.sql`
- `app/(dashboard)/commesse/[gruppoId]/page.tsx`
- `components/commesse/GruppiCommesse.tsx`
- `components/commesse/DialogGruppo.tsx`

### Modificare
- `app/(dashboard)/commesse/page.tsx` → diventa pagina indice blocchi
- `actions/commesse.ts` → nuove funzioni + aggiornamento esistenti
- `app/(dashboard)/preventivi/[id]/page.tsx` → redirect `/commesse?from=ID` → `/commesse/[gruppoId]?from=ID` (oppure lasciare che la pagina indice gestisca il redirect)

### Non modificare
- `TabellaCommesse.tsx`, `DialogCommessa.tsx`, `DialogAcconto.tsx`, `DialogDocumenti.tsx`, `RicevutaAcconto.tsx`, `RicevutaPdfDocument.tsx`
