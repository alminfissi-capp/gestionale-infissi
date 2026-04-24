import { getProdotti, getCategorieMagazzino, getFornitori } from '@/actions/magazzino'
import TabellaProdotti from '@/components/magazzino/TabellaProdotti'

export default async function ProdottiPage() {
  const [prodotti, categorie, fornitori] = await Promise.all([
    getProdotti(),
    getCategorieMagazzino(),
    getFornitori(),
  ])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Anagrafica Prodotti</h1>
        <p className="text-sm text-gray-500 mt-1">
          {prodotti.length === 0
            ? 'Nessun prodotto in anagrafica'
            : `${prodotti.length} prodott${prodotti.length === 1 ? 'o' : 'i'} in anagrafica`}
        </p>
      </div>
      <TabellaProdotti prodotti={prodotti} categorie={categorie} fornitori={fornitori} />
    </div>
  )
}
