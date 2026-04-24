import { getCategorieMagazzino } from '@/actions/magazzino'
import TabellaCategorieMagazzino from '@/components/magazzino/TabellaCategorieMagazzino'

export default async function CategorieMagazzinoPage() {
  const categorie = await getCategorieMagazzino()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Categorie Magazzino</h1>
        <p className="text-sm text-gray-500 mt-1">
          Organizza i prodotti in categorie per tipo di materiale
        </p>
      </div>
      <TabellaCategorieMagazzino categorie={categorie} />
    </div>
  )
}
