import { getCataloghi } from '@/actions/cataloghi'
import { requireAccesso } from '@/lib/permessi'
import PaginaCataloghi from '@/components/cataloghi/PaginaCataloghi'

export const metadata = { title: 'Cataloghi e Brochure' }

export default async function CataloghiPage() {
  await requireAccesso('cataloghi')
  const cataloghi = await getCataloghi()
  return <PaginaCataloghi initialCataloghi={cataloghi} />
}
