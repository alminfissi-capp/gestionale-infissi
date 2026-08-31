import { notFound } from 'next/navigation'
import { getDatiPaginaOrdine } from '@/lib/produzione-tracking-db'
import TracciaVisita from './TracciaVisita'

export const dynamic = 'force-dynamic'

export default async function PaginaOrdineFornitore({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const dati = await getDatiPaginaOrdine(token)
  if (!dati) notFound()

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <TracciaVisita token={token} />

      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        {dati.logoUrl ? (

          <img src={dati.logoUrl} alt={dati.denominazione} className="h-12 mb-6 object-contain" />
        ) : (
          <p className="text-lg font-semibold text-gray-900 mb-6">{dati.denominazione}</p>
        )}

        <h1 className="text-xl font-bold text-gray-900">Ordine {dati.numeroOrdine}</h1>

        <dl className="mt-4 space-y-1 text-sm text-gray-600">
          {dati.fornitoreNome ? (
            <div className="flex gap-2">
              <dt className="font-medium text-gray-500">Fornitore:</dt>
              <dd>{dati.fornitoreNome}</dd>
            </div>
          ) : null}
          <div className="flex gap-2">
            <dt className="font-medium text-gray-500">Data ordine:</dt>
            <dd>{dati.dataOrdine}</dd>
          </div>
        </dl>

        {dati.pdfDisponibile ? (
          <a
            href={`/o/${token}/pdf`}
            download
            className="mt-8 block w-full rounded-lg bg-[#0E8F9C] px-4 py-3 text-center font-medium text-white hover:opacity-90"
          >
            Scarica l&apos;ordine PDF
          </a>
        ) : (
          <p className="mt-8 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
            Il documento non è al momento disponibile. Contattate {dati.denominazione} per
            riceverne una copia.
          </p>
        )}

        <p className="mt-6 text-xs text-gray-400">Inviato da {dati.denominazione}</p>
      </div>
    </main>
  )
}
