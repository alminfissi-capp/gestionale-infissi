'use client'

import { useState } from 'react'
import { Hammer } from 'lucide-react'
import dynamic from 'next/dynamic'
import WizardPreventivo from './WizardPreventivo'
import type { Cliente } from '@/types/cliente'
import type { CategoriaConListini } from '@/types/listino'
import type { NoteTemplate } from '@/types/impostazioni'
import type { ScorevoliListino } from '@/actions/scorrevoli'
import type { PreventivoCompleto } from '@/types/preventivo'
import { cn } from '@/lib/utils'

const FerroCalcolatore = dynamic(() => import('@/components/ferro/FerroCalcolatore'), { ssr: false })

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
  const [tipoPreventivo, setTipoPreventivo] = useState<'standard' | 'ferro'>('standard')

  return (
    <div>
      {/* Selettore tipo preventivo — nascosto in modalità modifica */}
      {!preventivo && (
        <div className="flex items-center gap-1 mb-6 border border-border rounded-md overflow-hidden w-fit text-sm">
          <button
            onClick={() => setTipoPreventivo('standard')}
            className={cn(
              'px-4 py-1.5 font-medium transition-colors',
              tipoPreventivo === 'standard'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted',
            )}>
            Infissi / Serramenti
          </button>
          <button
            onClick={() => setTipoPreventivo('ferro')}
            className={cn(
              'px-4 py-1.5 font-medium transition-colors flex items-center gap-1.5',
              tipoPreventivo === 'ferro'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted',
            )}>
            <Hammer className="h-3.5 w-3.5" />
            Ferro & Cancelli
          </button>
        </div>
      )}

      {tipoPreventivo === 'ferro' ? (
        <FerroCalcolatore mode="calc" />
      ) : (
        <WizardPreventivo
          clienti={clienti}
          listini={listini}
          aliquote={aliquote}
          noteTemplates={noteTemplates}
          numerazioneAttiva={numerazioneAttiva}
          preventivo={preventivo}
          scorevoliListino={scorevoliListino}
        />
      )}
    </div>
  )
}
