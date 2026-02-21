import { notFound } from 'next/navigation'
import { getPreventivo } from '@/actions/preventivi'
import { getClienti } from '@/actions/clienti'
import { getCategorie } from '@/actions/listini'
import WizardPreventivo from '@/components/preventivi/WizardPreventivo'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ModificaPreventivoPage({ params }: Props) {
  const { id } = await params
  const [preventivo, clienti, listini] = await Promise.all([
    getPreventivo(id),
    getClienti(),
    getCategorie(),
  ])

  if (!preventivo) notFound()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Modifica Preventivo</h1>
        <p className="text-sm text-gray-500 mt-1">
          {preventivo.numero ? `Preventivo ${preventivo.numero}` : 'Preventivo senza numero'}
        </p>
      </div>
      <WizardPreventivo clienti={clienti} listini={listini} preventivo={preventivo} />
    </div>
  )
}
