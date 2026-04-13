import { getCategorie } from '@/actions/listini'
import ListiniClient from '@/components/listini/ListiniClient'

export default async function ListiniPage() {
  const categorie = await getCategorie()
  return <ListiniClient initialCategorie={categorie} />
}
