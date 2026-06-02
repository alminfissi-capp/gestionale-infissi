import { Suspense } from 'react'
import {
  getProdottiCatalogoESP,
  getRepartiConteggio,
  getCategorieMagazzino,
  getFornitori,
  getPosizioni,
  getPrezziCache,
  getScraperPreventivo,
} from '@/actions/magazzino'
import { getOrgId } from '@/lib/auth'
import FiltriRepartoHorizontal from '@/components/magazzino/FiltriRepartoHorizontal'
import CercaCatalogoESP from '@/components/magazzino/catalogo-esp/CercaCatalogoESP'
import TabellaProdotti from '@/components/magazzino/TabellaProdotti'
import PreventivoScraperBadge from '@/components/magazzino/PreventivoScraperBadge'

type PageProps = {
  searchParams: Promise<{ reparto?: string; cerca?: string; pagina?: string }>
}

export default async function ProdottiPage({ searchParams }: PageProps) {
  const sp      = await searchParams
  const pagina  = parseInt(sp.pagina ?? '1', 10)
  const reparto = sp.reparto ? Number(sp.reparto) : undefined

  const [
    { prodotti, totale },
    conteggiReparti,
    categorie,
    fornitori,
    posizioni,
    orgId,
    scraperPreventivo,
  ] = await Promise.all([
    getProdottiCatalogoESP({ reparto, cerca: sp.cerca, pagina }),
    getRepartiConteggio(),
    getCategorieMagazzino(),
    getFornitori(),
    getPosizioni(),
    getOrgId(),
    getScraperPreventivo(),
  ])

  const totaleArticoli = conteggiReparti.reduce((s, r) => s + r.cnt, 0)
  const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL

  const prezziCache = await getPrezziCache(prodotti.map((p) => p.codice))

  const prodottiConUrl = prodotti.map((p) => ({
    ...p,
    preview_url: p.foto_url
      ? `${supabaseUrl}/storage/v1/object/public/magazzino/${p.foto_url}`
      : p.immagine_url ?? null,
    prezzo_cache: prezziCache[p.codice] ?? null,
  }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Prodotti</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totaleArticoli.toLocaleString('it-IT')} articoli totali
          </p>
        </div>
        <PreventivoScraperBadge iniziale={scraperPreventivo} />
      </div>

      {/* Filtri reparto orizzontali */}
      <Suspense>
        <FiltriRepartoHorizontal
          conteggiReparti={conteggiReparti}
          totaleArticoli={totaleArticoli}
        />
      </Suspense>

      {/* Ricerca + tabella full-width */}
      <div className="flex flex-col gap-3">
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
            orgId={orgId}
          />
        </Suspense>
      </div>
    </div>
  )
}
