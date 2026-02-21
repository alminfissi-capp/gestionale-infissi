import { notFound } from 'next/navigation'
import { getPreventivo } from '@/actions/preventivi'
import DettaglioPreventivo from '@/components/preventivi/DettaglioPreventivo'

interface Props {
  params: Promise<{ id: string }>
}

export default async function DettaglioPreventivoPage({ params }: Props) {
  const { id } = await params
  const preventivo = await getPreventivo(id)
  if (!preventivo) notFound()

  return <DettaglioPreventivo preventivo={preventivo} />
}
