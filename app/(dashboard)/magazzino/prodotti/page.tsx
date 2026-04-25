import { getProdotti, getCategorieMagazzino, getFornitori } from '@/actions/magazzino'
import TabellaProdotti from '@/components/magazzino/TabellaProdotti'

function toPublicUrl(path: string | null): string | null {
  if (!path) return null
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  return `${base}/storage/v1/object/public/magazzino/${path}`
}

export default async function ProdottiPage() {
  const [prodotti, categorie, fornitori] = await Promise.all([
    getProdotti(),
    getCategorieMagazzino(),
    getFornitori(),
  ])

  const prodottiConUrl = prodotti.map((p) => ({
    ...p,
    preview_url: p.foto_url ? toPublicUrl(p.foto_url) : toPublicUrl(p.dxf_url),
    preview_tipo: p.foto_url ? 'foto' as const : p.dxf_url ? 'dxf' as const : null,
  }))

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
      <TabellaProdotti
        prodotti={prodottiConUrl}
        categorie={categorie}
        fornitori={fornitori}
      />
    </div>
  )
}
