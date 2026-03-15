import { getClienti } from '@/actions/clienti'
import NuovoRilievo from '@/components/rilievo/NuovoRilievo'

export const metadata = { title: 'Nuovo Rilievo' }

export default async function NuovoRilievoPage() {
  const clienti = await getClienti()
  return <NuovoRilievo clienti={clienti} />
}
