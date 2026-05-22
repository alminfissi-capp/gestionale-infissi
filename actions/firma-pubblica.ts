'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { generatePreventivoPdf } from '@/lib/pdf/generatePreventivoPdf'
import type { Settings } from '@/types/impostazioni'

const EU_SES_BASE =
  process.env.NODE_ENV === 'production'
    ? 'https://esignature.openapi.com'
    : 'https://test.esignature.openapi.com'

const SUPPORTED_IMG = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const ct = (res.headers.get('content-type') || 'image/png').split(';')[0].trim()
    const buf = Buffer.from(await res.arrayBuffer())
    if (SUPPORTED_IMG.includes(ct)) return `data:${ct};base64,${buf.toString('base64')}`
    return null
  } catch { return null }
}

/**
 * Avvia il processo di firma EU-SES quando il cliente clicca "Accetta" sulla
 * pagina pubblica del preventivo. Non richiede autenticazione utente.
 *
 * @param shareToken  token pubblico del preventivo (da URL /p/[token])
 * @param telefonoOverride  cellulare digitato dal cliente (se non nel snapshot)
 */
export async function avviaFirmaPreventivo(
  shareToken: string,
  telefonoOverride?: string
): Promise<{ signingUrl: string }> {
  const service = createServiceClient()

  const { data: prev } = await service
    .from('preventivi')
    .select('*')
    .eq('share_token', shareToken)
    .single()

  if (!prev) throw new Error('Preventivo non trovato')
  if (prev.firma_stato === 'firmato') throw new Error('Preventivo già firmato')
  if (prev.firma_stato === 'in_attesa') throw new Error('Firma già in corso')

  const [{ data: articoli }, { data: settingsRaw }] = await Promise.all([
    service.from('articoli_preventivo').select('*').eq('preventivo_id', prev.id).order('ordine'),
    service.from('settings').select('*').eq('organization_id', prev.organization_id).maybeSingle(),
  ])

  const settings = settingsRaw as Settings | null

  // Logo → data URL (react-pdf richiede data URL o URL pubblico con estensione)
  let logoData: string | null = null
  if (settings?.logo_url) {
    const { data } = await service.storage.from('logos').createSignedUrl(settings.logo_url, 300)
    if (data?.signedUrl) logoData = await toDataUrl(data.signedUrl)
  }

  // Immagini articoli → data URL
  const articoliConImg = await Promise.all(
    (articoli ?? []).map(async (a) => {
      if (!a.immagine_url) return a
      const img = await toDataUrl(a.immagine_url)
      return { ...a, immagine_url: img }
    })
  )

  const preventivo = {
    ...prev,
    articoli: articoliConImg,
    cataloghi_allegati_data: [],
    allegati_calcoli_data: [],
  }

  const pdfBuffer = await generatePreventivoPdf(preventivo, settings, logoData)
  const pdfBase64 = pdfBuffer.toString('base64')
  const pdfName = prev.numero ? `preventivo-${prev.numero}.pdf` : 'preventivo.pdf'

  // Dati firmatario dal snapshot
  const snap = prev.cliente_snapshot as {
    tipo?: string; ragione_sociale?: string | null
    nome?: string | null; cognome?: string | null
    email?: string | null; telefono?: string | null
  }
  const nomeCompleto =
    snap.tipo === 'azienda'
      ? (snap.ragione_sociale || 'Cliente')
      : [snap.nome, snap.cognome].filter(Boolean).join(' ') || 'Cliente'

  const parts = nomeCompleto.trim().split(/\s+/)
  const signerName = parts[0] || 'Cliente'
  const signerSurname = parts.slice(1).join(' ') || ' '
  const signerEmail = snap.email || ''
  const signerMobile = telefonoOverride || snap.telefono || ''

  if (!signerMobile) throw new Error('Numero di cellulare obbligatorio per ricevere il codice OTP')

  const firmaToken = crypto.randomUUID()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  const payload = {
    inputDocuments: [{ uri: `data:application/pdf;base64,${pdfBase64}`, title: pdfName }],
    signers: [{
      name: signerName,
      surname: signerSurname,
      email: signerEmail,
      mobile: signerMobile,
      authentication: ['sms'],
      signatures: [{
        documentTitle: pdfName,
        pageNumber: 1,
        x: 70,
        y: 680,
        signatureName: 'Firma Cliente',
      }],
    }],
    callbackUrl: `${appUrl}/api/firma-callback?token=${firmaToken}`,
    redirectUrl: `${appUrl}/conferma/${firmaToken}/grazie`,
    signatureMode: ['typed', 'drawn'],
  }

  const res = await fetch(`${EU_SES_BASE}/EU-SES`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAPI_IT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`openapi.it errore ${res.status}: ${err}`)
  }

  const data = await res.json()
  const documentId: string = data.id
  const signingUrl: string =
    data.signers?.[0]?.signingUrl ??
    data.signers?.[0]?.url ??
    data.signingUrl ??
    ''

  if (!signingUrl) throw new Error('openapi.it non ha restituito il link di firma')

  await service.from('preventivi').update({
    token_conferma: firmaToken,
    firma_documento_id: documentId,
    firma_stato: 'in_attesa',
    firma_richiesta_at: new Date().toISOString(),
    stato: 'inviato',
  }).eq('id', prev.id)

  return { signingUrl }
}
