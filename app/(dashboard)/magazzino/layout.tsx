import MagazzinoTabs from '@/components/magazzino/MagazzinoTabs'

export default function MagazzinoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <MagazzinoTabs />
      {children}
    </div>
  )
}
