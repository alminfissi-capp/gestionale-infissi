# Pagamenti online dei preventivi + chiavi dei servizi gestite da WinStudio

Data: 2026-11-15. Stato: in approvazione.

## Perché

Il cliente che accetta un preventivo deve poter pagare subito l'acconto (o il totale) **con carta, PayPal,
Apple/Google Pay o a rate**, oltre al bonifico di oggi. L'utente ha già scritto un modulo indipendente,
`alm-pagamenti` (Dropbox `WIN STUDIO SOFTWARE/alm-pagamenti`, Next.js + Stripe Checkout, 29 test): va portato
**dentro WinStudio**. Principio generale chiesto dall'utente: **gestire tutto il possibile da WinStudio**, comprese
le chiavi di accesso dei servizi (openapi.it per la firma e i crediti, Stripe per i pagamenti), senza passare da Vercel.

## Obiettivi

1. In Impostazioni l'utente scrive le credenziali di openapi.it e di Stripe; WinStudio si collega da solo
   (saldo crediti openapi.it, firma, pagamenti). Le chiavi non tornano mai nel browser.
2. Dal dettaglio del preventivo l'operatore attiva il pagamento online **preventivo per preventivo** (scelta A
   dell'utente): acconto in % o totale, rate sì/no, saldo online dopo l'acconto sì/no.
3. Il cliente vede "Paga ora" sulla pagina del preventivo `/p/[token]` e sulla pagina di ringraziamento dopo la
   firma, solo a preventivo accettato o firmato; paga su Stripe Checkout; torna a una pagina di esito.
4. A pagamento riuscito: riga in `acconti_commessa` (metodo `carta` o `rate`) se la commessa esiste; se non esiste
   ancora, l'acconto si aggiunge quando la commessa viene creata dal preventivo. Email "Acconto pagato online" e
   etichetta "Pagato online" su preventivo e commessa.

## Non obiettivi

- Cambiare da soli lo stato della commessa: dal limbo `in_attesa` a `da_iniziare` la porta sempre l'utente.
- Pagamenti dentro il rilievo, le commesse anonime o gli ordini fornitore.
- Commissioni Stripe come costo nelle statistiche (si vedono su Stripe; eventuale fase successiva).
- Rimborsi parziali: restano su Stripe; WinStudio segna solo il rimborso totale.
- Abbonamento di WinStudio (`actions/subscription.ts`): altra cosa, non si tocca.

## Anti-obiettivi (fallimento anche se "funziona")

- Pagamento online su un lavoro con **detrazione fiscale** (serve il bonifico parlante: il cliente perde la detrazione).
- Una chiave segreta leggibile dal browser o da un utente senza permesso di scrittura sulle Impostazioni.
- Un pagamento riuscito che non diventa acconto (webhook rifiutato dal database: oggi il CHECK di
  `acconti_commessa.metodo_pagamento` accetta solo contanti/bonifico/riba/altro e il modulo scriverebbe `online_card`).
- Doppio acconto per lo stesso pagamento (evento Stripe ripetuto, o commessa creata dopo).
- Testi promozionali sulle rate ("senza interessi"...): dal 20/11/2026 vale la direttiva CCD2, solo i testi
  ufficiali di Stripe/Klarna.

## Vincoli

- Next.js 16 App Router, Server Actions in `actions/`, `getOrgId()`, RLS con `get_user_organization_id()`.
- Pagine pubbliche: **nessuna policy anon**, letture e scritture solo dal server con `createServiceClient()`
  filtrando per token; ai componenti client solo `preventivoPerCliente()` (vedi
  `lib/preventivo-pubblico.ts`, falla chiusa il 2026-11-15).
- Segreti nel **Vault** di Supabase con funzioni `SECURITY DEFINER` eseguibili solo dal service role (stesso
  schema di `fic_salva_token` / `fic_leggi_token`).
- Stripe Checkout ospitato da Stripe (nessun dato carta in WinStudio). Rate: Klarna in Italia fino a 3.000 €,
  Scalapay spesso esclude l'edilizia: valgono solo i metodi attivati e approvati nella dashboard Stripe.
- Clienti azienda: niente rate (Klarna/Scalapay/Alma non accettano B2B).
- Token openapi.it della firma: funziona solo da Vercel (restrizione IP).

## Approcci considerati

1. **Dentro WinStudio (scelto dall'utente).** Il motore di `alm-pagamenti` (`regole.ts`, `servizio.ts`,
   `gateway.ts`, test) entra in `lib/pagamenti/`; pannello operatore con i componenti di WinStudio; riquadro cliente
   nelle pagine pubbliche esistenti; webhook e checkout come route API. Un solo sito, regole di sicurezza già
   sistemate, legame diretto con commesse e acconti.
2. App separata `paga.alminfissi.it` (opzione A della guida del modulo): più veloce da mettere online, ma il
   cliente cambia sito, due pubblicazioni, e il legame con le commesse va scritto comunque in WinStudio.
3. Link di pagamento Stripe creati a mano: scartato, niente blocchi automatici né registrazione acconti.

## Il progetto

### Parte 1 — Collegamenti nelle Impostazioni (prima, serve alla Parte 2)

Nuovo tab **"Collegamenti"** in Impostazioni (sposta lì anche la scheda "Crediti openapi.it").

- **openapi.it**: email dell'account, APIkey, token della firma. Il saldo usa email + APIkey
  (`GET https://oauth.openapi.it/credit`, Basic Auth, `data.credit`). I tre percorsi della firma
  (`actions/firma.ts`, `app/api/avvia-firma/route.ts`, `actions/firma-pubblica.ts`) e il callback leggono il
  token da qui, con ripiego sulla variabile `OPENAPI_IT_TOKEN` finché non è stato scritto in WinStudio
  (nessuna interruzione delle firme).
