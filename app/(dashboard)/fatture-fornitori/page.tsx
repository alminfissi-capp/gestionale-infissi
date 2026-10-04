import Link from 'next/link'
import { requireAccesso } from '@/lib/permessi'
import { getFattureFornitori, getAnniFattureFornitori } from '@/actions/fatture-fornitori'
import { getCollegamentoFic } from '@/actions/fatture-in-cloud'
import { getPagamentiFatture, getProblemiFic } from '@/actions/fic-pagamenti'
import { getAnniFattureEmesse, getFattureEmesse, getSyncEmesse } from '@/actions/fatture-emesse'
import { getProblemiIncassi } from '@/actions/fic-incassi'
import ElencoFattureFornitori from '@/components/fatture-fornitori/ElencoFattureFornitori'
import ElencoFattureEmesse from '@/components/fatture-emesse/ElencoFattureEmesse'

export const dynamic = 'force-dynamic'
// La Server Action di sincronizzazione gira nel contesto di questa pagina:
// il suo budget di tempo (240 s) deve stare sotto questo limite.
export const maxDuration = 300

type Scheda = 'fornitori' | 'clienti'

export default async function FatturePage({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string; scheda?: string }>
}) {
  await requireAccesso('fatture_fornitori')
  const { anno, scheda: s } = await searchParams
  const scheda: Scheda = s === 'clienti' ? 'clienti' : 'fornitori'
  const annoScelto = Number(anno) > 2000 ? Number(anno) : new Date().getFullYear()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Fatture</h1>
        <p className="mt-1 text-sm text-muted-foreground">Documenti registrati su Fatture in Cloud.</p>
      </div>
      <nav className="inline-flex rounded-lg bg-muted p-1 text-sm">
        {(['fornitori', 'clienti'] as const).map((x) => (
          <Link
            key={x}
            href={`/fatture-fornitori?scheda=${x}`}
            className={`rounded-md px-4 py-1.5 font-medium ${scheda === x ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
          >
            {x === 'fornitori' ? 'Fornitori' : 'Clienti'}
          </Link>
        ))}
      </nav>
      {scheda === 'fornitori'
        ? <SchedaFornitori anno={annoScelto} />
        : <SchedaClienti anno={annoScelto} />}
    </div>
  )
}

async function SchedaFornitori({ anno }: { anno: number }) {
  const [fatture, anni, collegamento] = await Promise.all([
    getFattureFornitori(anno),
    getAnniFattureFornitori(),
    getCollegamentoFic(),
  ])
  const [pagamenti, problemi] = await Promise.all([
    getPagamentiFatture(fatture.map((f) => f.fic_id)),
    getProblemiFic(),
  ])
  return (
    <ElencoFattureFornitori
      fatture={fatture}
      anni={anni.includes(anno) ? anni : [anno, ...anni].sort((a, b) => b - a)}
      anno={anno}
      collegamento={collegamento}
      pagamenti={pagamenti}
      problemi={problemi}
    />
  )
}

async function SchedaClienti({ anno }: { anno: number }) {
  const [fatture, anni, collegamento, sync, problemi] = await Promise.all([
    getFattureEmesse(anno),
    getAnniFattureEmesse(),
    getCollegamentoFic(),
    getSyncEmesse(),
    getProblemiIncassi(),
  ])
  return (
    <ElencoFattureEmesse
      fatture={fatture}
      anni={anni.includes(anno) ? anni : [anno, ...anni].sort((a, b) => b - a)}
      anno={anno}
      sync={collegamento && sync ? { ...sync, stato: collegamento.stato } : null}
      problemi={problemi}
    />
  )
}
