# Gestionale Infissi — PRD (Stack Laravel)

**Versione**: 1.0 — 2026-06-01  
**Prodotto**: Gestionale web multi-tenant per aziende di produzione serramenti  
**Stack di riferimento**: Laravel 11 + PHP 8.3 + PostgreSQL + Livewire 3 + Tailwind CSS  

---

## 1. Visione del prodotto

Applicazione web SaaS multi-tenant per la gestione completa di un'azienda produttrice di serramenti: dalla creazione del preventivo alla firma elettronica del contratto, dalla gestione del magazzino al rilievo misure in cantiere. Supporto PWA per uso offline in cantiere.

---

## 2. Stack tecnico

| Layer | Tecnologia |
|-------|-----------|
| Backend | Laravel 11, PHP 8.3 |
| Database | PostgreSQL 16 (o MySQL 8) |
| Frontend | Livewire 3 + Alpine.js + Tailwind CSS |
| Asset bundling | Vite |
| Auth | Laravel Breeze (Livewire stack) |
| Multi-tenancy | `stancl/tenancy` (database-per-tenant) o colonna `organization_id` |
| PDF | Laravel Snappy (wkhtmltopdf) o DomPDF |
| Storage | Laravel Filesystem (S3-compatible: Cloudflare R2 / AWS S3) |
| Email | Resend via Laravel Mail (`resend/resend-laravel`) |
| Queue | Laravel Horizon (Redis) per job asincroni |
| PWA | `silviolleite/laravelpwa` o `beyondcode/laravel-websockets` |
| Cache | Redis |
| Firma elettronica | openapi.it EU-SES v1 (HTTP client Guzzle) |
| Testing | Pest PHP |
| Deploy | Forge + DigitalOcean / Railway / Render |

---

## 3. Architettura applicativa

### 3.1 Multi-tenancy

Ogni azienda cliente è un'**Organization**. Tutte le tabelle principali hanno `organization_id` (UUID) come FK. Il sistema usa il pattern **shared database + colonna discriminante**.

```
organizations
  └─ users (profiles) — appartengono a un'organization
  └─ settings
  └─ clienti, listini, preventivi, commesse, magazzino, ...
```

**Scoping automatico**: Tutti i modelli Eloquent usano un global scope `OrganizationScope` che aggiunge automaticamente `WHERE organization_id = ?` a ogni query. I controller non devono ricordarlo.

```php
// OrganizationScope.php
class OrganizationScope implements Scope {
    public function apply(Builder $builder, Model $model) {
        $builder->where('organization_id', auth()->user()->organization_id);
    }
}

// Modello base
abstract class OrganizationModel extends Model {
    protected static function booted() {
        static::addGlobalScope(new OrganizationScope());
    }
}
```

### 3.2 Struttura directory

```
app/
├── Http/
│   ├── Controllers/         # Thin controllers, delegano a Actions
│   ├── Livewire/            # Componenti Livewire per ogni modulo
│   │   ├── Clienti/
│   │   ├── Listini/
│   │   ├── Preventivi/
│   │   ├── Commesse/
│   │   ├── Magazzino/
│   │   └── Rilievo/
│   └── Middleware/
├── Actions/                 # Business logic isolata (Action pattern)
│   ├── Preventivi/
│   ├── Commesse/
│   └── Firma/
├── Models/
├── Policies/                # Autorizzazione per risorsa
├── Services/
│   ├── PricingService.php   # Calcolo prezzi infissi
│   ├── FirmaService.php     # Integrazione EU-SES openapi.it
│   ├── PdfService.php       # Generazione PDF preventivi/ricevute
│   └── ImportService.php    # Import PDF costi FP-PRO
├── Jobs/                    # Job asincroni (callback firma, sync email)
└── Notifications/
resources/
├── views/
│   ├── livewire/            # Template Blade per componenti Livewire
│   ├── pdf/                 # Template PDF (preventivo, ricevuta, stampa commessa)
│   └── emails/              # Template email
```

### 3.3 Autorizzazione e permessi

```
roles: admin | operatore | viewer
```

Ogni organization può configurare permessi granulari per modulo. Implementazione con **Laravel Policies** + una tabella `permissions` custom.

```
permissions
  organization_id
  user_id
  modulo: enum(clienti, listini, preventivi, commesse, magazzino, rilievo, impostazioni)
  livello: enum(nessuno, lettura, scrittura, admin)
```

