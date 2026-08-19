// app/(dashboard)/calendario/page.tsx
import { getMyPermissions, requireAccesso } from '@/lib/permessi'
import {
  getEventiAmministrazione, getOrariLavoro, getChiusure, getTipiAttivita,
} from '@/actions/calendario'
import { getCommessePerOrdine } from '@/actions/produzione'
import { aggiungiGiorni, settimanaDi } from '@/lib/calendario'
import CalendarioAmministrazione, {
  type VistaCalendario,
} from '@/components/calendario/CalendarioAmministrazione'

export const dynamic = 'force-dynamic'

const VISTE: VistaCalendario[] = ['mese', 'settimana', 'giorno']
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/

/** Estremi da caricare: il mese intero, la settimana o il singolo giorno. */
function periodo(vista: VistaCalendario, data: string): [string, string] {
  if (vista === 'giorno') return [data, data]
  if (vista === 'settimana') {
    const settimana = settimanaDi(data)
    return [settimana[0], settimana[6]]
  }
  const anno = Number(data.slice(0, 4))
  const mese = Number(data.slice(5, 7))
  const mm = String(mese).padStart(2, '0')
  const ultimo = new Date(anno, mese, 0).getDate()
  // La griglia del mese mostra anche i giorni di bordo delle settimane intere.
  return [
    aggiungiGiorni(`${anno}-${mm}-01`, -7),
    aggiungiGiorni(`${anno}-${mm}-${ultimo}`, 7),
  ]
}

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; data?: string }>
}) {
  await requireAccesso('calendario')
  const { vista: vistaParam, data: dataParam } = await searchParams

  const vista: VistaCalendario = VISTE.includes(vistaParam as VistaCalendario)
    ? (vistaParam as VistaCalendario)
    : 'mese'

  const oggi = new Date()
  const data = dataParam && RE_DATA.test(dataParam)
    ? dataParam
    : `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${String(oggi.getDate()).padStart(2, '0')}`

  const [dataInizio, dataFine] = periodo(vista, data)

  const [eventi, orari, chiusure, commesse, tipi, { isAdmin, permessi }] = await Promise.all([
    getEventiAmministrazione(dataInizio, dataFine),
    getOrariLavoro(),
    getChiusure(),
    getCommessePerOrdine(),
    getTipiAttivita(),
    getMyPermissions(),
  ])

  return (
    <CalendarioAmministrazione
      vista={vista}
      data={data}
      eventi={eventi}
      tipi={tipi}
      orari={orari}
      chiusure={chiusure}
      commesse={commesse}
      modificabile={isAdmin || permessi.calendario === 'scrittura'}
    />
  )
}
