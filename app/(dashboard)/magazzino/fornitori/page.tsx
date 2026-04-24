import { getFornitori } from '@/actions/magazzino'
import TabellaFornitori from '@/components/magazzino/TabellaFornitori'

export default async function FornitoriPage() {
  const fornitori = await getFornitori()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Fornitori</h1>
        <p className="text-sm text-gray-500 mt-1">
          {fornitori.length === 0
            ? 'Nessun fornitore in anagrafica'
            : `${fornitori.length} fornitore${fornitori.length === 1 ? '' : 'i'} in anagrafica`}
        </p>
      </div>
      <TabellaFornitori fornitori={fornitori} />
    </div>
  )
}
