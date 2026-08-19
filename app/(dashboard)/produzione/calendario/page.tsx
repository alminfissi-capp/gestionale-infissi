// app/(dashboard)/produzione/calendario/page.tsx
import { getMyPermissions, requireAccesso } from '@/lib/permessi'
import {
  getEventiProduzione, getOrariLavoro, getChiusure, getCommesseAperte, getTipiAttivita,
} from '@/actions/calendario'
import CalendarioProduzione from '@/components/calendario/CalendarioProduzione'

export const dynamic = 'force-dynamic'

export default async function CalendarioProduzionePage({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string; mese?: string }>
}) {
  await requireAccesso('produzione')
  const { anno: annoParam, mese: meseParam } = await searchParams

  const oggi = new Date()
  const anno = Number(annoParam) || oggi.getFullYear()
  const mese = Number(meseParam) || oggi.getMonth() + 1

  const mm = String(mese).padStart(2, '0')
  const ultimoGiorno = new Date(anno, mese, 0).getDate()
  const dataInizio = `${anno}-${mm}-01`
  const dataFine = `${anno}-${mm}-${ultimoGiorno}`

  const [eventi, orari, chiusure, commesse, tipi] = await Promise.all([
    getEventiProduzione(dataInizio, dataFine),
    getOrariLavoro(),
    getChiusure(),
    getCommesseAperte(),
    getTipiAttivita(),
  ])

  const { isAdmin, permessi } = await getMyPermissions()
  const modificabile = isAdmin || permessi.produzione === 'scrittura'

  return (
    <CalendarioProduzione
      anno={anno}
      mese={mese}
      eventi={eventi}
      tipi={tipi}
      orari={orari}
      chiusure={chiusure}
      commesse={commesse}
      modificabile={modificabile}
    />
  )
}
