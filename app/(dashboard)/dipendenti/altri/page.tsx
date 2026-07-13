import { getAltriDipendentiConSaldi } from '@/actions/altri-dipendenti'
import PaginaAltriDipendenti from '@/components/dipendenti/PaginaAltriDipendenti'

export const dynamic = 'force-dynamic'

export default async function AltriDipendentiPage() {
  const dipendenti = await getAltriDipendentiConSaldi()
  return <PaginaAltriDipendenti dipendenti={dipendenti} />
}
