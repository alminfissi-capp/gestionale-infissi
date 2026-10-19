'use client'

import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Forma, PuntoForma } from '@/types/rilievo-grafico'
import { MODELLI, modelloPerId } from '@/lib/rilievo-grafico/modelli'
import { contornoForma, ingombro, misureModello, poligonoContorno } from '@/lib/rilievo-grafico/forma'

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

const numero = (s: string): number | null => {
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Campo numerico che non salta mentre si scrive (accetta anche il valore vuoto per un attimo) */
function CampoMm({ valore, onCambia, etichetta, min }: { valore: number; onCambia: (v: number) => void; etichetta: string; min?: number }) {
  const [testo, setTesto] = useState<string | null>(null)
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{etichetta}</span>
      <Input
        inputMode="decimal" className="h-8 w-24 text-right"
        value={testo ?? String(Math.round(valore * 10) / 10)}
        onChange={e => {
          setTesto(e.target.value)
          const n = numero(e.target.value)
          if (n !== null && (min === undefined || n >= min)) onCambia(n)
        }}
        onBlur={() => setTesto(null)}
      />
    </label>
  )
}

export default function PannelloForma({ forma, onCambia }: { forma: Forma; onCambia: (f: Forma) => void }) {
  const [scegli, setScegli] = useState(false)
  const modello = forma.tipo === 'modello' ? modelloPerId(forma.modello) : undefined
  const misure = useMemo(() => (forma.tipo === 'modello' ? misureModello(forma.modello, forma.misure) : {}), [forma])

  const passaAPunti = () => {
    // Si parte dalla forma attuale (solo i vertici: gli archi si rimettono con la freccia)
    const lati = contornoForma(forma)
    const punti: PuntoForma[] = lati.length >= 3 && lati.every(l => l.tipo === 'retta')
      ? lati.map(l => ({ x: Math.round(l.da.x), h: Math.round(l.da.y) }))
      : [{ x: 0, h: 0 }, { x: 1200, h: 0 }, { x: 1200, h: 1400 }, { x: 0, h: 1400 }]
    onCambia({ tipo: 'punti', punti })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Forma esterna</p>
        <div className="flex gap-1">
          <Button size="sm" variant={forma.tipo === 'modello' ? 'default' : 'outline'} onClick={() => setScegli(s => !s)}>Modelli</Button>
          <Button size="sm" variant={forma.tipo === 'punti' ? 'default' : 'outline'} onClick={() => forma.tipo !== 'punti' && passaAPunti()}>A punti</Button>
        </div>
      </div>

      {scegli && (
        <div className="grid max-h-80 grid-cols-3 gap-1.5 overflow-y-auto rounded-md border p-1.5">
          {MODELLI.map(m => (
            <button key={m.id} type="button"
              className={`rounded border p-1 text-left hover:bg-accent ${forma.tipo === 'modello' && forma.modello === m.id ? 'border-primary bg-primary/5' : ''}`}
              onClick={() => {
                // Le misure con lo stesso nome si tengono (L e H restano se si cambia modello)
                const vecchie = forma.tipo === 'modello' ? misure : {}
                onCambia({ tipo: 'modello', modello: m.id, misure: misureModello(m.id, vecchie) })
                setScegli(false)
              }}>
              <Miniatura forma={{ tipo: 'modello', modello: m.id, misure: {} }} />
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight">{m.nome}</p>
            </button>
          ))}
        </div>
      )}

      {forma.tipo === 'modello' && modello && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">{modello.nome} · {modello.id}</p>
          {Object.entries(misure).map(([k, v]) => (
            <CampoMm key={`${forma.modello}-${k}`} etichetta={`${k} · ${modello.misure[k] ?? ''}`} valore={v} min={0}
              onCambia={n => onCambia({ ...forma, misure: { ...misure, [k]: n } })} />
          ))}
        </div>
      )}

      {forma.tipo === 'punti' && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            Ogni angolo: distanza dal lato sinistro e altezza da terra. Freccia = quanto sale l&apos;arco del lato verso il punto dopo (meno = rientra; 0 = dritto).
          </p>
          <div className="grid grid-cols-[1.5rem_1fr_1fr_1fr_2rem] items-center gap-1 text-xs text-muted-foreground">
            <span>#</span><span>Da sinistra</span><span>Da terra</span><span>Freccia</span><span />
          </div>
          {forma.punti.map((p, i) => {
            const cambia = (q: Partial<PuntoForma>) => onCambia({ tipo: 'punti', punti: forma.punti.map((x, j) => (j === i ? { ...x, ...q } : x)) })
            return (
              <div key={i} className="grid grid-cols-[1.5rem_1fr_1fr_1fr_2rem] items-center gap-1">
                <span className="text-xs font-semibold">{i + 1}</span>
                <CampoPunto valore={p.x} onCambia={x => cambia({ x })} />
                <CampoPunto valore={p.h} onCambia={h => cambia({ h })} />
                <CampoPunto valore={p.freccia ?? 0} onCambia={f => cambia({ freccia: f || undefined })} />
                <Button size="icon" variant="ghost" className="size-8" disabled={forma.punti.length <= 3}
                  onClick={() => onCambia({ tipo: 'punti', punti: forma.punti.filter((_, j) => j !== i) })}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            )
          })}
          <Button size="sm" variant="outline" className="gap-1" onClick={() => {
            const u = forma.punti[forma.punti.length - 1], pr = forma.punti[0]
            onCambia({ tipo: 'punti', punti: [...forma.punti, { x: Math.round((u.x + pr.x) / 2), h: Math.round((u.h + pr.h) / 2) }] })
          }}>
            <Plus className="size-4" />Aggiungi punto
          </Button>
        </div>
      )}
    </div>
  )
}

function CampoPunto({ valore, onCambia }: { valore: number; onCambia: (v: number) => void }) {
  const [testo, setTesto] = useState<string | null>(null)
  return (
    <Input inputMode="decimal" className="h-8 px-2 text-right"
      value={testo ?? String(valore)}
      onChange={e => { setTesto(e.target.value); const n = numero(e.target.value); if (n !== null) onCambia(n) }}
      onBlur={() => setTesto(null)} />
  )
}
