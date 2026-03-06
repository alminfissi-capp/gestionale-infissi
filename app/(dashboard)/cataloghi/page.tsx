import { getCataloghi } from '@/actions/cataloghi'
import PaginaCataloghi from '@/components/cataloghi/PaginaCataloghi'

export const metadata = { title: 'Cataloghi e Brochure' }

export default async function CataloghiPage() {
  const cataloghi = await getCataloghi()
  return <PaginaCataloghi initialCataloghi={cataloghi} />
}
