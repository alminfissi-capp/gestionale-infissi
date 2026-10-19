import { requireAccesso } from '@/lib/permessi'
import ElencoRilieviGrafici from '@/components/rilievo-grafico/ElencoRilieviGrafici'

export const metadata = { title: 'Rilievo grafico' }

export default async function RilievoGraficoPage() {
  await requireAccesso('rilievo')
  return <ElencoRilieviGrafici />
}
