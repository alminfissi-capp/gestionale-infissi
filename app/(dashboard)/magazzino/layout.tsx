import { requireAccesso } from '@/lib/permessi'
import MagazzinoTabs from '@/components/magazzino/MagazzinoTabs'

export default async function MagazzinoLayout({ children }: { children: React.ReactNode }) {
  await requireAccesso('magazzino')
  return (
    <div>
      <MagazzinoTabs />
      {children}
    </div>
  )
}
