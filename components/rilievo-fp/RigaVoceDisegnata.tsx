'use client'

import { Copy, GripVertical, Trash2 } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import AllegatiVoce from '@/components/rilievo/AllegatiVoce'
import { eliminaVoceLocale } from '@/lib/rilievo-fp-locale'
import type { VoceDisegnata } from '@/types/rilievo-fp'
import SchedaVoceDisegnataRiepilogo from './SchedaVoceDisegnataRiepilogo'

/** Voce disegnata nell'elenco del rilievo: miniatura del disegno, posizione, ingombro e quantita' */
export default function RigaVoceDisegnata({ v, numero, isOnline, onApri, onCopia }: {
  v: VoceDisegnata & { daInviare: 0 | 1 }; numero: number; isOnline: boolean
  onApri: (voceId: string) => void; onCopia: (voceId: string) => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: v.id })
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes}
      className={`space-y-1 ${isDragging ? 'relative z-10 opacity-70' : ''}`}>
      <div className="flex items-start gap-1">
        <button type="button" onClick={() => onApri(v.id)} aria-label={`Apri ${v.posizione || 'voce disegnata'}`}
          className="min-w-0 flex-1 rounded text-left transition-shadow hover:shadow-[0_0_0_2px_rgba(14,143,156,0.45)] focus-visible:shadow-[0_0_0_2px_rgba(14,143,156,0.7)] focus-visible:outline-none">
          <SchedaVoceDisegnataRiepilogo voce={v} numero={numero} conPrezzo={false} />
        </button>
        <div className="flex flex-col">
          <button type="button" className="p-2" aria-label="Elimina voce" title="Elimina" onClick={() => { if (confirm('Eliminare questa voce?')) void eliminaVoceLocale(v.id) }}>
            <Trash2 className="size-4 text-muted-foreground" />
          </button>
          <button type="button" className="p-2" aria-label="Copia voce" title="Copia" onClick={() => onCopia(v.id)}>
            <Copy className="size-4 text-muted-foreground" />
          </button>
          <button type="button" ref={setActivatorNodeRef} {...listeners} aria-label="Trascina per spostare" title="Trascina per spostare"
            className="cursor-grab touch-none p-2 active:cursor-grabbing">
            <GripVertical className="size-4 text-muted-foreground" />
          </button>
        </div>
      </div>
      {v.daInviare === 1 && <p className="text-xs text-red-700">da inviare</p>}
      {isOnline && v.daInviare === 0 && <div className="mt-2"><AllegatiVoce voceId={v.id} /></div>}
    </li>
  )
}
