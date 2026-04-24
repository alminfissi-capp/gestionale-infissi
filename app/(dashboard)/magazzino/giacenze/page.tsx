import { getGiacenze, getCategorieMagazzino, getProdotti } from '@/actions/magazzino'
import TabellaGiacenze from '@/components/magazzino/TabellaGiacenze'

export default async function GiacenzePage() {
  const [giacenze, categorie, prodotti] = await Promise.all([
    getGiacenze(),
    getCategorieMagazzino(),
    getProdotti(),
  ])

  // mappa prodotto_id → categoria_id per il filtro categoria nella tabella
  const categoriaPerProdotto = Object.fromEntries(
    prodotti.map((p) => [p.id, p.categoria_id ?? ''])
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Giacenze Magazzino</h1>
        <p className="text-sm text-gray-500 mt-1">
          Disponibilità attuale per prodotto e variante
        </p>
      </div>
      <TabellaGiacenze
        giacenze={giacenze}
        categorie={categorie}
        categoriaPerProdotto={categoriaPerProdotto}
      />
    </div>
  )
}
