import { CheckCircle } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

interface Props {
  params: Promise<{ token: string }>
}

export const metadata = { title: 'Firma completata' }

export default async function GraziePerLaFirmaPage({ params }: Props) {
  const { token } = await params

  // Aggiorna automaticamente firma_stato quando il cliente arriva qui dopo aver firmato
  try {
    const service = createServiceClient()
    const { data: prev } = await service
      .from('preventivi')
      .select('id, firma_stato')
      .eq('token_conferma', token)
      .single()

    if (prev && prev.firma_stato === 'in_attesa') {
      await service.from('preventivi').update({
        firma_stato: 'firmato',
        firma_completata_at: new Date().toISOString(),
        stato: 'accettato',
      }).eq('id', prev.id)

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
