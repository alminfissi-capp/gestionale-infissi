import { CheckCircle } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

interface Props {
  params: Promise<{ token: string }>
}

export const metadata = { title: 'Firma completata' }

async function tentaDownloadPdfFirmato(
  service: ReturnType<typeof createServiceClient>,
  prevId: string,
  documentId: string
): Promise<string | null> {
  try {
    const pdfRes = await fetch(
      `https://esignature.openapi.com/signatures/${documentId}/signedDocument`,
      {
        headers: { Authorization: `Bearer ${process.env.OPENAPI_IT_TOKEN}` },
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
  try {
    const service = createServiceClient()
    const { data: prev } = await service
      .from('preventivi')
      .select('id, firma_stato, firma_documento_id, firma_pdf_path')
      .eq('token_conferma', token)
      .single()

    if (prev && prev.firma_stato === 'in_attesa') {
      const updates: Record<string, unknown> = {
        firma_stato: 'firmato',
        firma_completata_at: new Date().toISOString(),
        stato: 'accettato',
      }

      if (prev.firma_documento_id && !prev.firma_pdf_path) {
        const pdfPath = await tentaDownloadPdfFirmato(service, prev.id, prev.firma_documento_id)
        if (pdfPath) updates.firma_pdf_path = pdfPath
      }

      await service.from('preventivi').update(updates).eq('id', prev.id)
      revalidatePath(`/preventivi/${prev.id}`)
    }
  } catch {
    // Non bloccare la pagina per errori
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border max-w-md w-full p-10 text-center space-y-4">
        <div className="flex justify-center">
          <CheckCircle className="h-16 w-16 text-green-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Firma completata</h1>
        <p className="text-gray-500 text-sm leading-relaxed">
          Grazie! La firma è stata acquisita correttamente.
          Riceverete conferma via email con il documento firmato.
        </p>
        <p className="text-xs text-gray-400 pt-2">
          Questa pagina può essere chiusa.
        </p>
      </div>
    </div>
  )
}
