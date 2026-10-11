import { requireAccesso } from '@/lib/permessi'
import AppCantiere from '@/components/rilievo-fp/AppCantiere'

export const metadata = { title: 'Rilievo in cantiere' }

export default async function RilievoCantierePage() {
  await requireAccesso('rilievo')
  return <AppCantiere />
}
