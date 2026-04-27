import { getCategorie } from '@/actions/listini'
import { requireAccesso } from '@/lib/permessi'
import ListiniClient from '@/components/listini/ListiniClient'

export default async function ListiniPage() {
  await requireAccesso('listini')
  const categorie = await getCategorie()
  return <ListiniClient initialCategorie={categorie} />
}
