import { notFound } from 'next/navigation'
import { getRilievo, getOpzioniRaggruppate } from '@/actions/rilievo-veloce'
import DettaglioRilievoVeloce from '@/components/rilievo/DettaglioRilievoVeloce'

export const metadata = { title: 'Rilievo Veloce' }

export default async function DettaglioRilievoVelocePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [rilievo, opzioni] = await Promise.all([
    getRilievo(id),
    getOpzioniRaggruppate(),
  ])
  if (!rilievo) notFound()
  return <DettaglioRilievoVeloce rilievo={rilievo} opzioni={opzioni} />
}
