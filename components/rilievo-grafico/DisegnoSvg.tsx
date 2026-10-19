'use client'

import { useId, useRef, useState } from 'react'
import type { Assegnazione, Pt } from '@/types/rilievo-grafico'
import { pezziInOrdine, type AntaCalcolata, type DisegnoCalcolato, type PezzoCalcolato } from '@/lib/rilievo-grafico/geometria'
import { ingombro } from '@/lib/rilievo-grafico/forma'

export type ModoDisegno = 'struttura' | 'traccia' | 'profili' | 'miniatura'

interface Props {
  calc: DisegnoCalcolato
  modo: ModoDisegno
  /** id di pezzi e zone selezionati */
  selezione?: ReadonlySet<string>
  profili?: Record<string, Assegnazione>
  riempimenti?: Record<string, Assegnazione>
  onPezzo?: (id: string) => void
  onZona?: (id: string) => void
  onQuota?: (idTaglio: string) => void
  onTraccia?: (punti: Pt[]) => void
  className?: string
}

const COLORE_RUOLO: Record<PezzoCalcolato['ruolo'], string> = {
  telaio: '#9ca3af', montante: '#a8a29e', traverso: '#a8a29e', anta: '#d4d4d8', anta_scorrevole: '#d4d4d8',
  riporto: '#a1a1aa', fermavetro: '#e4e4e7', fermapannello: '#e4e4e7',
}
const SELEZIONE = '#f97316'
const DA_ASSEGNARE = '#fca5a5'