---

## 4. Moduli

---

### 4.1 Autenticazione & Organizzazioni

**Flusso registrazione**:
1. Utente si registra → crea un'**Organization** + profilo admin
2. Admin invita altri utenti via email → link di join con token

**Modelli**:
```
organizations: id, nome, slug, created_at
users: id, organization_id, name, email, password, role, operatore (nome breve), is_disabled
```

**Route principali**:
- `POST /register` → crea org + admin
- `POST /login`
- `GET /impostazioni/utenti` → lista utenti org
- `POST /impostazioni/utenti/invita` → invia email con link

---

### 4.2 Impostazioni (FASE 1)

**Funzionalità**:
- Dati aziendali: ragione sociale, P.IVA, indirizzo, telefono, email
- Logo aziendale (upload → storage S3)
- Aliquote IVA configurabili (default 22%, personalizzabili)
- Note template per preventivi
- Prefisso numerazione preventivi (es. "PRV-2026-")
- Giorni validità preventivo default
- Permessi utenti per modulo

**Modello**:
```
settings: organization_id, ragione_sociale, piva, indirizzo, telefono, email, logo_path, giorni_validita_preventivo, prefisso_preventivo, aliquote_iva (json), note_template (json)
```

**Componente Livewire**: `Impostazioni/GeneraliForm`, `Impostazioni/UtentiTable`

---

### 4.3 Clienti (FASE 2)

**Funzionalità**:
- CRUD clienti (privati e aziende)
- Ricerca full-text per cognome/ragione sociale/telefono/email
- Esportazione lista PDF filtrata

**Modello**:
```
clienti:
  organization_id
  tipo: enum(privato, azienda)
  nome, cognome (nullable se azienda)
  ragione_sociale (nullable se privato)
  email, telefono, telefono2
  indirizzo, citta, cap, provincia
  piva, codice_fiscale, codice_sdi, pec
  note
```

**Componente Livewire**: `Clienti/TabellaClienti` (con search reattiva)

---

### 4.4 Listini (FASE 3 + FASE 5 + Accessori)

#### Listini a Griglia (prezzi larghezza×altezza)

**Modello**:
```
categorie_listini:
  organization_id, nome, tipo: enum(griglia, libero, su_misura), icona, ordine, 
  trasporto_costo_unitario, trasporto_costo_minimo, trasporto_minimo_pezzi,
  sconto_fornitore

listini (per categoria tipo=griglia):
  categoria_id, organization_id, nome, larghezze (json array), altezze (json array),
  prezzi (json object: {altezza: {larghezza: prezzo}}),
  finiture: has many

finiture:
  listino_id, organization_id, nome, percentuale, immagine_path, ordine

accessori_griglia:
  listino_id, organization_id, gruppo, gruppo_tipo: enum(multiplo, unico),
  nome, tipo_prezzo: enum(pezzo, mq, percentuale), prezzo, prezzo_acquisto,
  mq_minimo, ordine
```

**Logica prezzi griglia** (in `PricingService`):
- Arrotonda larghezza e altezza per eccesso alla prima misura disponibile nella griglia
- `prezzo_base = griglia[altezza_arrot][larghezza_arrot]`
- Finitura: `prezzo_con_finitura = prezzo_base * (1 + finitura.percentuale / 100)`
- Accessorio pezzo: `+accessorio.prezzo`
- Accessorio mq: `+accessorio.prezzo * max(larghezza*altezza, mq_minimo)`
- Accessorio percentuale: `+prezzo_con_finitura * accessorio.percentuale / 100`

#### Listini Liberi (catalogo prodotti)

```
listini_liberi: categoria_id, nome, ...
prodotti_listino: listino_libero_id, nome, prezzo, prezzo_acquisto, immagine_path
accessori_listino: listino_libero_id, nome, prezzo, tipo: enum(singolo, multiplo)
```

**Logica**: `prezzo_unitario = prodotto.prezzo + Σ(accessorio_selezionato.prezzo × qty)`

#### Listini Su Misura

```
listini_su_misura: categoria_id, prezzo_base, prezzo_min_mq, prezzo_mq
finiture_su_misura: listino_su_misura_id, nome, percentuale
gruppi_accessori_su_misura / accessori_su_misura
```

**Componente Livewire**: `Listini/ListiniClient` con modal create/edit per ogni tipo

