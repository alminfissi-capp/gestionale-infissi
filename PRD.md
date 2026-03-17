# PRD — Gestionale Infissi

**Versione:** 1.0
**Data:** 2026-03-17
**Stato:** In sviluppo attivo

---

## 1. Panoramica

**Gestionale Infissi** è una web app PWA destinata alle aziende artigiane e alle piccole imprese che operano nella produzione e installazione di serramenti (finestre, porte, persiane, ecc.).

L'obiettivo è digitalizzare i processi operativi quotidiani — dalla gestione dei clienti alla creazione di preventivi, dal rilievo misure sul cantiere alla produzione di documenti commerciali — in un unico strumento mobile-first, utilizzabile anche offline.

---

## 2. Utenti target

| Ruolo | Descrizione |
|---|---|
| **Titolare / Responsabile commerciale** | Crea preventivi, gestisce listini, consulta lo storico clienti |
| **Rilevatore / Tecnico di cantiere** | Usa l'app su smartphone per rilevare misure sul posto |
| **Amministratore** | Configura impostazioni aziendali, listini, forme serramento |

L'app è **multi-tenant**: ogni organizzazione ha i propri dati isolati. Il titolare può avere più collaboratori sotto la stessa organizzazione.

---

## 3. Stack tecnico

| Layer | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router, build con `--webpack` per compatibilità PWA) |
| Linguaggio | TypeScript |
| Database / Auth | Supabase (PostgreSQL + RLS) |
| UI | shadcn/ui + Tailwind CSS |
| PWA | @serwist/next + service worker |
| Offline storage | Dexie (IndexedDB) |
| PDF | Generati lato server tramite pagine `/print` |

---

## 4. Architettura applicativa

```
app/
  (auth)/          → login
  (dashboard)/     → area protetta, layout con sidebar
  (print)/         → pagine PDF (stampa preventivo, stampa calcoli)
  (public)/        → link condivisione preventivo (token)

actions/           → Server Actions (pattern: getOrgId + Supabase client)
types/             → Tipi TypeScript condivisi
lib/               → Business logic pura (pricing, rilievo, ecc.)
components/        → Client Components per modulo
supabase/
  migrations/      → SQL migrations (025 al 2026-03-17)
```

**Pattern pagine:**
- Pagine lista: Server Component async → chiama action → passa dati a Client Component
- Pagine dettaglio/modifica: Server Component, `params: Promise<{ id: string }>` (Next.js 16)
- Mutazioni: Server Actions → `useRouter().refresh()` + toast feedback

---

## 5. Moduli completati

### 5.1 Autenticazione
- Login email/password via Supabase Auth
- Sessione persistente, redirect automatico
- Profilo utente collegato a `organization_id`

---

### 5.2 Impostazioni aziendali
**Percorso:** `/impostazioni`

Dati configurabili:
- Ragione sociale, indirizzo, P.IVA, contatti
- Logo aziendale (upload su Supabase Storage)
- IVA predefinita (%)
- Prefisso numerazione preventivi (es. `PV-2026-`)
- Prefisso documento calcoli distinto dal preventivo cliente
- Spese di trasporto (soglie e tariffe)

---

### 5.3 Clienti
**Percorso:** `/clienti`

- CRUD clienti (persona fisica o azienda)
- Campi: nome/ragione sociale, P.IVA/CF, indirizzo completo, email, telefono, note
- Lista con ricerca testuale

---

### 5.4 Listini
**Percorso:** `/listini`

Due tipologie di listino:

**Listino a Griglia:**
- Matrice prezzi larghezza × altezza (chiavi stringa, arrotondamento per eccesso)
- Finiture con moltiplicatore o prezzo fisso
- Accessori per gruppo (tipo: `unico` = radio, `multiplo` = checkbox)
- Accessori con prezzo `pezzo`, `mq`, o `percentuale`
- Duplicazione listino / duplicazione categoria

**Listino Libero (Catalogo prodotti):**
- Prodotto con prezzo base
- Accessori opzionali con quantità
- Prezzo finale = prodotto + Σ(accessori × qty)

