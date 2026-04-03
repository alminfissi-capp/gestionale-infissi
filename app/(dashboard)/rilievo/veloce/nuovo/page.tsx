import { getClienti } from '@/actions/clienti'
import { getOpzioniRaggruppate } from '@/actions/rilievo-veloce'
import NuovoRilievoVeloce from '@/components/rilievo/NuovoRilievoVeloce'

export const metadata = { title: 'Nuovo Rilievo Veloce' }

export default async function NuovoRilievoVelocePage() {
  const [clienti, opzioni] = await Promise.all([
    getClienti(),
    getOpzioniRaggruppate(),
  ])
  return <NuovoRilievoVeloce clienti={clienti} opzioni={opzioni} />
}
