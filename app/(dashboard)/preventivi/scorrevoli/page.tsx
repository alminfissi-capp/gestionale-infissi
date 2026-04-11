import { listPreventiviScorrevoli } from '@/actions/preventivi-scorrevoli'
import ListaPreventiviScorrevoli from './ListaPreventivi'

export default async function PreventiviScorevoliPage() {
  const preventivi = await listPreventiviScorrevoli()
  return <ListaPreventiviScorrevoli preventivi={preventivi} />
}
