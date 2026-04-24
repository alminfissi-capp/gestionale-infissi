import { getProdotti, getCategorieMagazzino, getFornitori, getMagazzinoSignedUrlsBatch } from '@/actions/magazzino'
import TabellaProdotti from '@/components/magazzino/TabellaProdotti'

export default async function ProdottiPage() {
  const [prodotti, categorie, fornitori] = await Promise.all([
    getProdotti(),
    getCategorieMagazzino(),
    getFornitori(),
  ])

  const fotoPaths = prodotti.filter((p) => p.foto_url).map((p) => p.foto_url!)
  const dxfPaths = prodotti.filter((p) => p.dxf_url && !p.foto_url).map((p) => p.dxf_url!)
  const signedUrls = await getMagazzinoSignedUrlsBatch([...fotoPaths, ...dxfPaths])

  const prodottiConUrl = prodotti.map((p) => ({
    ...p,
    preview_url: p.foto_url ? (signedUrls[p.foto_url] ?? null) : (p.dxf_url ? (signedUrls[p.dxf_url] ?? null) : null),
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
