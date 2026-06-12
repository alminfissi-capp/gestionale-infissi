import { getPreventivi } from '@/actions/preventivi'
import { getCommessePerPreventivi } from '@/actions/commesse'
import { requireAccesso } from '@/lib/permessi'
import TabellaPreventivi from '@/components/preventivi/TabellaPreventivi'

export default async function PreventiviPage() {
  await requireAccesso('preventivi')
  const [preventivi, commessePerPreventivo] = await Promise.all([
    getPreventivi(),
    getCommessePerPreventivi(),
  ])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Preventivi</h1>
        <p className="text-sm text-gray-500 mt-1">
          {preventivi.length === 0
            ? 'Nessun preventivo'
            : `${preventivi.length} preventiv${preventivi.length === 1 ? 'o' : 'i'}`}
        </p>
      </div>
      <TabellaPreventivi preventivi={preventivi} commessePerPreventivo={commessePerPreventivo} />
    </div>
  )
}
