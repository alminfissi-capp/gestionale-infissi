# Pagamenti online + Collegamenti in Impostazioni — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** chiavi di openapi.it e Stripe scritte in WinStudio (Vault), e pagamento online (Stripe Checkout) dei preventivi accettati, con acconto registrato in commessa e avviso in dashboard ed email.

**Architecture:** segreti nel Vault di Supabase con funzioni solo service role (come `fic_salva_token`); `lib/integrazioni.ts` li legge sul server con ripiego sulle variabili d'ambiente. Il motore del modulo `alm-pagamenti` (regole, servizio, gateway) entra in `lib/pagamenti/` con configurazione passata come oggetto (non piu' da env) e archivio Supabase via service client. Pagine pubbliche e webhook lavorano solo dal server.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres, RLS, Vault), Stripe Node SDK (`stripe`), Resend, Vitest, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-11-15-pagamenti-online-design.md`

**Sorgente da portare:** `C:\Users\almin\Dropbox\Ufficio\-- LISTINI & CATALOGHI --\WIN STUDIO SOFTWARE\alm-pagamenti\alm-pagamenti\` (`src/lib/pagamenti/*`, `tests/*`, `supabase/migrations/001_pagamenti_online.sql`).

## Global Constraints

- Nessuna policy `TO anon`; pagine pubbliche e webhook solo con `createServiceClient()` filtrando per token/orgId; ai componenti client solo dati gia' ripuliti (`preventivoPerCliente`, `settingsPerCliente`).
- Segreti mai restituiti al browser: le server action tornano al massimo `ultime4` e `aggiornato_at`.
- Salvare/cancellare un collegamento: `requireAccesso('impostazioni', 'scrittura')`.
- Pagamento online spento di default; bloccato con `con_detrazione_fiscale`; rate escluse per `cliente_snapshot.tipo === 'azienda'` o `rate_abilitate = false`; metodi rateali Stripe = `['klarna', 'scalapay', 'alma']`.
- Metodo acconto: `klarna|scalapay|alma` -> `'rate'`, qualunque altro -> `'carta'`.
- La commessa non cambia mai stato per un pagamento.
- Testi sulle rate: nessuna promessa ("senza interessi"...), solo nomi dei metodi (CCD2 dal 20/11/2026).
- Migrazioni: file in `supabase/migrations/` e `apply_migration` PRIMA di pubblicare il codice che le usa; togliere permessi: prima il codice, poi la migration.
- Lingua dell'interfaccia e dei commenti: italiano.

## Review Focus

1. Stripe ripete lo stesso evento `checkout.session.completed` -> un solo `pagato` e un solo acconto (vincolo unico `acconti_commessa.pagamento_online_id`). Test in Task 6.
2. Il cliente paga su una sessione gia' "annullata" (aveva due schede aperte) -> il pagamento si registra lo stesso. Test in Task 3.
3. Il preventivo cambia totale dopo l'acconto -> il saldo e' nuovo totale meno pagato, mai negativo; sotto 0,50 EUR "saldato". Test in Task 3.
4. Chiave Stripe sostituita (prova -> reale) -> il webhook WinStudio precedente su quell'account viene eliminato e ne nasce uno solo nuovo. Test in Task 5.
5. `setPreventiviCommessa` cancella e reinserisce i collegamenti -> nessun acconto duplicato ne' perso per i pagamenti gia' registrati. Test in Task 9.

---

### Task 1: Firma — token da WinStudio e conferma solo col PDF firmato

**Files:**
- Create: `supabase/migrations/20261116100000_integrazioni.sql`, `lib/integrazioni.ts`, `lib/integrazioni.test.ts`
- Modify: `actions/firma.ts` (righe con `OPENAPI_IT_TOKEN`: 89, 147, 222), `actions/firma-pubblica.ts:131`, `app/api/avvia-firma/route.ts:119`, `app/api/firma-callback/route.ts:63`, `app/(public)/conferma/[token]/grazie/page.tsx:20,57-80`, `actions/openapi.ts`

**Interfaces:**
- Produces (SQL, solo service role): `integrazione_salva(p_org uuid, p_nome text, p_valore text) returns uuid`, `integrazione_leggi(p_org uuid, p_nome text) returns text`, `integrazione_elimina(p_org uuid, p_nome text) returns void`; tabella `integrazioni(organization_id, servizio text, campo text, ultime4 text, aggiornato_at timestamptz, unique(organization_id, servizio, campo))` con RLS select per organizzazione.
- Produces (TS, `lib/integrazioni.ts`, server only): `type Servizio = 'openapi' | 'stripe'`; `type CampoIntegrazione = 'email' | 'apikey' | 'token_firma' | 'chiave_segreta' | 'segreto_webhook' | 'id_webhook'`; `nomeSegreto(servizio, campo): string` (= `${servizio}_${campo}`, il Vault aggiunge l'org come in FiC: nome completo `integrazione_${servizio}_${campo}_${orgId}`); `ultime4(valore: string): string`; `async leggiSegreto(orgId: string, servizio: Servizio, campo: CampoIntegrazione): Promise<string | null>` (Vault, poi env: `openapi.email`->`OPENAPI_IT_EMAIL`, `openapi.apikey`->`OPENAPI_IT_APIKEY`, `openapi.token_firma`->`OPENAPI_IT_TOKEN`, stripe senza ripiego); `async tokenFirma(orgId: string): Promise<string | null>`.

- [ ] **Step 1: test** `lib/integrazioni.test.ts`: `ultime4('sk_test_abc1234') === '1234'`; `ultime4('ab') === 'ab'`; `nomeSegreto('openapi','apikey') === 'openapi_apikey'`; `variabileRipiego('openapi','token_firma') === 'OPENAPI_IT_TOKEN'`, `variabileRipiego('stripe','chiave_segreta') === null` (esporta anche `variabileRipiego`).
- [ ] **Step 2:** `npx vitest run lib/integrazioni` -> FAIL (modulo assente).
- [ ] **Step 3:** migration (funzioni come `fic_salva_token` in `20260928100000_fatture_in_cloud.sql:95-133`, `REVOKE ... FROM public, anon, authenticated`, `GRANT EXECUTE ... TO service_role`) + `lib/integrazioni.ts` (`import 'server-only'`, rpc `integrazione_leggi` col service client).
- [ ] **Step 4:** `npx vitest run lib/integrazioni` -> PASS.
- [ ] **Step 5:** sostituire ogni `process.env.OPENAPI_IT_TOKEN` con `await tokenFirma(orgId)` (orgId: `getOrgId()` nelle action admin; `organization_id` del preventivo letto per token nelle route pubbliche e nel callback: aggiungere la colonna alla select). Se `null`: errore "Token firma openapi.it non configurato (Impostazioni → Collegamenti)". `actions/openapi.ts`: email/apikey da `leggiSegreto`.
- [ ] **Step 6:** grazie page: `firma_stato = 'firmato'` e `stato = 'accettato'` SOLO se `tentaDownloadPdfFirmato` restituisce un path (stesso criterio del callback del commit 4a945ca); altrimenti nessuna scrittura (la pagina resta "grazie", il callback o la verifica manuale completano dopo).
- [ ] **Step 7:** `npx tsc --noEmit -p .` e `npx eslint` sui file toccati -> nessun errore; `grep -rn "OPENAPI_IT_TOKEN" app actions` -> solo dentro `lib/integrazioni.ts`.
- [ ] **Step 8:** `apply_migration integrazioni`; commit `feat(integrazioni): segreti nel Vault, token firma da WinStudio, grazie conferma solo col PDF`.

### Task 2: Impostazioni → tab "Collegamenti" (openapi.it)

**Files:**
- Create: `actions/integrazioni.ts`, `components/impostazioni/SezioneCollegamenti.tsx`, `components/impostazioni/CampoSegreto.tsx`
- Modify: `app/(dashboard)/impostazioni/page.tsx` (nuovo `TabsTrigger value="collegamenti"`, sposta la Card "Crediti openapi.it" dentro)

**Interfaces:**
- Consumes: Task 1.
- Produces: `getStatoIntegrazioni(): Promise<Record<\`${Servizio}.${CampoIntegrazione}\`, { ultime4: string; aggiornato_at: string } | null>>`; `salvaIntegrazione(servizio: Servizio, campo: CampoIntegrazione, valore: string): Promise<{ errore?: string }>` (trim, non vuoto, max 500 caratteri; upsert su `integrazioni` + `integrazione_salva`); `eliminaIntegrazione(servizio, campo): Promise<void>`. `CampoSegreto` props: `{ servizio, campo, etichetta, stato, segreto?: boolean }` (input password se `segreto`, mostra "Salvata · termina con …1234 · il 15/11" e pulsanti Sostituisci/Elimina; l'email si mostra intera perche' non segreta: per `campo === 'email'` salvare `ultime4` = email completa).

- [ ] **Step 1:** UI openapi.it: tre `CampoSegreto` (email, APIkey, token firma) + `CreditoOpenapi` sotto, con nota "Il token della firma funziona solo dal sito pubblicato (restrizione IP di openapi.it)".
- [ ] **Step 2:** `npx tsc --noEmit -p .`, `npm run lint` -> puliti.
- [ ] **Step 3:** prova in `npm run dev`: salvare un'email finta -> riga in `integrazioni`, in pagina "Salvata"; `select * from vault.decrypted_secrets where name like 'integrazione_openapi_email_%'` mostra il valore; un utente con permesso impostazioni in sola lettura vede i campi disabilitati.
- [ ] **Step 4:** commit `feat(impostazioni): tab Collegamenti con le chiavi di openapi.it`.

### Task 3: Motore pagamenti portato in `lib/pagamenti/`

**Files:**
- Create: `lib/pagamenti/tipi.ts`, `lib/pagamenti/regole.ts`, `lib/pagamenti/formato.ts`, `lib/pagamenti/servizio.ts`, `lib/pagamenti/archivio.ts` (interfaccia), `lib/pagamenti/gateway.ts`, `lib/pagamenti/metodo.ts`, `lib/pagamenti/regole.test.ts`, `lib/pagamenti/servizio.test.ts`, `lib/pagamenti/test-doppi.ts` (archivio e gateway in memoria per i test)
- Modify: `package.json` (dipendenza `stripe`, versione attuale della 17.x o successiva gia' pubblicata da almeno due settimane)

**Interfaces:**
- Produces: tipi del modulo invariati (`Preventivo`, `ImpostazioniPreventivo`, `Pagamento`, `TipoPagamento`, `StatoPagamento`, `IMPOSTAZIONI_PREDEFINITE`), `calcolaOpzioni`, `MESSAGGI_BLOCCO`, `LIMITI_RATE`, `arrotonda` da `regole.ts` (copia del modulo); `interface ParametriPagamenti { accontoPercentuale: 30; statiPagabili: ['accettato']; richiediFirma: false; metodiRateali: ['klarna','scalapay','alma']; baseUrl: string }`; `interface Archivio` = metodi del modulo (`preventivoDaToken`, `preventivoDaId`, `impostazioni`, `pagamenti`, `creaPagamento`, `aggiornaStato`, `pagamentoDaPaymentIntent`, `commessaDelPreventivo`) **piu'** `registraAccontoDaPagamento(pagamento: Pagamento, commessaId: string, metodo: string | null): Promise<string | null>`; `creaGatewayStripe(chiaveSegreta: string): Gateway`; `avviaPagamento(token, tipo, d)`, `normalizzaEventoStripe(e)`, `gestisciEvento(ev, d)` come nel modulo ma `d = { archivio, gateway, parametri }` e la registrazione in commessa sempre attiva; `metodoAcconto(tipoStripe: string | null): 'carta' | 'rate'`; `nomeMetodo(m)`.
- URL di ritorno: successo `${baseUrl}/p/${token}/esito?sessione={CHECKOUT_SESSION_ID}`, annulla `${baseUrl}/p/${token}`.

- [ ] **Step 1: test** copiare `tests/regole.test.ts` e `tests/servizio.test.ts` del modulo adattandoli ai doppi in memoria; aggiungere: `metodoAcconto('klarna') === 'rate'`, `metodoAcconto('alma') === 'rate'`, `metodoAcconto('card') === 'carta'`, `metodoAcconto(null) === 'carta'`; Review Focus 2: sessione in stato `annullato` + evento `riuscito` -> `pagato`; Review Focus 3: totale 1000, pagato 300, totale portato a 1200, modalita totale -> opzione saldo 900; totale portato a 300.30 -> `saldato`.
- [ ] **Step 2:** `npx vitest run lib/pagamenti` -> FAIL.
- [ ] **Step 3:** portare i file (senza `config.ts`/`leggiConfig`, senza simulatore, senza `node:fs`).
- [ ] **Step 4:** `npx vitest run lib/pagamenti` -> PASS (tutti i test del modulo adattati + i nuovi).
- [ ] **Step 5:** commit `feat(pagamenti): motore alm-pagamenti in lib/pagamenti`.

### Task 4: Database dei pagamenti

**Files:**
- Create: `supabase/migrations/20261116110000_pagamenti_online.sql`

**Interfaces:**
- Produces: tabelle `pagamenti_online`, `pagamenti_impostazioni_preventivo`, vista `v_pagamenti_preventivo` come in `001_pagamenti_online.sql` del modulo; `acconti_commessa.metodo_pagamento` CHECK = `('contanti','bonifico','riba','altro','carta','rate')`; `acconti_commessa.pagamento_online_id uuid unique references pagamenti_online(id) on delete set null`.

- [ ] **Step 1:** scrivere la migration (idempotente: `if not exists`, `drop constraint if exists`).
- [ ] **Step 2:** `apply_migration pagamenti_online`; verificare con `execute_sql`: `select pg_get_constraintdef(oid) from pg_constraint where conname = 'acconti_commessa_metodo_pagamento_check'` contiene `carta` e `rate`; `insert` di prova di due acconti con lo stesso `pagamento_online_id` fallisce (in transazione con rollback).
- [ ] **Step 3:** commit `feat(pagamenti): tabelle pagamenti online e metodi carta/rate negli acconti`.

### Task 5: Collegamento Stripe da Impostazioni (webhook creato da WinStudio)

**Files:**
- Create: `lib/pagamenti/collegamento-stripe.ts`, `lib/pagamenti/collegamento-stripe.test.ts`, `actions/stripe-collegamento.ts`
- Modify: `components/impostazioni/SezioneCollegamenti.tsx` (Card "Stripe")

**Interfaces:**
- Consumes: Task 1 (`leggiSegreto`, rpc salva/elimina), Task 2 (`CampoSegreto`).
- Produces: `EVENTI_WEBHOOK = ['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','charge.refunded']`; `modalitaChiave(chiave: string): 'prova' | 'reale' | null` (`sk_test_`/`rk_test_` -> prova, `sk_live_`/`rk_live_` -> reale); `async ricreaWebhook(stripe: StripeLike, url: string, orgId: string): Promise<{ id: string; segreto: string }>` (elenca gli endpoint, elimina quelli con `metadata.winstudio_org === orgId`, crea il nuovo con quella metadata); `collegaStripe(chiave: string): Promise<{ errore?: string; modalita?: 'prova' | 'reale' }>` (verifica con `stripe.balance.retrieve()`, `ricreaWebhook` su `${NEXT_PUBLIC_APP_URL}/api/stripe/webhook/${orgId}`, salva `chiave_segreta`, `segreto_webhook`, `id_webhook`); `scollegaStripe(): Promise<void>` (elimina l'endpoint e i tre segreti).

- [ ] **Step 1: test** con uno `StripeLike` finto: due endpoint esistenti (uno con `winstudio_org` = org, uno di un'altra app) -> dopo `ricreaWebhook` resta l'altro + uno nuovo con gli `EVENTI_WEBHOOK`; `modalitaChiave('sk_live_x') === 'reale'`, `modalitaChiave('pk_test_x') === null`.
- [ ] **Step 2:** `npx vitest run lib/pagamenti/collegamento-stripe` -> FAIL; implementare; -> PASS.
- [ ] **Step 3:** Card Stripe: campo chiave segreta, badge "Modalita' prova"/"Modalita' reale", "Collegato · webhook attivo", pulsante Scollega; chiave pubblicabile non richiesta (Checkout ospitato). Una chiave `pk_` mostra l'errore "Serve la chiave segreta (sk_…), non quella pubblicabile".
- [ ] **Step 4:** prova reale in produzione con la `sk_test_` dell'utente: in dashboard Stripe compare un solo endpoint con i 5 eventi; ricollegando, resta uno solo.
- [ ] **Step 5:** commit `feat(impostazioni): collegamento Stripe con webhook creato da WinStudio`.

### Task 6: Webhook, acconto in commessa, email

**Files:**
- Create: `lib/pagamenti/archivio-supabase.ts`, `app/api/stripe/webhook/[orgId]/route.ts`, `lib/pagamenti/avviso-email.ts`, `lib/pagamenti/archivio-supabase.test.ts` (solo la parte pura: costruzione della riga acconto)
- Modify: nessuno

**Interfaces:**
- Consumes: Task 3, 4, 5.
- Produces: `creaArchivioSupabase(service): Archivio`; `rigaAcconto(p: Pagamento, commessaId: string, metodo: string | null, numeroPreventivo: string, oggi: string): { commessa_id, organization_id, importo, data_pagamento, metodo_pagamento: 'carta' | 'rate', note, pagamento_online_id, ritenuta: 0 }` (note: `Pagamento online (${nomeMetodo(metodo)}) – ${p.tipo} preventivo ${numero} – rif. ${p.stripe_payment_intent ?? p.stripe_session_id}`); `inviaAvvisoPagamento(orgId, pagamento): Promise<void>` (Resend, mittente/destinatario `settings.email`, oggetto `Pagamento online ricevuto – preventivo ${numero}`, errori solo nel log).
- Route: `export const runtime = 'nodejs'`; corpo grezzo; segreto da `leggiSegreto(orgId, 'stripe', 'segreto_webhook')` (orgId validato come uuid, se manca 404); firma non valida 400; errore interno 500 (Stripe riprova).
- Registrazione acconto con `insert ... on conflict (pagamento_online_id) do nothing` (Review Focus 1).

- [ ] **Step 1: test** `rigaAcconto` con metodo `klarna` -> `metodo_pagamento 'rate'`, importo uguale, `pagamento_online_id` = id pagamento; servizio con doppi: due `riuscito` uguali -> `registraAccontoDaPagamento` chiamato una volta (Review Focus 1).
- [ ] **Step 2:** FAIL -> implementare -> `npx vitest run lib/pagamenti` PASS.
- [ ] **Step 3:** prova con Stripe in prova: `stripe trigger checkout.session.completed` non basta (sessione sconosciuta = ignorato, 200); la prova vera e' in Task 7 Step 5.
- [ ] **Step 4:** commit `feat(pagamenti): webhook Stripe, acconto in commessa, email di avviso`.

### Task 7: Pagamento lato cliente

**Files:**
- Create: `app/api/pagamenti/checkout/route.ts`, `components/pagamenti/RiquadroPagamento.tsx`, `app/(public)/p/[token]/esito/page.tsx`, `lib/pagamenti/situazione-pubblica.ts`
- Modify: `app/(public)/p/[token]/page.tsx`, `app/(public)/conferma/[token]/grazie/page.tsx`

**Interfaces:**
- Consumes: Task 3, 6.
- Produces: `async situazionePubblica(token: string): Promise<SituazionePubblica | null>` con `SituazionePubblica = { pagabile: boolean; messaggio: string | null; opzioni: { tipo: TipoPagamento; importo: number; etichetta: string; rateIndicative: string[] }[]; inConferma: boolean; giaPagato: number; bonifico: { iban: string; intestatario: string; causale: string } | null }` (niente id interni ne' segreti; `bonifico` solo se pagamento attivo o preventivo accettato, causale `Preventivo ${numero}`); grazie page riceve `share_token` del preventivo per costruire il riquadro. `RiquadroPagamento` props `{ token: string; situazione: SituazionePubblica }`, pulsante "Paga ora" -> `POST /api/pagamenti/checkout { token, tipo }` -> `window.location = url`.
- Checkout route: token uuid, `tipo` in `acconto|saldo`, chiave Stripe dell'organizzazione del preventivo; senza chiave 409 "Pagamento online non disponibile"; errori `ErrorePagamento` col loro status.
- Esito: legge `sessione` dalla query, mostra "ricevuto / in conferma / non riuscito" dallo stato in `pagamenti_online` (se il webhook non e' ancora arrivato: "in conferma", pulsante Aggiorna).

- [ ] **Step 1:** implementare `situazionePubblica` riusando `caricaSituazione`; nessun nuovo test oltre a quelli del motore (logica gia' coperta) tranne: preventivo non attivo -> `pagabile false` e `bonifico` presente solo se accettato.
- [ ] **Step 2:** riquadro in fondo a `/p/[token]` (sotto `StampaPreventivo`, fuori dalla stampa: `print:hidden`) e nella pagina grazie.
- [ ] **Step 3:** `npx tsc --noEmit -p .`, `npm run lint` puliti.
- [ ] **Step 4:** pubblicare; prova in produzione con chiave di prova: preventivo di prova accettato, acconto 30%, carta `4242 4242 4242 4242` -> esito "ricevuto", riga `pagamenti_online` `pagato`, email arrivata; cliente azienda -> Klarna assente dal checkout.
- [ ] **Step 5:** commit `feat(pagamenti): riquadro di pagamento per il cliente, checkout ed esito`.

### Task 8: Pannello operatore nel dettaglio del preventivo

**Files:**
- Create: `actions/pagamenti.ts`, `components/pagamenti/PannelloPagamentoOnline.tsx`
- Modify: `components/preventivi/DettaglioPreventivo.tsx` (pannello accanto alla sezione firma; testo WhatsApp a riga ~210)

**Interfaces:**
- Consumes: Task 3, 4, 5.
- Produces: `getPannelloPagamento(preventivoId: string): Promise<{ impostazioni: ImpostazioniPreventivo; pagamenti: Pagamento[]; anteprima: EsitoRegole; stripeCollegato: boolean; modalita: 'prova' | 'reale' | null }>`; `salvaImpostazioniPagamento(preventivoId: string, imp: Omit<ImpostazioniPreventivo, 'preventivo_id'>): Promise<void>` (`requireAccesso('preventivi', 'scrittura')`, `acconto_percentuale` 1–99 o null, `importo_personalizzato` > 0 o null); `testoWhatsappPagamento(anteprima: EsitoRegole, link: string): string` in `lib/pagamenti/formato.ts` (vuoto se non pagabile; es. "Puoi pagare l'acconto di 1.234,00 € online (carta o rate) da qui: {link}").
- Pannello: interruttore, % (20/30/40/50 o a mano) o totale, rate si'/no (disabilitato e spiegato per clienti azienda), saldo online si'/no, "Lavoro con detrazione fiscale", importo che paghera' il cliente, elenco pagamenti con stato e metodo, link `/p/{share_token}` da copiare; badge "Modalita' prova" se la chiave e' di prova; senza Stripe: messaggio con link a Impostazioni → Collegamenti.

- [ ] **Step 1: test** `testoWhatsappPagamento` (pagabile acconto 30% su 1000 -> contiene "300,00"; non pagabile -> stringa vuota).
- [ ] **Step 2:** FAIL -> implementare -> PASS.
- [ ] **Step 3:** prova in dev: attivare/disattivare salva subito; la pagina `/p/[token]` riflette la scelta.
- [ ] **Step 4:** commit `feat(preventivi): pannello Pagamento online`.

### Task 9: Commessa, dashboard ed etichette

**Files:**
- Create: `lib/pagamenti/attivita.ts`, `lib/pagamenti/attivita.test.ts`
- Modify: `actions/commesse.ts` (`setPreventiviCommessa`, ~riga 414; `createCommessa` ~riga 210), `actions/dashboard.ts` (tipo `ActivityItem['tipo']` + `'pagamento'`, query `pagamenti_online`, esclusione acconti con `pagamento_online_id`), `components/dashboard/DashboardPage.tsx` (icona per `pagamento`), lista preventivi (`components/preventivi/TabellaPreventivi.tsx`) e dettaglio commessa (etichetta "Pagato online € X" da `v_pagamenti_preventivo`)

**Interfaces:**
- Consumes: Task 4, 6 (`rigaAcconto`).
- Produces: `async registraPagamentiInCommessa(service, commessaId: string, preventivoIds: string[]): Promise<number>` (pagamenti `pagato` di quei preventivi senza acconto -> `insert ... on conflict (pagamento_online_id) do nothing`; restituisce quanti ne ha aggiunti), chiamata alla fine di `setPreventiviCommessa` e di `createCommessa` quando ha preventivi collegati; `vociPagamentiDashboard(righe): ActivityItem[]` in `lib/pagamenti/attivita.ts` ("Pagato online — € X (Klarna)" / "Pagamento online rimborsato — € X", href commessa se collegata altrimenti preventivo).

- [ ] **Step 1: test** `vociPagamentiDashboard`: pagamento `pagato` con metodo klarna -> azione "Pagato online — € 300,00 (Klarna)"; `rimborsato` -> "Pagamento online rimborsato — € 300,00"; con commessa -> href `/commesse/{id}`.
- [ ] **Step 2: test** (Review Focus 5) con doppio in memoria: `registraPagamentiInCommessa` chiamata due volte sugli stessi preventivi -> 1 la prima volta, 0 la seconda.
- [ ] **Step 3:** FAIL -> implementare -> PASS; `npx tsc --noEmit -p .`, `npm run lint`.
- [ ] **Step 4:** prova in produzione: pagamento di prova su preventivo senza commessa -> voce in dashboard; creare la commessa dal preventivo -> acconto "carta" presente una volta sola; modificare i preventivi collegati e salvare -> sempre uno.
- [ ] **Step 5:** commit `feat(pagamenti): acconti alla creazione della commessa, dashboard, etichette`.

### Task 10: Chiusura

- [ ] **Step 1:** `npx vitest run` intero, `npx tsc --noEmit -p .`, `npm run lint` -> puliti.
- [ ] **Step 2:** aggiornare `CLAUDE.md` (sezione firma: token da Impostazioni → Collegamenti con ripiego env; nuova sezione pagamenti con le 3 route e la regola "webhook per organizzazione") e la memoria di progetto (PRD + file `project_pagamenti_online.md`).
- [ ] **Step 3:** merge in master, push, eliminare il branch.
