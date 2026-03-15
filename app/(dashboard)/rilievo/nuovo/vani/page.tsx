import { getFormeAttive } from '@/actions/rilievo'
import VaniRilievo from '@/components/rilievo/VaniRilievo'

export const metadata = { title: 'Vani — Nuovo Rilievo' }

export default async function VaniPage() {
  const forme = await getFormeAttive()
  return <VaniRilievo forme={forme} />
}