---

### 4.5 Preventivi (FASE 4)

#### Flusso wizard multi-step

```
STEP 1: Selezione/creazione cliente
STEP 2: Aggiunta articoli (Da listino griglia | Da catalogo | Voce libera)
STEP 3: Riepilogo + conferma
```

**Modelli**:
```
preventivi:
  organization_id, numero (es. "PRV-2026-0042"), cliente_snapshot (json),
  cliente_id (nullable, FK soft), stato: enum(bozza, inviato, accettato, rifiutato, scaduto)
  note, sconto_globale_tipo: enum(percentuale, importo), sconto_globale_valore,
  iva_percentuale, iva_totale, totale_finale, mostra_sconto_riga (bool),
  condiviso_at, visualizzato_via,
  share_token (uuid, per link pubblico /p/{token}),
  token_conferma (uuid), firma_documento_id, firma_signing_url,
  firma_stato: enum(null, in_attesa, firmato, rifiutato, scaduto),
  firma_richiesta_at, firma_completata_at, firma_pdf_path,
  giorni_validita

articoli_preventivo:
  preventivo_id, organization_id, ordine,
  tipo: enum(griglia, libero, voce_libera, su_misura, scorrevole),
  descrizione, note (multiriga → visualizzare con white-space: pre-line),
  listino_id, listino_libero_id, prodotto_id,
  finitura_id, finitura_nome, finitura_percentuale,
  larghezza, altezza (in mm),
  qty, prezzo_unitario, sconto_percentuale, totale_riga,
  mostra_sconto_riga (bool),
  accessori_selezionati (json), accessori_griglia (json),
  bypass_calcolo (bool)
```

**PricingService** (logica invariante rispetto al framework):
```php
class PricingService {
    public function calcolaTotaleRiga(ArticoloPreventivo $a): float;
    public function calcolaSubtotale(Collection $articoli): float;
    public function calcolaSpeseTrasporto(int $pezzi, Listino $listino): float;
    public function calcolaTotale(float $subtotale, float $sconto, float $trasporto, float $iva): float;
}
```

**Numerazione atomica**: PostgreSQL sequence o transaction con SELECT FOR UPDATE per evitare duplicati.

**Condivisione**: Link pubblico `/p/{share_token}` — pagina senza auth che mostra il preventivo e permette accettazione/rifiuto. Protetto da middleware che verifica solo il token.

**Pagine**:
- `GET /preventivi` → lista con filtri
- `GET /preventivi/nuovo` → wizard
- `GET /preventivi/{id}` → dettaglio
- `GET /preventivi/{id}/modifica` → wizard edit
- `GET /preventivi/{id}/stampa` → view ottimizzata stampa
- `GET /p/{token}` → vista pubblica cliente

---

### 4.6 Firma Elettronica EU-SES (openapi.it)

**Integrazione**: `FirmaService` fa chiamate HTTP a `https://esignature.openapi.com`

**Token**: `OPENAPI_IT_TOKEN=6a10844afae5366433015ad8` (solo produzione, restrizioni IP)

**Flusso**:
1. Admin carica PDF preventivo e dati firmatario → `POST /EU-SES`
2. openapi.it restituisce `signingUrl` → salvato in DB → inviato al cliente via WhatsApp/email
3. Cliente firma online → openapi.it chiama `callbackUrl` (webhook)
4. Webhook `POST /api/firma/callback` → aggiorna `firma_stato`, scarica PDF firmato, salva su Storage

**Payload EU-SES corretto**:
```php
[
    'inputDocuments' => [['sourceType' => 'base64', 'payload' => $pdfBase64]],
    'signers' => [[
        'name' => $nome, 'surname' => $cognome, 'email' => $email, 'mobile' => $telefono,
        'authentication' => ['sms'],
        'signatures' => [['page' => 1, 'x' => '70', 'y' => '680']],
        'language' => 'it',
    ]],
    'callbackUrl' => config('app.url') . '/api/firma/callback?token=' . $firmaToken,
    'redirectUrl' => config('app.url') . '/conferma/' . $firmaToken . '/grazie',
    'signatureMode' => ['typed', 'drawn'],
]
```

**Errori da evitare**:
- NON usare `inputDocuments[].uri` con data URI
- NON usare `callback.url` nested — usare `callbackUrl` top-level
- NON usare `signatures[].pageNumber` — usare `page`, con `x` e `y` come stringhe

