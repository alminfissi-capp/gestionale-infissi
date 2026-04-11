import { getClienti } from '@/actions/clienti'
import { getCategorie } from '@/actions/listini'
import { getSettings, getNoteTemplates } from '@/actions/impostazioni'
import { getScorevoliListino } from '@/actions/scorrevoli'
import WizardPreventivo from '@/components/preventivi/WizardPreventivo'

export default async function NuovoPreventivoPage() {
  const [clienti, listini, settings, noteTemplates, scorevoliListino] = await Promise.all([
    getClienti(), getCategorie(), getSettings(), getNoteTemplates(),
    getScorevoliListino().catch(() => null),
  ])
  const aliquote = settings?.aliquote_iva ?? [22, 10, 4]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Nuovo Preventivo</h1>
        <p className="text-sm text-gray-500 mt-1">Compila il modulo passo per passo</p>
      </div>
      <WizardPreventivo
        clienti={clienti}
        listini={listini}
        aliquote={aliquote}
        noteTemplates={noteTemplates}
        numerazioneAttiva={!!settings?.num_prefisso}
        scorevoliListino={scorevoliListino}
      />
    </div>
  )
}
