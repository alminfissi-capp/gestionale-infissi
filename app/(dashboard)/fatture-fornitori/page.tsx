import { requireAccesso } from '@/lib/permessi'
import { getFattureFornitori, getAnniFattureFornitori } from '@/actions/fatture-fornitori'
import { getCollegamentoFic } from '@/actions/fatture-in-cloud'
import { getPagamentiFatture, getProblemiFic } from '@/actions/fic-pagamenti'
import ElencoFattureFornitori from '@/components/fatture-fornitori/ElencoFattureFornitori'

export const dynamic = 'force-dynamic'
// La Server Action di sincronizzazione gira nel contesto di questa pagina:
// il suo budget di tempo (240 s) deve stare sotto questo limite.
export const maxDuration = 300

export default async function FattureFornitoriPage({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string }>
}) {
  await requireAccesso('fatture_fornitori')
  const { anno } = await searchParams
  const annoScelto = Number(anno) > 2000 ? Number(anno) : new Date().getFullYear()

  const [fatture, anni, collegamento] = await Promise.all([
    getFattureFornitori(annoScelto),
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
      anni={anni.includes(annoScelto) ? anni : [annoScelto, ...anni].sort((a, b) => b - a)}
      anno={annoScelto}
      collegamento={collegamento}
      pagamenti={pagamenti}
      problemi={problemi}
    />
  )
}