**Job asincrono**: `VerificaFirmaJob` — polling manuale con `GET /EU-SES/{documentId}` per recuperare stato senza dipendere dal callback.

**Middleware**: la route `/api/firma/callback` deve essere esclusa da CSRF protection (`VerifyCsrfToken`).

---

### 4.7 Commesse

**Concetto**: Una commessa è un ordine confermato, generalmente collegato a un preventivo accettato. Supporta più preventivi collegati e documenti allegati.

#### 4.7.1 Gruppi Commesse (Blocchi)

Le commesse sono organizzate in blocchi rinominabili (es. "2025", "2026"):

```
gruppi_commesse:
  organization_id, nome, ordine (int, più alto = più recente)
```

**Navigazione**:
- `/commesse` → indice blocchi (card per blocco con count e totale)
- `/commesse/{gruppoId}` → lista commesse del blocco

**Assegnazione**: ogni commessa ha `gruppo_id` FK. Alla creazione va nel blocco con ordine massimo (corrente). Può essere spostata tra blocchi.

#### 4.7.2 Commesse

```
commesse:
  organization_id, gruppo_id (FK gruppi_commesse),
  numero_commessa, preventivo_id (nullable),
  cliente_nome, numero_preventivo,
  imponibile, iva_totale, totale,
  data_conferma, operatore_id, operatore_nome, note,
  stato: enum(in_attesa, da_iniziare, in_lavorazione, da_consegnare, consegnato, parzialmente_consegnato, concluso, bloccato, annullato),
  reparti: json array (alluminio, ferro, servizi, rivendita, ebay),
  ordine (int, per drag-and-drop)

acconti_commessa:
  commessa_id, organization_id,
  importo, data_pagamento,
  metodo_pagamento: enum(contanti, bonifico, riba, altro),
  note

documenti_commessa:
  commessa_id, organization_id,
  nome_file, storage_path, tipo_documento

preventivi_commessa: (preventivi PDF o sistema collegati)
  commessa_id, organization_id,
  preventivo_id (nullable), numero_preventivo,
  nome_file (nullable), storage_path (nullable), ordine
```

**Calcoli**:
- `totale_acconti = SUM(acconti.importo)`
- `saldo = totale - totale_acconti`
- Saldo verde = pagato, arancione = da pagare

**Ricevute acconti**: PDF generato lato server con DomPDF, scaricabile o condivisibile via Web Share API (mobile).

**Drag-and-drop**: riordinamento righe con aggiornamento `ordine` via request AJAX.

---

### 4.8 Magazzino

#### Sottosezioni

| Pagina | Descrizione |
|--------|-------------|
| `/magazzino` | Dashboard giacenze per categoria |
| `/magazzino/fornitori` | CRUD fornitori |
| `/magazzino/prodotti` | Anagrafica prodotti con varianti |
| `/magazzino/movimenti` | Movimenti carico/scarico con filtri |
| `/magazzino/giacenze` | Stato scorte corrente |

**Modelli**:
```
magazzino_fornitori: organization_id, nome, indirizzo, telefono, email, note
magazzino_categorie: organization_id, nome, um (unità misura), tipo: enum(standard, viteria, kit)

magazzino_prodotti:
  organization_id, fornitore_id, categoria_id,
  codice, nome, descrizione, um, note,
  immagine_path, dxf_path (file DXF per preview tecnica),
  prezzo_acquisto, prezzo_vendita

magazzino_varianti: prodotto_id, nome, codice, attributi (json), prezzo_differenza

magazzino_movimenti:
  organization_id, prodotto_id, variante_id (nullable),
  tipo: enum(carico, scarico), quantita, data_movimento,
  riferimento (testo libero), commessa_ref, note, costo_unitario

magazzino_scorte: (view materializzata o calcolata)
  prodotto_id, variante_id, giacenza_corrente
```

**DXF viewer**: Parsing file DXF lato server (PHP library o chiamata a servizio Node) → conversione in SVG → mostrato nel browser. In alternativa, generare SVG al momento dell'upload e salvarlo.

**Inventario**: procedura di conteggio fisico con aggiustamento automatico delle giacenze.

---

### 4.9 Rilievo / Configuratore Serramenti

