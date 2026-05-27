import { Suspense } from 'react'
import { getProdottiCatalogoESP, getConteggioTipologie, getConteggioMateriali } from '@/actions/magazzino'
import FiltriCatalogoESP from '@/components/magazzino/catalogo-esp/FiltriCatalogoESP'
import TabellaCatalogoESP from '@/components/magazzino/catalogo-esp/TabellaCatalogoESP'
import CercaCatalogoESP from '@/components/magazzino/catalogo-esp/CercaCatalogoESP'
import type { TipologiaESP, MaterialeESP } from '@/types/catalogo-esp'

type PageProps = {
  searchParams: Promise<{ tipologia?: string; materiale?: string; cerca?: string; pagina?: string }>
}

export default async function CatalogoESPPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const pagina = parseInt(sp.pagina ?? '1', 10)
  const filtri = {
    tipologia: sp.tipologia as TipologiaESP | undefined,
    materiale: sp.materiale as MaterialeESP | undefined,
    cerca: sp.cerca,
    pagina,
  }

  const [{ prodotti, totale }, conteggiTipologie, conteggiMateriali] = await Promise.all([
    getProdottiCatalogoESP(filtri),
    getConteggioTipologie(),
    getConteggioMateriali(),
  ])

  const totaleArticoli = conteggiTipologie.reduce((s, t) => s + t.cnt, 0)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Catalogo ESP Edilsider</h1>
        <p className="text-sm text-gray-500 mt-1">
          {totaleArticoli.toLocaleString('it-IT')} articoli importati — organizzati per tipologia e materiale
        </p>
      </div>

      <div className="flex gap-6">
        <Suspense>
          <FiltriCatalogoESP
            conteggiTipologie={conteggiTipologie}
            conteggiMateriali={conteggiMateriali}
            totaleArticoli={totaleArticoli}
          />
        </Suspense>

        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <Suspense>
            <CercaCatalogoESP />
          </Suspense>
          <Suspense>
            <TabellaCatalogoESP
              prodotti={prodotti}
              totale={totale}
              pagina={pagina}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