Organizzazione per **categorie** con icona e tipo (`griglia` / `libero`).

---

### 5.5 Preventivi
**Percorso:** `/preventivi`

**Wizard creazione** con 3 modalità articolo:
1. **Da listino** — selezione categoria → larghezza/altezza → finitura → accessori griglia → calcolo automatico prezzo
2. **Da catalogo** — selezione listino libero → prodotto → accessori liberi
3. **Voce libera** — descrizione manuale + prezzo unitario

**Logica prezzi** (`lib/pricing.ts`):
- Griglia: arrotondamento per eccesso alla prima cella ≥ dimensione richiesta
- Finitura: moltiplicatore o addizione su prezzo base
- Accessori griglia: prezzo per pezzo, per mq, o percentuale sul prezzo con finitura
- Sconto per articolo (su prezzo_unitario × qty)
- Sconto globale (sul subtotale)
- Trasporto: 0 pz → €0, 1-10 pz → €350 fisso, >10 pz → €350 + €30/pz extra
- IVA configurabile

**Funzionalità:**
- Lista preventivi con stato (bozza, inviato, accettato, rifiutato, scaduto)
- Modifica preventivo esistente
- Duplicazione articoli
- Note per articolo
- Mostra/nascondi sconto per riga nel PDF
- Numerazione automatica con prefisso configurabile

**Documenti PDF:**
- **Preventivo cliente** — intestazione aziendale, tabella articoli, totali, IVA
- **Documento calcoli interno** — stessa struttura ma con prezzi di acquisto e margini (uso interno)
- Numerazione distinta tra i due documenti

**Condivisione:**
- Link pubblico con token (`/p/[token]`) — nessuna autenticazione richiesta
- Il cliente vede il preventivo formattato senza accedere al gestionale

---

### 5.6 Cataloghi (allegati preventivo)
**Percorso:** `/cataloghi`

- Upload PDF di cataloghi prodotto (Supabase Storage)
- Associazione di uno o più cataloghi a un preventivo
- Visualizzazione dal link di condivisione pubblico

---

### 5.7 Rilievo Misure
**Percorso:** `/rilievo`

Modulo per il rilevamento dimensionale dei serramenti sul cantiere.

#### Forme serramento
- Gestione forme (CRUD) in `/rilievo/impostazioni`
- Editor grafico a griglia 9×9 (`ShapeEditor`)
  - Lati: retta, curva bezier libera, arco circolare
  - Archi: tutto sesto, ribassato, rialzato, acuto/gotico, libero
  - Drag vertici e punti di controllo arco
  - Angoli: fisso (valore noto, es. 90°) o automatico
  - Misure: input (da rilevare) o calcolato (formula derivata)
- Riconoscimento forma a mano libera (`DisegnaForma`) con algoritmo RDP + snap angoli
- **Forme standard pre-configurate** (importabili con un click):
  - Rettangolo
  - Arco a Tutto Sesto *(Freccia = Larghezza / 2, calcolata)*
  - Arco a Sesto Ribassato *(Freccia = input)*
  - Arco Rialzato
  - Arco Acuto / Gotico
  - Triangolo Isoscele
  - Triangolo Equilatero *(angoli fissi 60°)*
  - Pentagono/Casa simmetrico *(Falda unica)*
  - Pentagono/Casa asimmetrico *(Falda SX + Falda DX)*

#### Rilievo vani
- Wizard nuovo rilievo: nome cantiere, cliente (opzionale)
- Per ogni vano: selezione forma → inserimento misure
  - Anteprima SVG interattiva con highlight del campo attivo
  - Valori calcolati in tempo reale (es. Freccia, raggi archi)
  - Calcolo automatico raggio R per ogni arco
  - Note libere per vano
- Lista vani rilevati con anteprima miniatura

#### PWA + Offline
- Service Worker (Serwist) per caching offline
- Dati clienti e listini sincronizzati in IndexedDB (Dexie)
- Nuovo rilievo salvato localmente se offline, sincronizzato alla riconnessione
- Badge "Offline" / "Sincronizzazione" in top bar
- Pending preventivi visibili in lista con badge ambra

---