**Obiettivo finale**: configuratore BIM-light — dal rilievo visivo in cantiere alla distinta materiali con calcolo prezzi.

#### FASE A — Disegno grafico (IN CORSO)

**Canvas SVG** interattivo (implementato con Alpine.js + canvas HTML5 o SVG):
- Disegno vano con quote (larghezza × altezza in mm)
- Aggiunta ante: battenti (simbolo apertura), scorrevoli (frecce)
- Traversi e montanti interni
- Suddivisione automatica celle (zone vetrate)
- Riempimenti: vetro (trasparente), pannello (opaco), persiana

**Modelli**:
```
rilievo_sessioni: organization_id, nome, note, data_rilievo
rilievo_vani:
  sessione_id, nome, larghezza_mm, altezza_mm, note,
  canvas_data (json: telai, aperture, traversi, celle)
```

**Persistenza offline**: i dati del canvas vengono salvati in localStorage / IndexedDB (Dexie) durante il rilievo in cantiere, poi sincronizzati al server al ritorno online.

#### FASE B — Database profili (DA IMPLEMENTARE)

```
serie_profili: organization_id, nome, produttore, note
profili: serie_id, tipo: enum(telaio, anta, traverso, montante), codice, nome, peso_ml, prezzo_ml
vetri_pannelli: organization_id, tipo: enum(vetro, pannello), nome, spessore_mm, prezzo_mq
```

#### FASE C — Configurazione (DA IMPLEMENTARE)

Associazione profili e vetri alle componenti del vano disegnato. Distinta materiali calcolata automaticamente.

#### FASE D — Prezzi automatici (DA IMPLEMENTARE)

Calcolo costo serramento dalla distinta → integrazione con modulo preventivi.

---

### 4.10 Import PDF costi FP-PRO (WinStudio)

**Funzionalità**: importazione automatica voci di preventivo da PDF esportato da WinStudio FP-PRO.

**Implementazione**:
- Upload PDF → parsing lato server con libreria PHP PDF (es. `smalot/pdfparser` o chiamata a microservizio Node.js con `pdfjs-dist`)
- Estrazione per voce: tipologia, dimensione, quantità, imponibile, materiale costo, lavorazione, posa in opera, aliquota IVA, immagine (300×300px)
- Costruzione nota articolo: `"Profili: X\nEst.: X\nInt.: X\nAcc.: X\nVetri: X"`
- Articolo importato come voce nel wizard preventivo

**Nota**: le note articolo contengono `\n` — visualizzare sempre con CSS `white-space: pre-line`.

---

### 4.11 Email (Resend)

**Utilizzo**:
- Invio preventivo al cliente (PDF allegato)
- Tracking apertura email (`/api/track/email/{id}` — pixel 1×1)
- Invio ordine al fornitore: **niente allegato**, link tracciato a `/o/{token}` + pixel. Ogni evento
  (invio, apertura email, apertura pagina, download) va in `tracking_email_ordine`; la copia del PDF
  spedita viene congelata nello storage e il suo path è registrato sull'evento `inviato`
- Invito utenti all'organization

**Configurazione Laravel**:
```env
MAIL_MAILER=smtp
MAIL_HOST=smtp.resend.com
MAIL_PORT=465
MAIL_USERNAME=resend
MAIL_PASSWORD=re_xxxxx
MAIL_FROM_ADDRESS=noreply@dominio.com
```

---

## 5. PDF Generation

Tutti i PDF sono generati server-side con **Laravel Snappy** (wkhtmltopdf):

| Documento | Template | Dati |
|-----------|----------|------|
| Preventivo | `pdf/preventivo.blade.php` | Preventivo + articoli + settings azienda |
| Stampa commessa | `pdf/commessa.blade.php` | Commessa + acconti + preventivi collegati |
| Ricevuta acconto | `pdf/ricevuta.blade.php` | Acconto + dati commessa + cliente |
| Elenco clienti | `pdf/clienti.blade.php` | Lista clienti filtrata |

**Nomenclatura file ricevuta**: `Ric.n {codice} - {cliente} - {data-dd.mm.yy}.pdf`

**Condivisione mobile**: API `/commesse/{id}/ricevute/{accontoId}/pdf` → restituisce il PDF; il frontend usa la **Web Share API** per condividere via WhatsApp/altri.

---

## 6. Storage

Tutti i file sono su **S3-compatible storage** (Cloudflare R2 raccomandato per pricing).

