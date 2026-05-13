import { getCommesse, getPreventiviPerCommessa, getUtentiPerCommessa } from '@/actions/commesse'
import TabellaCommesse from '@/components/commesse/TabellaCommesse'
import type { PreventivoPerCommessa } from '@/types/commessa'

export default async function CommessePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  const params = await searchParams

  const [commesse, preventivi, utenti] = await Promise.all([
    getCommesse(),
    getPreventiviPerCommessa(),
    getUtentiPerCommessa(),
  ])

  let preventivoDaConvertire: PreventivoPerCommessa | null = null
  if (params.from) {
    preventivoDaConvertire = preventivi.find((p) => p.id === params.from) ?? null
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Commesse</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gestione ordini confermati, acconti e documenti</p>
      </div>
      <TabellaCommesse
        commesse={commesse}
        preventivi={preventivi}
        utenti={utenti}
        preventivoDaConvertire={preventivoDaConvertire}
      />
    </div>
  )
}
