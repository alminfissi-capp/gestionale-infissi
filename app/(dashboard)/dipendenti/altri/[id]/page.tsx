import { notFound } from 'next/navigation'
import { getAltroDipendenteCompleto } from '@/actions/altri-dipendenti'
import DettaglioAltroDipendente from '@/components/dipendenti/DettaglioAltroDipendente'

export const dynamic = 'force-dynamic'

export default async function AltroDipendentePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getAltroDipendenteCompleto(id)
  if (!data) notFound()
  return <DettaglioAltroDipendente dipendente={data.dipendente} movimenti={data.movimenti} />
}
