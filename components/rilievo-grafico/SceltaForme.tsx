'use client'

import type { Forma, PuntoForma } from '@/types/rilievo-grafico'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MODELLI, modelloPerId } from '@/lib/rilievo-grafico/modelli'
import { contornoForma, formaInPunti, ingombro, misureModello, poligonoContorno } from '@/lib/rilievo-grafico/forma'

function Miniatura({ forma }: { forma: Forma }) {
  const p = poligonoContorno(contornoForma(forma))
  if (p.length < 3) return <div className="h-14 w-full" />
  const b = ingombro(p)
  const m = Math.max(b.maxX, b.maxY) * 0.06
  return (
    <svg viewBox={`${-m} ${-m} ${b.maxX + 2 * m} ${b.maxY + 2 * m}`} className="h-14 w-full">
      <path d={p.map((q, i) => `${i ? 'L' : 'M'}${q.x},${b.maxY - q.y}`).join(' ') + 'Z'} fill="#e0f2fe" stroke="#334155" strokeWidth={Math.max(b.maxX, b.maxY) * 0.025} strokeLinejoin="round" />
    </svg>
  )
}

interface Props {
  aperta: boolean
  onChiudi: () => void
  /** Forma scelta, gia' a punti: da qui si modifica lato per lato sul disegno */
  onScegli: (punti: PuntoForma[]) => void
  /** Ingombro del disegno attuale: il modello nuovo parte con queste misure */
  larghezza: number
  altezza: number
}

/** I modelli di FP PRO come punto di partenza per fare prima */
export default function SceltaForme({ aperta, onChiudi, onScegli, larghezza, altezza }: Props) {
  const scegli = (id: string) => {
    const nomi = Object.keys(modelloPerId(id)?.misure ?? {})
    const attuali: Record<string, number> = {}
    if (nomi.includes('L') && larghezza > 0) attuali.L = Math.round(larghezza)
    if (nomi.includes('H') && altezza > 0) attuali.H = Math.round(altezza)
    const punti = formaInPunti({ tipo: 'modello', modello: id, misure: misureModello(id, attuali) })
    if (punti.length >= 2) onScegli(punti)
    onChiudi()
  }
  return (
    <Dialog open={aperta} onOpenChange={o => { if (!o) onChiudi() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Scegli la forma</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Poi le misure si cambiano toccando le quote sul disegno.</p>
        <div className="grid max-h-[60vh] grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-5">
          {MODELLI.map(m => (
            <button key={m.id} type="button" className="rounded border p-1 text-left hover:bg-accent" onClick={() => scegli(m.id)}>
              <Miniatura forma={{ tipo: 'modello', modello: m.id, misure: {} }} />
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight">{m.nome}</p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
