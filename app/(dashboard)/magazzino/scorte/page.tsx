import { listArticoliMagazzino, getProdotti, getCategorieMagazzino, getFornitori, getPosizioni } from '@/actions/magazzino'
import TabellaInventario from '@/components/magazzino/TabellaInventario'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

function toPublicUrl(path: string | null): string | null {
  if (!path) return null
  return `${SUPABASE_URL}/storage/v1/object/public/magazzino/${path}`
}

export default async function InventarioPage() {
  const [articoli, prodotti, categorie, fornitori, posizioni] = await Promise.all([
    listArticoliMagazzino(),
    getProdotti(),
    getCategorieMagazzino(),
    getFornitori(),
    getPosizioni(),
  ])

  const articoliConUrl = articoli.map((a) => ({
    ...a,
    preview_url: a.prodotto?.foto_url
      ? toPublicUrl(a.prodotto.foto_url)
      : toPublicUrl(a.prodotto?.dxf_url ?? null),
    preview_tipo: a.prodotto?.foto_url ? 'foto' as const : a.prodotto?.dxf_url ? 'dxf' as const : null,
  }))

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Inventario Magazzino</h1>
        <p className="text-sm text-gray-500 mt-1">Elenco materiali con quantità, finitura, posizione e commessa</p>
      </div>
      <TabellaInventario
        articoli={articoliConUrl}
        prodotti={prodotti}
        categorie={categorie}
        fornitori={fornitori}
        posizioni={posizioni}
      />
    </div>
  )
}
