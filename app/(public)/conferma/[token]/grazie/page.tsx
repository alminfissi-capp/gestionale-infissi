import { CheckCircle } from 'lucide-react'
import RiquadroPagamento from '@/components/pagamenti/RiquadroPagamento'
import { caricaSituazionePubblica } from '@/lib/pagamenti/situazione-server'
import { tokenFirmaObbligatorio } from '@/lib/integrazioni'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

interface Props {
  params: Promise<{ token: string }>
}

export const metadata = { title: 'Firma completata' }

async function tentaDownloadPdfFirmato(
  service: ReturnType<typeof createServiceClient>,
  prevId: string,
  documentId: string,
  orgId: string,
): Promise<string | null> {
  try {
    const pdfRes = await fetch(
      `https://esignature.openapi.com/signatures/${documentId}/signedDocument`,
      {
        headers: { Authorization: `Bearer ${await tokenFirmaObbligatorio(orgId)}` },
        cache: 'no-store',
      }
    )
    if (!pdfRes.ok) return null

    const contentType = pdfRes.headers.get('content-type') ?? ''
    let pdfBuffer: Buffer | null = null

    if (contentType.includes('application/json')) {
      const json = await pdfRes.json()
      const downloadUrl =
        json.url ?? json.downloadUrl ?? json.data?.url ?? json.data?.downloadUrl
      if (downloadUrl) {
        const pdf2 = await fetch(downloadUrl)
        if (pdf2.ok) pdfBuffer = Buffer.from(await pdf2.arrayBuffer())
      }
    } else {
      pdfBuffer = Buffer.from(await pdfRes.arrayBuffer())
    }

    if (!pdfBuffer || pdfBuffer.length === 0) return null

    const storagePath = `firmati/${prevId}/${documentId}.pdf`
    const { error } = await service.storage
      .from('commesse-docs')
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

    return error ? null : storagePath
  } catch {
    return null
  }
}

export default async function GraziePerLaFirmaPage({ params }: Props) {
  const { token } = await params

  // Aggiorna automaticamente firma_stato quando il cliente arriva qui dopo aver firmato
  let shareToken: string | null = null
  try {
    const service = createServiceClient()
    const { data: prev } = await service
      .from('preventivi')
      .select('id, organization_id, share_token, firma_stato, firma_documento_id, firma_pdf_path')
      .eq('token_conferma', token)
      .single()

    // Sicurezza: arrivare su questa pagina non prova la firma (il link contiene un codice che il cliente
    // riceve nel browser). "Firmato" solo se openapi.it consegna il PDF firmato, come nel callback.
    shareToken = (prev?.share_token as string | null) ?? null
    if (prev && prev.firma_stato === 'in_attesa' && prev.firma_documento_id) {
      const pdfPath = prev.firma_pdf_path
        ?? await tentaDownloadPdfFirmato(service, prev.id, prev.firma_documento_id, prev.organization_id)
      if (pdfPath) {
        await service.from('preventivi').update({
          firma_stato: 'firmato',
          firma_completata_at: new Date().toISOString(),
          stato: 'accettato',
          firma_pdf_path: pdfPath,
        }).eq('id', prev.id)
        revalidatePath(`/preventivi/${prev.id}`)
      }
    }
  } catch {
    // Non bloccare la pagina per errori
  }

  // Dopo la firma il preventivo e' accettato: se il pagamento online e' attivo, il cliente puo' pagare subito.
  const pagamento = shareToken ? await caricaSituazionePubblica(shareToken).catch(() => null) : null

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border max-w-md w-full p-10 text-center space-y-4">
        <div className="flex justify-center">
          <CheckCircle className="h-16 w-16 text-green-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Firma completata</h1>
        <p className="text-gray-500 text-sm leading-relaxed">
          Grazie! La firma è stata acquisita correttamente.
          Riceverete conferma via email con il documento firmato.
        </p>
        {!pagamento?.pagabile && !pagamento?.inAttesaFirma && (
          <p className="text-xs text-gray-400 pt-2">
            Questa pagina può essere chiusa.
          </p>
        )}
      </div>
      {shareToken && pagamento && <div className="w-full max-w-md mt-4"><RiquadroPagamento token={shareToken} situazione={pagamento} /></div>}
    </div>
  )
}
