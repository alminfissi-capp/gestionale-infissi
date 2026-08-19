import { redirect } from 'next/navigation'
import {
  getCommesse,
  getPreventiviPerCommessa,
  getUtentiPerCommessa,
  getGruppiCommesse,
} from '@/actions/commesse'
import { getScadenze } from '@/actions/scadenze'
import { getConti } from '@/actions/conti'
import { getFornitori } from '@/actions/magazzino'
import { getClienti } from '@/actions/clienti'
import TabellaCommesse from '@/components/commesse/TabellaCommesse'
import ScadenzeView from '@/components/commesse/ScadenzeView'
import { getScadenzeInCalendario } from '@/actions/calendario'
import ScadenzeDaProgrammareView from '@/components/commesse/ScadenzeDaProgrammareView'
import type { PreventivoPerCommessa } from '@/types/commessa'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export default async function CommesseGruppoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string; highlight?: string }>
}) {
  const { id: gruppoId } = await params
  const sp = await searchParams

  const gruppi = await getGruppiCommesse()
  const gruppoCorrente = gruppi.find((g) => g.id === gruppoId)
  if (!gruppoCorrente) redirect('/commesse')

  const isScadenze = gruppoCorrente.tipo === 'scadenze'
  const isDaProgrammare = gruppoCorrente.tipo === 'da_programmare'

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <nav className="flex items-center gap-1 text-sm text-gray-500 mb-1">
          <Link href="/commesse" className="hover:text-gray-700">Commesse / Scadenze</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-gray-900 font-medium">{gruppoCorrente.nome}</span>
        </nav>
        <h1 className="text-2xl font-bold text-gray-900">{gruppoCorrente.nome}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {isDaProgrammare
            ? 'Scadenze già note nell’importo, ancora senza data di pagamento'
            : isScadenze
              ? 'Scadenze fornitori e rateizzazioni, mese per mese'
              : 'Gestione ordini confermati, acconti e documenti'}
        </p>
      </div>

      {isDaProgrammare ? (
        <ScadenzeViewLoader gruppoId={gruppoId} gruppoNome={gruppoCorrente.nome} daProgrammare />
      ) : isScadenze ? (
        <ScadenzeViewLoader gruppoId={gruppoId} gruppoNome={gruppoCorrente.nome} />
      ) : (
        <CommesseTable gruppoId={gruppoId} from={sp.from} highlight={sp.highlight} />
      )}
    </div>
  )
}

async function ScadenzeViewLoader({
  gruppoId,
  gruppoNome,
  daProgrammare = false,
}: {
  gruppoId: string
  gruppoNome: string
  daProgrammare?: boolean
}) {
  const [scadenze, fornitori, conti, inCalendario] = await Promise.all([
    getScadenze(gruppoId), getFornitori(), getConti(), getScadenzeInCalendario(),
  ])
  const nomiFornitori = fornitori.map((f) => f.nome)

  // Stessi dati, due letture diverse: per mesi nei blocchi anno, elenco piatto
  // dove le date non ci sono ancora
  return daProgrammare ? (
    <ScadenzeDaProgrammareView
      gruppoId={gruppoId}
      scadenze={scadenze}
      fornitori={nomiFornitori}
      conti={conti}
    />
  ) : (
    <ScadenzeView
      gruppoId={gruppoId}
      gruppoNome={gruppoNome}
      scadenze={scadenze}
      fornitori={nomiFornitori}
      conti={conti}
      inCalendario={inCalendario}
    />
  )
}

async function CommesseTable({
  gruppoId,
  from,
  highlight,
}: {
  gruppoId: string
  from?: string
  highlight?: string
}) {
  const [commesse, preventivi, utenti, clienti, gruppi] = await Promise.all([
    getCommesse(gruppoId),
    getPreventiviPerCommessa(),
    getUtentiPerCommessa(),
    getClienti(),
    getGruppiCommesse(),
  ])

  let preventivoDaConvertire: PreventivoPerCommessa | null = null
  if (from) {
    preventivoDaConvertire = preventivi.find((p) => p.id === from) ?? null
  }

  return (
    <TabellaCommesse
      commesse={commesse}
      preventivi={preventivi}
      utenti={utenti}
      clienti={clienti}
      preventivoDaConvertire={preventivoDaConvertire}
      gruppi={gruppi}
      gruppoCorrenteId={gruppoId}
      highlightId={highlight ?? null}
    />
  )
}
