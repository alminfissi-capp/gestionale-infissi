import { requireAccesso } from '@/lib/permessi'
import { getDatiCalcoloRilievo } from '@/actions/calcolo-fp'
import CalcoloRilievo from '@/components/rilievo-fp/CalcoloRilievo'

export const metadata = { title: 'Calcolo del rilievo' }

export default async function CalcoloRilievoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccesso('rilievo')
  const { id } = await params
  const dati = await getDatiCalcoloRilievo(id)
  if ('errore' in dati) return <p className="p-4 text-sm text-red-700">{dati.errore}</p>
  return <CalcoloRilievo rilievoId={id} dati={dati} />
}