| Bucket/Folder | Contenuto |
|--------------|-----------|
| `logos/{org_id}/logo.png` | Logo aziendale |
| `preventivi-allegati/{org_id}/{prev_id}/` | Allegati calcoli, immagini import PDF |
| `commesse-docs/{org_id}/{commessa_id}/` | Documenti allegati alla commessa |
| `commesse-docs/firmati/{prev_id}/{doc_id}.pdf` | PDF firmati EU-SES |
| `cataloghi/{org_id}/` | Cataloghi prodotti (PDF pubblici) |
| `magazzino/{org_id}/{prod_id}/` | Immagini e file DXF prodotti |

**URL firmati**: tutti i file privati vengono esposti tramite URL temporanei firmati (1 ora).

---

## 7. PWA e Offline

**Service Worker**: `beyondcode/laravel-pwa` o implementazione custom con Workbox.

**Strategia cache**:
- Shell app → Cache First
- API pagine → Network First con fallback offline
- Asset statici → Cache First

**Offline sync** (per modulo Rilievo):
- I dati del canvas vengono salvati in IndexedDB (Dexie.js, incluso via npm + Vite)
- Al ritorno online → sync automatico con `PATCH /api/rilievo/vani/{id}`
- Badge "Offline" nella topbar quando `navigator.onLine === false`

**Manifest PWA**:
- Nome: "WinStudio"
- Icone: 192px, 512px, maskable
- Theme color: `#0E8F9C`
- Display: standalone

---

## 8. Schema DB — Tabelle principali

```sql
-- Tenancy
organizations (id, nome, slug, created_at)
users (id, organization_id, name, email, password, role, operatore, is_disabled)
settings (id, organization_id, ragione_sociale, piva, logo_path, ...)
permissions (id, organization_id, user_id, modulo, livello)

-- Listini
categorie_listini (id, organization_id, nome, tipo, ordine, ...)
listini (id, categoria_id, organization_id, nome, larghezze, altezze, prezzi, ...)
finiture (id, listino_id, nome, percentuale, ...)
accessori_griglia (id, listino_id, gruppo, gruppo_tipo, nome, tipo_prezzo, prezzo, ...)
listini_liberi (id, categoria_id, nome, ...)
prodotti_listino (id, listino_libero_id, nome, prezzo, ...)
accessori_listino (id, listino_libero_id, nome, prezzo, tipo, ...)

-- Preventivi
preventivi (id, organization_id, numero, cliente_snapshot, stato, ..., firma_stato, ...)
articoli_preventivo (id, preventivo_id, tipo, descrizione, note, qty, prezzo_unitario, ...)
allegati_calcoli (id, preventivo_id, organization_id, nome, storage_path, ordine)
cataloghi (id, organization_id, nome, storage_path)
preventivi_cataloghi (preventivo_id, catalogo_id)

-- Commesse
gruppi_commesse (id, organization_id, nome, ordine)
commesse (id, organization_id, gruppo_id, numero_commessa, stato, reparti, ...)
acconti_commessa (id, commessa_id, organization_id, importo, data_pagamento, metodo_pagamento, ...)
documenti_commessa (id, commessa_id, organization_id, nome_file, storage_path, tipo_documento)
preventivi_commessa (id, commessa_id, organization_id, preventivo_id, storage_path, ordine)

-- Clienti
clienti (id, organization_id, tipo, nome, cognome, ragione_sociale, email, telefono, ...)

-- Magazzino
magazzino_fornitori (id, organization_id, nome, ...)
magazzino_prodotti (id, organization_id, fornitore_id, categoria_id, codice, nome, ...)
magazzino_varianti (id, prodotto_id, nome, codice, ...)
magazzino_movimenti (id, organization_id, prodotto_id, tipo, quantita, data_movimento, ...)

-- Rilievo
rilievo_sessioni (id, organization_id, nome, data_rilievo)
rilievo_vani (id, sessione_id, nome, larghezza_mm, altezza_mm, canvas_data)
```

---

## 9. API Routes (JSON)

Per interazioni AJAX e mobile (future):

