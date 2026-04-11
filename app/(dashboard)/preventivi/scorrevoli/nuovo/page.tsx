import { getScorevoliListino } from '@/actions/scorrevoli'
import { getNextNumero } from '@/actions/preventivi-scorrevoli'
import FormPreventivo from '../FormPreventivo'

export default async function NuovoPreventivoScorevoliPage() {
  const [listino, numero] = await Promise.all([getScorevoliListino(), getNextNumero()])
  return <FormPreventivo listino={listino} numero={numero} />
}
