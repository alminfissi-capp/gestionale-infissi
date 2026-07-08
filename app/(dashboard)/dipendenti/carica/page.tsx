import { getDipendenti } from '@/actions/dipendenti'
import PaginaCarica from '@/components/dipendenti/PaginaCarica'

export const dynamic = 'force-dynamic'

export default async function CaricaDocumentiPage() {
  const dipendenti = await getDipendenti()
  return <PaginaCarica dipendenti={dipendenti} />
}
