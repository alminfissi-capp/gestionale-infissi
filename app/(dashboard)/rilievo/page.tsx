import { requireAccesso } from '@/lib/permessi'
import MenuRilievo from '@/components/rilievo/MenuRilievo'

export const metadata = { title: 'Rilievo Misure' }

export default async function RilievoPage() {
  await requireAccesso('rilievo')
  return <MenuRilievo />
}
