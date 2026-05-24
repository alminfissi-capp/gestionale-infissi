'use client'

import WizardPreventivo from './WizardPreventivo'
import type { Cliente } from '@/types/cliente'
import type { CategoriaConListini } from '@/types/listino'
import type { NoteTemplate } from '@/types/impostazioni'
import type { ScorevoliListino } from '@/actions/scorrevoli'
import type { PreventivoCompleto } from '@/types/preventivo'

interface Props {
  clienti: Cliente[]
  listini: CategoriaConListini[]
  aliquote: number[]
  noteTemplates?: NoteTemplate[]
  numerazioneAttiva?: boolean
  preventivo?: PreventivoCompleto
  scorevoliListino?: ScorevoliListino | null
}

export default function NuovoPreventivoShell({
  clienti, listini, aliquote, noteTemplates, numerazioneAttiva, preventivo, scorevoliListino,
}: Props) {
  return (
    <WizardPreventivo
      clienti={clienti}
      listini={listini}
      aliquote={aliquote}
      noteTemplates={noteTemplates}
      numerazioneAttiva={numerazioneAttiva}
      preventivo={preventivo}
      scorevoliListino={scorevoliListino}
    />
  )
}
