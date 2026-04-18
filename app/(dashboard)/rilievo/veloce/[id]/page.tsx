import { notFound } from 'next/navigation'
import { getRilievo, getOpzioniRaggruppate } from '@/actions/rilievo-veloce'
import { getSerieComplete, getRiempimentiOrg } from '@/actions/winconfig'
import DettaglioRilievoVeloce from '@/components/rilievo/DettaglioRilievoVeloce'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Rilievo Veloce' }

export default async function DettaglioRilievoVelocePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [rilievo, opzioni, serieComplete, riempimentiOrg] = await Promise.all([
    getRilievo(id),
    getOpzioniRaggruppate(),
    getSerieComplete(),
    getRiempimentiOrg(),
  ])
  if (!rilievo) notFound()
  return (
    <DettaglioRilievoVeloce
      rilievo={rilievo}
      opzioni={opzioni}
      serieComplete={serieComplete}
      riempimentiOrg={riempimentiOrg}
    />
  )
}
