import { getMovimenti, getProdotti, getFornitori } from '@/actions/magazzino'
import TabellaMovimenti from '@/components/magazzino/TabellaMovimenti'

export default async function MovimentiPage() {
  const [movimenti, prodotti, fornitori] = await Promise.all([
    getMovimenti(),
    getProdotti(),
    getFornitori(),
  ])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Movimenti Magazzino</h1>
        <p className="text-sm text-gray-500 mt-1">
          Carichi in entrata e scarichi verso commesse
        </p>
      </div>
      <TabellaMovimenti movimenti={movimenti} prodotti={prodotti} fornitori={fornitori} />
    </div>
  )
}