```
GET    /api/preventivi/{id}/pdf        → scarica PDF preventivo
POST   /api/firma/callback             → webhook EU-SES (no auth, no CSRF)
GET    /api/track/email/{id}           → tracking pixel preventivo
GET    /api/track/ordine/{token}       → tracking pixel ordine fornitore
POST   /api/track/ordine/{token}/visita → beacon apertura pagina ordine
GET    /o/{token}                      → pagina pubblica ordine fornitore (no auth)
GET    /o/{token}/pdf                  → download tracciato dell'ordine (no auth)
GET    /api/firma/verifica/{id}        → polling stato firma
POST   /api/rilievo/vani/sync          → sync offline data
GET    /api/commesse/{id}/ricevute/{accontoId}/pdf → PDF ricevuta (share mobile)
```

---

## 10. Configurazione ambiente

```env
APP_NAME="WinStudio"
APP_URL=https://app.gestionale-infissi.com

DB_CONNECTION=pgsql
DB_HOST=...
DB_DATABASE=gestionale_infissi
DB_USERNAME=...
DB_PASSWORD=...

FILESYSTEM_DISK=s3
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_DEFAULT_REGION=auto
AWS_BUCKET=gestionale-infissi
AWS_ENDPOINT=https://xxx.r2.cloudflarestorage.com

MAIL_MAILER=smtp
MAIL_HOST=smtp.resend.com
MAIL_USERNAME=resend
MAIL_PASSWORD=re_xxxxx

OPENAPI_IT_TOKEN=6a10844afae5366433015ad8

REDIS_URL=redis://...
QUEUE_CONNECTION=redis
```

---

## 11. Logica prezzi infissi (invariante)

Queste regole di business si replicano identiche in PHP in `PricingService`:

**Trasporto**:
- 0 pezzi → €0
- 1–10 pezzi → €350 fisso
- >10 pezzi → €350 + €30 per ogni pezzo oltre il 10°

**Griglia prezzi**:
- Chiavi nel JSON sono stringhe numeriche
- Si arrotonda per eccesso alla prima larghezza ≥ richiesta e prima altezza ≥ richiesta
- Se fuori griglia → prezzo non disponibile

**Sconti**:
- Sconto riga: applicato su `prezzo_unitario × qty`
- Sconto globale: applicato sul subtotale totale (dopo trasporto)
- Tipo sconto: percentuale o importo fisso

**IVA**: applicata sul totale dopo tutti gli sconti.

---

## 12. Moduli backlog (non ancora implementati)

| Modulo | Priorità | Note |
|--------|----------|------|
| Rilievo FASE B-D | Alta | Database profili, configurazione, calcolo prezzi |
| Import/Export dati | Media | Export CSV/Excel commesse, clienti, preventivi |
| `commessa_ref` → FK | Bassa | Movimenti magazzino collegati a commesse reali |
| App mobile nativa | Bassa | Valutare React Native o Flutter per rilievo offline |

---

## 13. Note implementative critiche

1. **Numerazione preventivi**: usare una sequence PostgreSQL per atomicità — mai calcolare `MAX(numero) + 1` senza lock.

2. **Note articolo**: il campo `note` contiene `\n` letterali. Usare sempre `white-space: pre-line` in CSS o `nl2br()` in Blade.

3. **Firma elettronica**: il token openapi.it ha restrizioni IP — funziona solo dal server di produzione, mai in locale. Usare `OPENAPI_IT_TOKEN=` vuoto in dev e moccare la risposta.

4. **PDF EU-SES**: inviare base64 puro (senza prefisso `data:application/pdf;base64,`).

5. **cliente_snapshot**: al momento della creazione del preventivo, copiare i dati del cliente in un campo JSON `cliente_snapshot` — così il preventivo è storicamente immutabile anche se il cliente viene modificato.

6. **Canvas rilievo**: il campo `canvas_data` è un JSON complesso. Definire uno schema tipizzato e validarlo in PHP con regole custom.

7. **Multi-tenancy**: usare un middleware `SetOrganization` che inietta l'organization corrente nel container IoC — tutti i modelli la leggono da lì tramite il global scope.

8. **DXF viewer**: parsing in PHP con `php-dxf-parser` (libreria community) → genera SVG semplificato. Per geometrie complesse considerare un microservizio Node.

9. **Ordine commesse drag-and-drop**: Livewire + SortableJS → al drop, `PATCH /commesse/ordine` con array di `{id, ordine}`.

10. **Permessi modulo**: implementare con middleware `CheckModuloPermission::class` su ogni route group di modulo, non inline nei controller.