### 5.8 Import / Export
**Percorso:** `/import-export`

- Pagina predisposta (in sviluppo)

---

### 5.9 Dashboard
**Percorso:** `/` (home dashboard)

- Statistiche di riepilogo (preventivi recenti, totali)

---

## 6. Funzionalità trasversali

| Funzione | Dettaglio |
|---|---|
| **Multi-tenant** | RLS Supabase su tutte le tabelle per `organization_id` |
| **PWA** | Installabile su iOS/Android/desktop, icone SVG + PNG maskable |
| **Offline** | Rilievo misure operativo senza connessione |
| **Layout responsive** | Mobile-first, sidebar collassabile su desktop, drawer su mobile |
| **Subscription** | Struttura tabella `subscription` predisposta per piani a pagamento |

---

## 7. Roadmap — Funzionalità da implementare

### Priorità alta

| # | Funzione | Note |
|---|---|---|
| R1 | **Output PDF rilievo** | Genera documento con piantine vani + tabella misure + raggi archi, da allegare all'ordine |
| R2 | **Collegamento rilievo → preventivo** | Da un rilievo, pre-popolare un preventivo con i vani rilevati |
| R3 | **Import / Export dati** | Export CSV/Excel clienti e listini; import listini da foglio |
| R4 | **Ordini di produzione** | Da preventivo accettato → documento interno per officina |

### Priorità media

| # | Funzione | Note |
|---|---|---|
| R5 | **Dashboard avanzata** | Grafico fatturato, conversion rate preventivi, top clienti |
| R6 | **Gestione installazioni** | Calendario appuntamenti, stato avanzamento cantiere |
| R7 | **Firma digitale preventivo** | Il cliente firma il preventivo dal link pubblico |
| R8 | **Invio email integrato** | Invio preventivo PDF direttamente dall'app |
| R9 | **Multi-utente con ruoli** | Ruoli: admin, commerciale, tecnico di cantiere |

### Priorità bassa / future

| # | Funzione | Note |
|---|---|---|
| R10 | **App mobile nativa** | Wrapper Capacitor/Expo se l'offline PWA risultasse insufficiente |
| R11 | **Integrazione contabilità** | Export fatture verso software esterni (es. Fatture in Cloud) |
| R12 | **Catalogo fornitore** | Import listini direttamente da file fornitore |

---

## 8. Struttura database (tabelle principali)

| Tabella | Descrizione |
|---|---|
| `organizations` | Tenant |
| `profiles` | Utenti collegati a organization |
| `impostazioni` | Config aziendale per org |
| `clienti` | Anagrafica clienti |
| `categorie` | Categorie listino (tipo: griglia / libero) |
| `listini` | Listini a griglia con matrice prezzi JSONB |
| `finiture` | Finiture per listino griglia |
| `accessori_griglia` | Accessori per gruppi su listino griglia |
| `listini_liberi` | Listini catalogo prodotto |
| `prodotti_listino` | Prodotti dentro un listino libero |
| `accessori_listino` | Accessori di un prodotto libero |
| `preventivi` | Testata preventivo |
| `articoli_preventivo` | Righe preventivo (tipo: griglia / libero / voce_libera) |
| `cataloghi` | PDF allegati |
| `preventivo_cataloghi` | Join preventivo ↔ catalogo |
| `forme_serramento` | Forme geometriche per rilievo (shape JSONB) |
| `subscription` | Piano abbonamento per org |

---

## 9. Convenzioni di sviluppo

- **Server Actions** in `actions/` — pattern `getOrgId()` + Supabase client, `revalidatePath` dopo mutazioni
- **Business logic pura** in `lib/` — zero dipendenze React, testabile isolatamente
- **Tipi** in `types/` — condivisi tra Server Actions e Client Components
- **ESLint strict** — zero `any`, zero unused vars nelle build di produzione
- **Build:** `npm run build` usa `--webpack` (Turbopack incompatibile con Serwist)
- **Pagine dinamiche Next.js 16:** `params` è `Promise<{...}>` → sempre `await params`
- **Commit message:** `type(scope): descrizione` (es. `fix(rilievo): ...`)
