import { getPosizioni, getFornitori } from '@/actions/magazzino'
import TabellaPosizioni from '@/components/magazzino/TabellaPosizioni'
import TabellaFornitori from '@/components/magazzino/TabellaFornitori'

export default async function ImpostazioniMagazzinoPage() {
  const [posizioni, fornitori] = await Promise.all([
    getPosizioni(),
    getFornitori(),
  ])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Impostazioni Magazzino</h1>
        <p className="text-sm text-gray-500 mt-1">Posizioni, fornitori e configurazioni generali</p>
      </div>

      <div className="space-y-10">
        <section>
          <TabellaPosizioni posizioni={posizioni} />
        </section>

        <div className="border-t" />

        <section>
          <TabellaFornitori fornitori={fornitori} />
        </section>
      </div>
    </div>
  )
}
