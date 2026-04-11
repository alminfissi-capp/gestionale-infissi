import { getScorevoliListino } from '@/actions/scorrevoli'
import { getPreventivoScorrevoli } from '@/actions/preventivi-scorrevoli'
import { notFound } from 'next/navigation'
import FormPreventivo from '../FormPreventivo'

export default async function EditPreventivoScorevoliPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [listino, preventivo] = await Promise.all([getScorevoliListino(), getPreventivoScorrevoli(id)])
  if (!preventivo) notFound()
  return <FormPreventivo listino={listino} preventivo={preventivo} />
}
