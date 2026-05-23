# CLAUDE.md — Contesto progetto gestionale-infissi

## Stack tecnico
- **Framework**: Next.js 16.1.6 (App Router, React 19, TypeScript 5, webpack)
- **Database / Auth / Storage**: Supabase (PostgreSQL + RLS, progetto `xawyrtqclpeylxnhwhwo`)
- **Deploy**: Vercel — dominio produzione `https://gestionale-infissi.vercel.app`
- **E-signature**: openapi.it EU-SES v1.0.17 (endpoint produzione `https://esignature.openapi.com`)
- **Email**: Resend
- **PDF lato client**: `@react-pdf/renderer`

## Variabili d'ambiente richieste (Vercel + .env.local)
```
NEXT_PUBLIC_SUPABASE_URL=https://xawyrtqclpeylxnhwhwo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
RESEND_API_KEY=...
OPENAPI_IT_TOKEN=6a10844afae5366433015ad8
NEXT_PUBLIC_APP_URL=https://gestionale-infissi.vercel.app
```

`NEXT_PUBLIC_APP_URL` **deve essere impostato in Vercel** (Settings → Environment Variables), altrimenti il callback di openapi.it non funziona.

## Architettura firma elettronica (EU-SES)

### Tre percorsi di firma — tutti devono essere aggiornati insieme
| File | Quando viene usato |
|------|-------------------|
| `actions/firma.ts` → `richiediFirmaPreventivo` | Dialog admin (pulsante "Richiedi firma" nel pannello) |
| `app/api/avvia-firma/route.ts` | Pagina pubblica `/p/[token]` → cliente clicca "Accetta" |
| `actions/firma-pubblica.ts` → `avviaFirmaPreventivo` | Alternativa pubblica (usata da alcune versioni del componente) |

### Formato payload EU-SES corretto (POST /EU-SES)
```typescript
{
  inputDocuments: [{ sourceType: 'base64', payload: pdfBase64 }],  // base64 puro, NO data URI
  signers: [{
    name, surname, email, mobile,
    authentication: ['sms'],
    signatures: [{ page: 1, x: '70', y: '680' }],  // x,y come stringhe
    language: 'it',
  }],
  callbackUrl: `${appUrl}/api/firma-callback?token=${firmaToken}`,  // top-level, NON nested
  redirectUrl: `${appUrl}/conferma/${firmaToken}/grazie`,
  signatureMode: ['typed', 'drawn'],
}
```

**Errori comuni da non ripetere:**
- `inputDocuments[].uri` con data URI → **sbagliato** (PDF non visibile su openapi.it). Usare `sourceType:'base64'` + `payload`
- `callback: { method:'JSON', url:'...' }` nested → **non riconosciuto** da openapi.it. Usare `callbackUrl` top-level
- `signatures[].pageNumber` / `documentTitle` / `signatureName` → **sbagliato**. Usare `page`, `x` e `y` come stringhe

### Callback (POST /api/firma-callback)
- openapi.it chiama `callbackUrl` al completamento/rifiuto/scadenza
- Body atteso: `{ id: documentId, state: 'COMPLETED'|'REJECTED'|'EXPIRED', ... }`
- Il route aggiorna `firma_stato`, scarica il PDF firmato da openapi.it e lo salva in Supabase Storage (`commesse-docs/firmati/{prevId}/{documentId}.pdf`)

### Download PDF firmato
- Quando `firma_stato = 'firmato'`, il callback chiama `GET /EU-SES/{documentId}` e cerca `downloadUrl` nella risposta
- Il path viene salvato in `firma_pdf_path`
- L'admin vede il pulsante "Scarica PDF firmato" → genera URL firmato Supabase (1h) tramite `getFirmaSignedUrl`

## Schema DB — colonne firma su `preventivi`
| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| `share_token` | uuid | Link pubblico cliente `/p/[token]` |
| `token_conferma` | uuid | Token univoco per il callback openapi.it |
| `firma_documento_id` | text | ID documento su openapi.it |
| `firma_signing_url` | text | Link di firma openapi.it (salvato per rimandarlo al cliente) |
| `firma_stato` | text | `in_attesa` / `firmato` / `rifiutato` / `scaduto` |
| `firma_richiesta_at` | timestamptz | Quando è stata avviata la firma |
| `firma_completata_at` | timestamptz | Quando il cliente ha firmato |
| `firma_pdf_path` | text | Path Supabase Storage del PDF firmato |

## Funzionalità admin (DettaglioPreventivo)
- **"Copia link firma"**: visibile quando `firma_stato = in_attesa` e `firma_signing_url` è salvato — permette di rimandare il link al cliente se chiude la pagina
- **WhatsApp firma**: apre wa.me con il link di firma pre-compilato
- **"Scarica PDF firmato"**: visibile quando `firma_stato = firmato` e `firma_pdf_path` è valorizzato

## Note operative
- Il token openapi.it ha restrizioni IP: funziona solo da Vercel (produzione), non da localhost
- In locale `NODE_ENV=development` → endpoint `https://test.esignature.openapi.com` → il token di produzione restituisce 401. Testare sempre in produzione
- Le sessioni di firma vecchie (con callback sbagliato registrato) non riceveranno mai il callback — serve creare una nuova sessione
- Supabase MCP: `.mcp.json` deve stare nella root della sessione Claude Code (`WinStudio/`), non nella sottocartella del progetto
