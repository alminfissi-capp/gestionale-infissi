import { requireAccesso } from '@/lib/permessi'
import { getCruscottoProduzione } from '@/actions/produzione'
import CruscottoProduzione from '@/components/produzione/CruscottoProduzione'
import { STATI_COMMESSA_PRODUZIONE } from '@/types/produzione'
import type { StatoCommessa } from '@/types/commessa'

export const dynamic = 'force-dynamic'

// Senza 'in_attesa': nemmeno il filtro "Tutte" tira fuori dal limbo una
// commessa che non e' ancora partita.
const TUTTI_GLI_STATI: StatoCommessa[] = [
  'da_iniziare', 'in_lavorazione', 'da_consegnare',
  'consegnato', 'parzialmente_consegnato', 'concluso', 'bloccato', 'annullato',
]

function statiDaFiltro(filtro: string): StatoCommessa[] {
  if (filtro === 'tutte') return TUTTI_GLI_STATI
  if (filtro === 'in_lavorazione') return ['in_lavorazione']
  if (filtro === 'da_iniziare') return ['da_iniziare']
  return STATI_COMMESSA_PRODUZIONE
}

export default async function ProduzionePage({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string; archiviate?: string }>
}) {
  await requireAccesso('produzione')
  const { stato, archiviate } = await searchParams
  const filtro = stato ?? 'aperte'
  const vistaArchivio = archiviate === '1'

  const { daFare, commesse } = await getCruscottoProduzione(statiDaFiltro(filtro), vistaArchivio)

  return (
    <CruscottoProduzione
      daFare={daFare}
      commesse={commesse}
      statoFiltro={filtro}
      archiviate={vistaArchivio}
    />
  )
}
