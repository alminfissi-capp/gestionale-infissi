import { requireAccesso } from '@/lib/permessi'
import AppCantiere from '@/components/rilievo-fp/AppCantiere'
import { rilievoDaIndirizzo } from '@/lib/fppro/cantiere-elenco'

export const metadata = { title: 'Rilievo in cantiere' }

export default async function RilievoCantierePage({ searchParams }: { searchParams: Promise<{ rilievo?: string }> }) {
  await requireAccesso('rilievo')
  // Dal Calcolo e preventivo si arriva con ?rilievo=ID: si apre direttamente quel rilievo.
  const { rilievo } = await searchParams
  return <AppCantiere rilievoIniziale={rilievo ? rilievoDaIndirizzo(`?rilievo=${rilievo}`) : null} />
}
