# Design — Modulo Dipendenti (buste paga e pagamenti)

Data: 2026-07-07 · Stato: approvato dall'utente (con chiusura mensile)

## Obiettivo

Caricare le buste paga dei dipendenti e le contabili dei bonifici, farle leggere in automatico all'AI, e tenere i conti **mese per mese** per ogni dipendente: quanto dovuto (netto in busta), quanto pagato (bonifici + acconti in contanti), quanto resta da pagare.

## Decisioni prese

- **Collocazione**: nuovo modulo sidebar "Dipendenti" con permesso dedicato `'dipendenti'` in `types/permessi.ts` (MODULI_APP, MODULO_LABELS, PERMESSI_ADMIN/VUOTI). Dati sensibili: di default visibile solo agli admin; abilitabile per utente da Gestione Utenti.
- **Anagrafica separata**: i dipendenti NON sono gli utenti app (`profiles`); tabella dedicata.
- **Chiusura mensile**: ogni pagamento ha una mensilità di competenza obbligatoria; il residuo si calcola per (dipendente, periodo, mensilità), non solo cumulato. L'utente fa bonifici che coprono il mese preciso.
- **Formati misti**: le buste arrivano a volte come PDF singolo per dipendente, a volte come PDF unico con tutti — il sistema gestisce entrambi (segmentazione per pagine via AI).
- **Bonifici**: contabile PDF della banca, una per pagamento. Acconti in contanti inseriti a mano.
- **Conferma manuale obbligatoria**: l'AI precompila, l'utente rivede e conferma prima del salvataggio. Fallback: inserimento completamente manuale se l'estrazione fallisce.

## Schema dati (nuova migration)

### `dipendenti`
| Colonna | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid | RLS come le altre tabelle |
| nome, cognome | text | obbligatori |
| codice_fiscale | text nullable | usato per il matching automatico delle buste |
| iban | text nullable | usato per il matching dei bonifici |
| attivo | boolean default true | |
| note | text nullable | |
| created_at | timestamptz | |

### `buste_paga`
| Colonna | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid | |
| dipendente_id | uuid FK → dipendenti | |
| periodo | date | primo del mese, es. `2026-06-01` |
| mensilita | text | `'mensile'` \| `'tredicesima'` \| `'quattordicesima'` \| `'altro'` |
| netto | numeric | netto a pagare — il valore che fa i conti |
| lordo | numeric nullable | se estratto |
| file_path | text nullable | path su Storage (null se inserita a mano senza file) |
| pagina | int nullable | pagina nel PDF se il file era multi-busta |
| dati_estratti | jsonb nullable | output grezzo dell'AI |
| created_at | timestamptz | |

Vincolo: warning applicativo (non unique DB) su duplicato (dipendente_id, periodo, mensilita) — l'utente può comunque forzare (es. busta rettificata).

### `pagamenti_dipendente`
| Colonna | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid | |
| dipendente_id | uuid FK → dipendenti | |
| data_pagamento | date | data del bonifico / consegna contanti |
| importo | numeric | |
| metodo | text | `'bonifico'` \| `'contanti'` \| `'altro'` |
| periodo_competenza | date | **obbligatorio** — mese che il pagamento copre |
| mensilita | text | come buste_paga, default `'mensile'` |
| file_path | text nullable | contabile PDF (null per contanti) |
| dati_estratti | jsonb nullable | |
| note | text nullable | |
| created_at | timestamptz | |

### Storage
Bucket privato `dipendenti-docs`: `buste/{dipendenteId}/...`, `bonifici/{dipendenteId}/...`. Accesso via signed URL (stesso pattern di `getMagazzinoSignedUrl`).

## Logica conti — `lib/dipendenti.ts` (pura, senza Supabase)

Per ogni dipendente, per ogni (periodo, mensilità):
- `dovuto` = netto della busta (0 se busta non ancora caricata)
- `pagato` = Σ pagamenti con quel periodo_competenza + mensilità
- `residuo` = dovuto − pagato (può essere negativo se pagato in eccesso → evidenziato)

Riepilogo dipendente: totali anno (dovuto, pagato, residuo) + elenco mesi aperti (residuo > 0). Riepilogo lista: residuo totale per dipendente.

## Lettura automatica (AI)

Riuso dell'infrastruttura OpenRouter già presente (`app/api/assistant/route.ts` usa `@ai-sdk/openai` + streamText): nuova route/action dedicata con modello vision e output strutturato (zod).

- **Busta paga** → estrae per ogni busta trovata nel PDF: nome, cognome, codice fiscale, periodo, mensilità, netto a pagare, lordo, pagina. Un PDF multi-busta produce N proposte.
- **Contabile bonifico** → estrae: beneficiario, IBAN, data esecuzione, importo, causale; dalla causale propone periodo_competenza e mensilità (es. "stipendio giugno 2026" → 2026-06, mensile).
- **Matching dipendente**: per codice fiscale, poi IBAN, poi nome+cognome (fuzzy). Se nessun match → l'utente associa a un dipendente esistente o ne crea uno al volo.
- **Flusso**: upload (anche multiplo) → estrazione → schermata di revisione con tutti i campi editabili → conferma → salvataggio record + upload file su Storage.

## Pagine e componenti

- `app/(dashboard)/dipendenti/page.tsx` — lista dipendenti: card/tabella con dovuto anno, pagato, **resta da pagare** (evidenziato se > 0), pulsante "Carica documenti".
- `app/(dashboard)/dipendenti/[id]/page.tsx` — dettaglio: anagrafica, tabella mese per mese (busta/netto, pagamenti, residuo), azioni: carica busta, carica contabile, aggiungi acconto contanti (dialog manuale stile DialogAcconto), link ai PDF (signed URL).
- `app/(dashboard)/dipendenti/carica/page.tsx` — upload multiplo + revisione risultati AI + conferma.
- `actions/dipendenti.ts` — CRUD dipendenti, buste, pagamenti; pattern `getOrgId()` + `createClient()`; upload via server action (pattern feedback upload mobile: label htmlFor + arrayBuffer()).
- `components/dipendenti/` — TabellaDipendenti, DettaglioDipendente, TabellaMensilita, DialogDipendente, DialogPagamentoManuale, RevisioneEstrazione, UploadDocumenti.
- Sidebar: voce "Dipendenti" (icona `IdCard`), filtrata dal permesso.

## Gestione errori

- Estrazione AI fallita o incompleta → la schermata di revisione mostra i campi vuoti da compilare a mano; il salvataggio manuale è sempre possibile.
- Duplicato busta (stesso dipendente/periodo/mensilità) → warning con confronto, l'utente decide se sostituire, aggiungere comunque o annullare.
- Bonifico con beneficiario non riconosciuto → selezione manuale del dipendente.
- File non PDF o troppo grande → rifiuto lato client + server con messaggio chiaro.

## Test e verifica

- `lib/dipendenti.ts` testabile in isolamento (calcolo residui per mese, gestione mensilità extra, pagato in eccesso).
- `npm run build` + lint zero warning (vincolo repo).
- Verifica end-to-end in produzione con una busta e una contabile reali (l'AI via OpenRouter funziona anche in locale, a differenza di openapi.it).

## Fuori scope (per ora)

- Ferie/permessi, documenti generici del dipendente, TFR, costo aziendale — l'anagrafica separata li rende aggiungibili in futuro.
- Riconciliazione automatica da estratto conto CSV (si parte dalle contabili singole).
