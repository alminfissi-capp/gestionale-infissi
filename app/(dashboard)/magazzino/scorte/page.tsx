import { getProdotti, getGiacenzeFlatAll, getCategorieMagazzino, getFornitori, getPosizioni } from '@/actions/magazzino'
import { requireAccesso } from '@/lib/permessi'
import TabellaScorte from '@/components/magazzino/TabellaScorte'

function toPublicUrl(path: string | null): string | null {
  if (!path) return null
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/magazzino/${path}`
}

export default async function ScortePage() {
  await requireAccesso('magazzino')
  const [prodotti, giacenzaFlat, categorie, fornitori, posizioni] = await Promise.all([
    getProdotti(),
    getGiacenzeFlatAll(),
    getCategorieMagazzino(),
    getFornitori(),
    getPosizioni(),
  ])

  const prodottiConUrl = prodotti.map((p) => ({
    ...p,
    preview_url: p.foto_url ? toPublicUrl(p.foto_url) : toPublicUrl(p.dxf_url),
    preview_tipo: p.foto_url ? 'foto' as const : p.dxf_url ? 'dxf' as const : null,
  }))

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Magazzino</h1>
        <p className="text-sm text-gray-500 mt-1">Scorte, carichi e scarichi per prodotto</p>
      </div>
      <TabellaScorte
        prodotti={prodottiConUrl}
        giacenzaFlat={giacenzaFlat}
        categorie={categorie}
        fornitori={fornitori}
        posizioni={posizioni}
      />
    </div>
  )
}
