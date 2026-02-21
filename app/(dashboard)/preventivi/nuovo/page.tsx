import { getClienti } from '@/actions/clienti'
import { getCategorie } from '@/actions/listini'
import WizardPreventivo from '@/components/preventivi/WizardPreventivo'

export default async function NuovoPreventivoPage() {
  const [clienti, listini] = await Promise.all([getClienti(), getCategorie()])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Nuovo Preventivo</h1>
        <p className="text-sm text-gray-500 mt-1">Compila il modulo passo per passo</p>
      </div>
      <WizardPreventivo clienti={clienti} listini={listini} />
    </div>
  )
}
