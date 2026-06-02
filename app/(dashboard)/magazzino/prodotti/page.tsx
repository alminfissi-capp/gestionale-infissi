import { Suspense } from 'react'
import {
  getProdottiCatalogoESP,
  getRepartiConteggio,
  getCategorieMagazzino,
  getFornitori,
  getPosizioni,
  getPrezziCache,
} from '@/actions/magazzino'
import FiltriCatalogoESP from '@/components/magazzino/catalogo-esp/FiltriCatalogoESP'
import CercaCatalogoESP from '@/components/magazzino/catalogo-esp/CercaCatalogoESP'
import TabellaProdotti from '@/components/magazzino/TabellaProdotti'

type PageProps = {
  searchParams: Promise<{ reparto?: string; gruppo?: string; cerca?: string; pagina?: string }>
}

export default async function ProdottiPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const pagina  = parseInt(sp.pagina ?? '1', 10)
  const reparto = sp.reparto ? Number(sp.reparto) : undefined

  const [
    { prodotti, totale },
    conteggiReparti,
    categorie,
    fornitori,
    posizioni,
  ] = await Promise.all([
    getProdottiCatalogoESP({ reparto, cerca: sp.cerca, pagina }),
    getRepartiConteggio(),
    getCategorieMagazzino(),
    getFornitori(),
    getPosizioni(),
  ])

  const totaleArticoli = conteggiReparti.reduce((s, r) => s + r.cnt, 0)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  // Prezzi cached da Supabase (disponibilità AL/CT + prezzo)
  const prezziCache = await getPrezziCache(prodotti.map((p) => p.codice))

  const prodottiConUrl = prodotti.map((p) => ({
    ...p,
    preview_url: p.foto_url
      ? `${supabaseUrl}/storage/v1/object/public/magazzino/${p.foto_url}`
      : p.immagine_url ?? null,
    prezzo_cache: prezziCache[p.codice] ?? null,
  }))

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Prodotti</h1>
        <p className="text-sm text-gray-500 mt-1">
          {totaleArticoli.toLocaleString('it-IT')} articoli — naviga per reparto e gruppo
        </p>
      </div>

      <div className="flex gap-6">
        <Suspense>
          <FiltriCatalogoESP
            conteggiReparti={conteggiReparti}
            totaleArticoli={totaleArticoli}
            gruppiReparto={[]}
          />
        </Suspense>

        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <Suspense>
            <CercaCatalogoESP />
          </Suspense>
          <Suspense>
            <TabellaProdotti
              prodotti={prodottiConUrl}
              totale={totale}
              pagina={pagina}
              categorie={categorie}
              fornitori={fornitori}
              posizioni={posizioni}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
