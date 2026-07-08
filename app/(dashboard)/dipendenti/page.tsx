import { getDipendentiConSaldi } from '@/actions/dipendenti'
import PaginaDipendenti from '@/components/dipendenti/PaginaDipendenti'

export const dynamic = 'force-dynamic'

export default async function DipendentiPage() {
  const dipendenti = await getDipendentiConSaldi()
  return <PaginaDipendenti dipendenti={dipendenti} />
}
