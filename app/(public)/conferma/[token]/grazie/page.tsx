import { CheckCircle } from 'lucide-react'

interface Props {
  params: Promise<{ token: string }>
}

export const metadata = { title: 'Firma completata' }

export default async function GraziePerLaFirmaPage({ params }: Props) {
  await params // consume params to avoid lint warning
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
