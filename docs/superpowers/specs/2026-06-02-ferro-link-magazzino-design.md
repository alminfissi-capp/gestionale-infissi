# Design: Collegamento Listino Ferro ↔ Magazzino Prodotti

**Data:** 2026-06-02  
**Stato:** Approvato

---

## Obiettivo

Permettere di collegare le voci del listino ferro e cancelli (Barre e Profili, Sezioni Colonna, Binari, Accessori) a prodotti esistenti in `anagrafica_prodotti` (magazzino). Il prezzo di una voce collegata riflette il `prezzo_acquisto` del prodotto magazzino e può essere sincronizzato manualmente on-demand. Le voci manuali esistenti rimangono invariate.

---

## Database

### Migrazione (una sola migration)

Aggiunge `magazzino_prodotto_id` alle 4 tabelle ferro:

```sql
ALTER TABLE ferro_sezioni_piene
  ADD COLUMN magazzino_prodotto_id uuid REFERENCES anagrafica_prodotti(id) ON DELETE SET NULL;

ALTER TABLE ferro_sezioni_colonne
  ADD COLUMN magazzino_prodotto_id uuid REFERENCES anagrafica_prodotti(id) ON DELETE SET NULL;

ALTER TABLE ferro_binari
  ADD COLUMN magazzino_prodotto_id uuid REFERENCES anagrafica_prodotti(id) ON DELETE SET NULL;

ALTER TABLE ferro_accessori
  ADD COLUMN magazzino_prodotto_id uuid REFERENCES anagrafica_prodotti(id) ON DELETE SET NULL;
```

- `NULL` = voce manuale (comportamento attuale invariato)
- `ON DELETE SET NULL`: se il prodotto magazzino viene eliminato, la voce ferro resta manuale con l'ultimo prezzo copiato
- Nessun trigger DB — la sincronizzazione è manuale on-demand

---

## Server Actions (`actions/ferro.ts`)

### Nuove

**`getFerroArticoliMagazzino()`**
- Legge `anagrafica_prodotti` con join a `categorie_magazzino`
- Restituisce: `id, codice, nome, prezzo_acquisto, categoria_nome`
- Usata per popolare il dialog di selezione

**`addFerroArticoliDaMagazzino(table: FerroTable, prodotti: ProdottoPerFerro[])`**
- `FerroTable = 'sezioni_piene' | 'sezioni_colonne' | 'binari' | 'accessori'`
- `ProdottoPerFerro = { id: string, label: string, categoria: string, prezzo: number }`
- Inserisce righe nelle tabelle ferro con `magazzino_prodotto_id` valorizzato
- Al momento dell'inserimento copia `label`, `categoria`, `prezzo` dal prodotto magazzino

**`sincronizzaPrezziCollegati()`**
- Per ogni tabella ferro, UPDATE delle righe con `magazzino_prodotto_id IS NOT NULL`
  joinando `anagrafica_prodotti.prezzo_acquisto`
- Restituisce `{ aggiornati: number }` per il toast

### Modifiche a esistenti

**`updateFerroArticolo(table, id, data)`**
- Se la riga ha `magazzino_prodotto_id IS NOT NULL`, il campo `prezzo` viene ignorato
  nell'UPDATE (protezione server-side oltre al lock UI)

---

## UI/UX

### FerroCalcolatore — sezioni tabelle

Ogni sezione (Barre e Profili, Sezioni Colonna, Binari, Accessori) riceve:

- **Header**: accanto al pulsante "Aggiungi" → pulsante secondario **"+ Da magazzino"**
- **Righe collegate**: icona catena 🔗 accanto al label + campo prezzo read-only (disabilitato)
- **Righe manuali**: identiche a oggi, nessuna modifica

### Pulsante "Sincronizza prezzi"

- Posizione: in cima alla pagina ferro, accanto al titolo
- Icona: refresh
- Comportamento: chiama `sincronizzaPrezziCollegati()`, mostra toast `"N prezzi aggiornati"`

### Dialog "Aggiungi da magazzino"

Aperto da "+ Da magazzino" su una sezione specifica (passa `table` come prop).

- **Ricerca**: input testo su codice / nome prodotto
- **Tabella**: `[ ] | Codice | Nome | Categoria | Prezzo acquisto`
- **Prodotti già collegati** in quella sezione: grayed out + badge "Già aggiunto" (non selezionabili)
- **Footer**: contatore `"N selezionati"` + `Annulla` + `Aggiungi selezionati`
- **On conferma**: chiama `addFerroArticoliDaMagazzino(table, selezionati)`

---

## File coinvolti

| File | Modifica |
|------|----------|
| `supabase/migrations/YYYYMMDD_ferro_link_magazzino.sql` | Nuova migration (4 ALTER TABLE) |
| `actions/ferro.ts` | +3 nuove action, modifica updateFerroArticolo |
| `types/ferro.ts` (o inline) | Aggiunta `magazzino_prodotto_id` ai tipi riga ferro |
| `components/ferro/FerroCalcolatore.tsx` | Pulsante sync + icona lock righe collegate |
| `components/ferro/DialogSelezioneProdottiMagazzino.tsx` | Nuovo componente dialog |

---

## Comportamenti limite

- **Prodotto magazzino eliminato**: `ON DELETE SET NULL` → voce ferro resta con ultimo prezzo, torna manuale
- **Stessa voce aggiunta due volte**: il dialog mostra "Già aggiunto" e blocca la selezione
- **Sync senza prodotti collegati**: `sincronizzaPrezziCollegati()` restituisce `{ aggiornati: 0 }`, toast "0 prezzi aggiornati"
- **Modifica label su voce collegata**: permessa (solo il prezzo è locked)
