import { notFound } from 'next/navigation'
import { getDipendenteCompleto } from '@/actions/dipendenti'
import DettaglioDipendente from '@/components/dipendenti/DettaglioDipendente'

export const dynamic = 'force-dynamic'

export default async function DipendentePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getDipendenteCompleto(id)
  if (!data) notFound()
  return <DettaglioDipendente dipendente={data.dipendente} buste={data.buste} pagamenti={data.pagamenti} />
}
