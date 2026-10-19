import { requireAccesso } from '@/lib/permessi'
import CaricaRilievoGrafico from '@/components/rilievo-grafico/EditorRilievoGrafico'

export const metadata = { title: 'Rilievo grafico' }

export default async function RilievoGraficoDettaglioPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccesso('rilievo')
  const { id } = await params
  return <CaricaRilievoGrafico id={id} />
}