- **Stripe**: chiave segreta (`sk_test_…` o `sk_live_…`). Al salvataggio WinStudio verifica la chiave con Stripe e
  **crea da solo il webhook** (`/api/stripe/webhook/{orgId}` con i 5 eventi del modulo), salvando il segreto
  `whsec_…` che Stripe restituisce; se un webhook WinStudio esiste già lo sostituisce. Mostra "Modalità prova" o
  "Modalità reale" dal prefisso della chiave.
- Segreti nel Vault con nome `integrazione_{servizio}_{campo}_{orgId}`; funzioni generiche
  `integrazione_salva(org, nome, valore)`, `integrazione_leggi`, `integrazione_elimina`, solo service role.
  Tabella `integrazioni` (organization_id, servizio, campo, ultime4, aggiornato_at) per mostrare
  "salvata, termina con …1234" senza mai rileggere il valore.
- I campi sono **solo scrittura**: si sostituiscono o si cancellano, non si rivedono. Salvare/cancellare richiede il
  permesso `impostazioni` in scrittura (server action, controllo lato server).
- `lib/integrazioni.ts` lato server: `chiaveServizio(orgId, servizio, campo)` = Vault, poi variabile d'ambiente.

### Parte 2 — Pagamento online

**Dati** (migration nuova, dalla `001_pagamenti_online.sql` del modulo):
- `pagamenti_online` e `pagamenti_impostazioni_preventivo` come nel modulo (RLS select per organizzazione,
  scritture del cliente/webhook solo dal service role; il pannello salva con una server action).
- `acconti_commessa.metodo_pagamento`: CHECK allargato con `carta` e `rate`; colonna
  `pagamento_online_id` (FK a `pagamenti_online`, unica) per non registrare due volte lo stesso pagamento.
- Rate = metodo Stripe `klarna`, `scalapay`, `alma`; tutto il resto (card, paypal, link, apple/google pay,
  satispay) = `carta`.

**Pannello operatore** nel dettaglio del preventivo (`DettaglioPreventivo`, accanto a firma/WhatsApp):
interruttore, acconto % (20/30/40/50 o a mano) o totale, rate sì/no (bloccate per clienti azienda), saldo online
sì/no, casella **"Lavoro con detrazione fiscale"** che blocca il pagamento online. Mostra l'importo che pagherà il
cliente, lo stato dei pagamenti (pagato, in conferma, rimborsato) e il link da copiare; il messaggio WhatsApp
esistente aggiunge la frase del pagamento solo se attivo. Senza chiave Stripe salvata il pannello lo dice e
rimanda a Impostazioni → Collegamenti.

**Cliente**:
- Riquadro "Pagamento" nella pagina `/p/[token]` (sotto al documento) e nella pagina di ringraziamento
  `/conferma/[token]/grazie`: importo, metodi mostrati, pulsante **Paga ora**; i messaggi di blocco del modulo
  (`MESSAGGI_BLOCCO`) quando non si può pagare; bonifico come alternativa (IBAN dell'azienda, solo qui e solo se
  il pagamento è attivo o il preventivo è accettato).
- `POST /api/pagamenti/checkout { token, tipo }`: importo ricalcolato sul server, un checkout aperto chiude il
  precedente, sessione Stripe con la chiave dell'organizzazione del preventivo.
- Pagina di esito `/p/[token]/esito`: "Pagamento ricevuto, grazie" / "in conferma" / "non riuscito, riprova".

**Webhook** `POST /api/stripe/webhook/[orgId]`: firma verificata col segreto dell'organizzazione, eventi
normalizzati come nel modulo, idempotente. Su "riuscito":
1. `pagamenti_online` → `pagato` (metodo, payment intent, data);
2. se il preventivo è collegato a una commessa (`preventivi_commessa`), riga in `acconti_commessa` con
   `pagamento_online_id`, metodo `carta`/`rate`, nota "Pagamento online (Klarna) – acconto preventivo N – rif. pi_…";
3. email "Acconto pagato online" all'email dell'azienda (Resend), con link alla commessa o al preventivo.

**Creazione della commessa dal preventivo** (`actions/commesse.ts`): i pagamenti online `pagato` del preventivo
senza acconto diventano acconti della nuova commessa (stessa regola del punto 2, una volta sola grazie al vincolo
unico). La commessa nasce nello stato che sceglie l'utente, come oggi.

**Etichette**: "Pagato online" (con importo) nella lista preventivi e nel dettaglio commessa, dalla vista
`v_pagamenti_preventivo` del modulo.

### Cosa resta a chi costruisce

- Grafica di pannello e riquadro con i componenti shadcn di WinStudio (niente CSS `almpp-` del modulo).
- Il simulatore del modulo non entra; i test del modulo (regole, servizio, webhook) entrano adattati, con il
  gateway finto in memoria.
- Incassi verso Fatture in Cloud: gli acconti `carta`/`rate` passano dal motore esistente come gli altri;
  verificare il conto di pagamento usato su FiC per i due metodi nuovi.

## Ordine

1. Parte 1 (Collegamenti + Vault + firma che legge il token da WinStudio).
2. Parte 2 con chiavi Stripe di **prova**, prove complete (acconto, saldo, rate, azienda, detrazione, rimborso).
3. Metodi attivati e approvati in Stripe, poi chiave **reale**: basta sostituirla in Impostazioni (il webhook reale
   si crea da solo).
