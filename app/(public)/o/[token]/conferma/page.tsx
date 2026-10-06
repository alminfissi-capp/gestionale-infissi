import { notFound } from 'next/navigation'
import { getConfermaFirmataPubblica } from '@/lib/conferme-ordine-db'
import { formattaDataOra } from '@/lib/produzione-tracking'
import TracciaLettura from './TracciaLettura'

export const dynamic = 'force-dynamic'

export default async function PaginaConfermaFirmata({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const conferma = await getConfermaFirmataPubblica(token)
  if (!conferma) notFound()

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <TracciaLettura token={token} />

      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <p className="text-lg font-semibold text-gray-900 mb-6">{conferma.denominazione}</p>

        <h1 className="text-xl font-bold text-gray-900">Conferma d&apos;ordine firmata</h1>
        <p className="mt-1 text-sm text-gray-600">
          Ordine {conferma.numeroOrdine}
          {conferma.firmataAt ? ` · firmata il ${formattaDataOra(conferma.firmataAt)}` : ''}
        </p>

        {conferma.note ? (
          <div className="mt-6 rounded-lg bg-gray-50 p-4 text-sm text-gray-800">
            <p className="mb-1 font-medium text-gray-500">Note</p>
            <p className="whitespace-pre-wrap">{conferma.note}</p>
          </div>
        ) : null}

        <a
          href={`/o/${token}/conferma/pdf`}
          download
          className="mt-8 block w-full rounded-lg bg-[#0E8F9C] px-4 py-3 text-center font-medium text-white hover:opacity-90"
        >
          Scarica la conferma firmata
        </a>

        <a href={`/o/${token}`} className="mt-4 block text-center text-sm text-[#0E8F9C] hover:underline">
          Torna all&apos;ordine
        </a>
      </div>
    </main>
  )
}