const percorso = (pts: Pt[], H: number, chiuso = false) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${(H - p.y).toFixed(1)}`).join(' ') + (chiuso ? ' Z' : '')

/** Simbolo di apertura come nei disegni di FP PRO: triangolo tratteggiato, frecce per lo scorrevole */
function Simbolo({ a, H, k }: { a: AntaCalcolata; H: number; k: number }) {
  const b = ingombro(a.poligono)
  const m = Math.min(b.maxX - b.minX, b.maxY - b.minY) * 0.12
  const x0 = b.minX + m, x1 = b.maxX - m, y0 = b.minY + m, y1 = b.maxY - m
  const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2
  const linee: Pt[][] = []
  if (a.apertura === 'scorrevole') {
    const verso = a.indice % 2 === 0 ? 1 : -1
    const l = (x1 - x0) * 0.3
    const xa = xm - (verso * l) / 2, xb = xm + (verso * l) / 2
    linee.push([{ x: xa, y: ym }, { x: xb, y: ym }], [{ x: xb - verso * m * 0.6, y: ym + m * 0.4 }, { x: xb, y: ym }, { x: xb - verso * m * 0.6, y: ym - m * 0.4 }])
  } else {
    if (a.apertura !== 'ribalta') {
      // Cerniere a sinistra = punta del triangolo a destra (lato maniglia)
      const centrale = a.numero % 2 === 1 && a.indice === (a.numero - 1) / 2
      const cerniereSx = a.numero === 1 || centrale ? a.mano !== 'dx' : a.indice < a.numero / 2
      const xc = cerniereSx ? x0 : x1, xp = cerniereSx ? x1 : x0
      linee.push([{ x: xc, y: y1 }, { x: xp, y: ym }, { x: xc, y: y0 }])
    }
    if (a.apertura === 'ribalta' || a.apertura === 'anta_ribalta') linee.push([{ x: x0, y: y0 }, { x: xm, y: y1 }, { x: x1, y: y0 }])
  }
  return (
    <g pointerEvents="none" stroke="#334155" strokeWidth={1.2} strokeDasharray="6 4" fill="none" vectorEffect="non-scaling-stroke" key={k}>
      {linee.map((l, i) => <path key={i} d={percorso(l, H)} vectorEffect="non-scaling-stroke" />)}
    </g>
  )
}

export default function DisegnoSvg({ calc, modo, selezione, profili, riempimenti, onPezzo, onZona, onQuota, onTraccia, className }: Props) {
  const uid = useId().replace(/:/g, '')
  const svg = useRef<SVGSVGElement>(null)
  const [traccia, setTraccia] = useState<Pt[] | null>(null)
  const W = calc.larghezza, H = calc.altezza
  if (calc.poligono.length < 3) {
    return <div className={`flex items-center justify-center text-sm text-muted-foreground ${className ?? ''}`}>Forma non valida: controlla le misure</div>
  }
  const mini = modo === 'miniatura'
  const pad = mini ? Math.max(W, H) * 0.04 : Math.max(W, H) * 0.12
  const interattivo = !mini
  const sel = selezione ?? new Set<string>()
  const pezzi = pezziInOrdine(calc)

  const verso = (e: React.PointerEvent): Pt | null => {
    const s = svg.current
    const ctm = s?.getScreenCTM()
    if (!s || !ctm) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: H - p.y }
  }

  const coloreZona = (id: string, materiale: string | null) => {
    if (sel.has(id)) return '#fed7aa'
    if (modo === 'profili' && materiale && (!riempimenti?.[id] || (riempimenti[id].materiale && riempimenti[id].materiale !== materiale))) return '#fee2e2'
    if (materiale === 'vetro') return '#dbeafe'
    if (materiale === 'pannello') return '#e7e5e4'
    if (materiale === 'doghe') return `url(#${uid}-doghe)`
    if (materiale === 'lamelle') return `url(#${uid}-lamelle)`
    return `url(#${uid}-vuota)`
  }
  const colorePezzo = (p: PezzoCalcolato) => {
    if (sel.has(p.id)) return SELEZIONE
    if (modo === 'profili' && !profili?.[p.id]) return DA_ASSEGNARE
    return COLORE_RUOLO[p.ruolo]
  }

  const fs = Math.max(W, H) * 0.035
  return (
    <svg
      ref={svg}
      viewBox={`${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}`}
      className={className}
      style={{ touchAction: modo === 'traccia' ? 'none' : undefined, userSelect: 'none' }}
      onPointerDown={modo === 'traccia' ? e => { const p = verso(e); if (p) { e.currentTarget.setPointerCapture?.(e.pointerId); setTraccia([p]) } } : undefined}
      onPointerMove={modo === 'traccia' && traccia ? e => { const p = verso(e); if (p) setTraccia(t => (t ? [...t, p] : t)) } : undefined}
      onPointerUp={modo === 'traccia' && traccia ? () => { const t = traccia; setTraccia(null); if (t.length > 1) onTraccia?.(t) } : undefined}
      onPointerCancel={() => setTraccia(null)}
    >
      <defs>
        <pattern id={`${uid}-doghe`} width="80" height="80" patternUnits="userSpaceOnUse">
          <rect width="80" height="80" fill="#f5f5f4" /><path d="M0,40 H80 M0,0 H80" stroke="#a8a29e" strokeWidth="3" />
        </pattern>
        <pattern id={`${uid}-lamelle`} width="60" height="60" patternUnits="userSpaceOnUse">
          <rect width="60" height="60" fill="#f5f5f4" /><path d="M0,60 L60,0" stroke="#a8a29e" strokeWidth="5" />
        </pattern>
        <pattern id={`${uid}-vuota`} width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="#ffffff" /><path d="M0,40 L40,0" stroke="#fcd34d" strokeWidth="2" />
        </pattern>
        {calc.zone.map(z => <clipPath key={z.id} id={`${uid}-z-${z.id}`}><path d={percorso(z.poligono.p, H, true)} /></clipPath>)}
        <clipPath id={`${uid}-forma`}><path d={percorso(calc.poligono, H, true)} /></clipPath>
        {calc.ante.map(a => <clipPath key={`${a.id}-${a.indice}`} id={`${uid}-a-${a.id}-${a.indice}`}><path d={percorso(a.poligono, H, true)} /></clipPath>)}
      </defs>

      {/* Zone finali */}
      {calc.zone.filter(z => z.foglia).map(z => (
        <path key={z.id} d={percorso(z.poligono.p, H, true)} fill={coloreZona(z.id, z.materiale)}
          onClick={interattivo && modo !== 'traccia' ? () => onZona?.(z.id) : undefined}
          className={interattivo && modo !== 'traccia' ? 'cursor-pointer' : undefined} />
      ))}

      {/* Pezzi: dal piu' interno al telaio, ognuno ritagliato sulla sua zona */}
      {pezzi.map(p => {
        const clip = p.ruolo === 'telaio' ? `${uid}-forma` : p.ruolo === 'anta' || p.ruolo === 'anta_scorrevole'
          ? `${uid}-a-${p.elemento}-${p.id.split(':')[1]}`
          : p.ruolo === 'fermavetro' || p.ruolo === 'fermapannello' ? `${uid}-z-${p.elemento}`
            // montanti, traversi e riporti: all'asse, solo dentro la forma
            : `${uid}-forma`
        const d = p.tratti.map(t => percorso(t, H)).join(' ')
        const cap = p.ruolo === 'montante' || p.ruolo === 'traverso' || p.ruolo === 'riporto' ? 'square' : 'round'
        const colore = colorePezzo(p)
        // Bordo scuro sotto e fascia chiara sopra: ogni pezzo si distingue dai vicini
        const bordo = mini ? 0 : Math.max(W, H) * 0.004
        return (
          <g key={p.id} clipPath={`url(#${clip})`}
            onClick={interattivo && modo !== 'traccia' ? e => { e.stopPropagation(); onPezzo?.(p.id) } : undefined}
            className={interattivo && modo !== 'traccia' ? 'cursor-pointer' : undefined}>
            {!mini && <title>{p.nome}{profili?.[p.id] ? ` — ${profili[p.id].codice}` : ''}</title>}
            {bordo > 0 && <path d={d} fill="none" stroke={colore === SELEZIONE ? '#9a3412' : '#52525b'} strokeWidth={p.larghezzaTratto} strokeLinecap={cap} />}
            <path d={d} fill="none" stroke={colore} strokeWidth={Math.max(1, p.larghezzaTratto - 2 * bordo)} strokeLinecap={cap} />
          </g>
        )
      })}

      {/* Contorno esterno */}
      <g fill="none" stroke="#475569" pointerEvents="none">
        <path d={percorso(calc.poligono, H, true)} strokeWidth={mini ? 1 : 1.6} vectorEffect="non-scaling-stroke" />
      </g>

      {!mini && calc.ante.map((a, i) => <Simbolo key={`${a.id}-${a.indice}`} a={a} H={H} k={i} />)}

      {/* Numero delle zone e quote */}
      {!mini && calc.zone.filter(z => z.foglia).map(z => {
        const b = ingombro(z.poligono.p)
        return (
          <text key={z.id} x={(b.minX + b.maxX) / 2} y={H - (b.minY + b.maxY) / 2} fontSize={fs * 0.7} textAnchor="middle" dominantBaseline="middle" fill="#64748b" pointerEvents="none">
            {z.materiale ? `Z${z.numero}` : `Z${z.numero} ?`}
          </text>
        )
      })}
      {!mini && modo !== 'profili' && calc.quote.map(q => {
        const x = q.posizione.x, y = H - q.posizione.y
        return (
          <g key={q.id} onClick={e => { e.stopPropagation(); onQuota?.(q.id) }} className="cursor-pointer">
            <rect x={x - fs * 1.6} y={y - fs * 0.65} width={fs * 3.2} height={fs * 1.3} rx={fs * 0.2} fill={sel.has(q.id) ? SELEZIONE : '#ffffff'} stroke="#f97316" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={x} y={y} fontSize={fs * 0.8} textAnchor="middle" dominantBaseline="central" fill={sel.has(q.id) ? '#fff' : '#c2410c'}>{q.valore}</text>
          </g>
        )
      })}
      {!mini && (
        <g fill="#334155" fontSize={fs} pointerEvents="none">
          <line x1={0} x2={W} y1={H + pad * 0.45} y2={H + pad * 0.45} stroke="#334155" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <text x={W / 2} y={H + pad * 0.8} textAnchor="middle">{Math.round(W)}</text>
          <line x1={W + pad * 0.45} x2={W + pad * 0.45} y1={0} y2={H} stroke="#334155" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <text x={W + pad * 0.75} y={H / 2} textAnchor="middle" transform={`rotate(-90 ${W + pad * 0.75} ${H / 2})`}>{Math.round(H)}</text>
        </g>
      )}

      {traccia && traccia.length > 1 && (
        <path d={percorso(traccia, H)} fill="none" stroke="#f97316" strokeWidth={3} strokeDasharray="8 6" vectorEffect="non-scaling-stroke" pointerEvents="none" />
      )}
    </svg>
  )
}
