'use client'

import { cn } from '@/lib/utils'
import type { VanoNode, VanoLeaf } from '@/types/rilievo-veloce'

// ─── Costanti disegno ─────────────────────────────────────────

const SVG_W     = 220
const FW        = 10    // spessore telaio esterno
const AW        = 4     // spessore telaio anta/traversa

const C_FRAME   = '#94a3b8'
const C_FBORDER = '#1e293b'
const C_BG      = '#e2e8f0'
const C_GLASS   = '#dbeafe'
const C_GLASS_S = '#93c5fd'
const C_GLASS_F = '#cbd5e1'
const C_ABORDER = '#475569'
const C_ABORD_S = '#1d4ed8'
const C_HANDLE  = '#1e3a5f'
const C_DIM     = '#64748b'
const C_LINE    = '#475569'

type PosManiglia = 'right' | 'left' | 'top' | 'bottom'
export type TipoApertura = 'battente' | 'scorrevole' | 'alzante_scorrevole' | null

// ─── Etichette e tipi apertura ────────────────────────────────

export const APERTURE_BATTENTE = [
  'battente_interno_sx',
  'battente_interno_dx',
  'battente_esterno_sx',
  'battente_esterno_dx',
  'vasistas',
  'vasistas_rovescio',
  'vasistas_spingere',
  'bilico_v',
  'bilico_h',
  'fisso',
] as const

export const APERTURE_SCORREVOLE = [
  'mobile_sx',
  'mobile_dx',
  'fisso',
] as const

export const LABEL_APERTURA: Record<string, string> = {
  battente_interno_sx:  'Battente int. — cer. sx',
  battente_interno_dx:  'Battente int. — cer. dx',
  battente_esterno_sx:  'Battente est. — cer. sx',
  battente_esterno_dx:  'Battente est. — cer. dx',
  vasistas:             'Vasistas',
  vasistas_rovescio:    'Vasistas rovescio',
  vasistas_spingere:    'Vasistas a spingere',
  bilico_v:             'Bilico verticale',
  bilico_h:             'Bilico orizzontale',
  fisso:                'Fisso',
  mobile_sx:            '← Scorrevole sx',
  mobile_dx:            'Scorrevole dx →',
}

export function aperturaToHandle(tipo: string): PosManiglia | null {
  if (!tipo || tipo === 'fisso') return null
  if (tipo === 'battente_interno_sx' || tipo === 'battente_esterno_sx') return 'right'
  if (tipo === 'battente_interno_dx' || tipo === 'battente_esterno_dx') return 'left'
  if (tipo === 'vasistas' || tipo === 'vasistas_spingere') return 'bottom'
  if (tipo === 'vasistas_rovescio') return 'top'
  if (tipo === 'bilico_v') return 'right'
  if (tipo === 'bilico_h') return 'bottom'
  if (tipo === 'mobile_sx') return 'right'
  if (tipo === 'mobile_dx') return 'left'
  return null
}

export function defaultAperturaAnte(
  tipo: TipoApertura,
  nAnte: number,
  nTraverse: number = 0,
): string[] {
  const nCols = nAnte
  const nRows = nTraverse + 1
  return Array.from({ length: nCols * nRows }, (_, i) => {
    const col = i % nCols
    const row = Math.floor(i / nCols)
    if (row < nRows - 1) return 'fisso'
    if (tipo === 'battente') {
      if (nCols === 1) return 'battente_interno_sx'
      if (col === 0) return 'battente_interno_sx'
      if (col === nCols - 1) return 'battente_interno_dx'
      return 'fisso'
    }
    if (tipo === 'scorrevole' || tipo === 'alzante_scorrevole') {
      if (nCols === 1) return 'mobile_sx'
      if (nCols === 2) return col === 0 ? 'mobile_sx' : 'fisso'
      if (col === 0) return 'mobile_sx'
      if (col === nCols - 1) return 'mobile_dx'
      return 'fisso'
    }
    return ''
  })
}

// ─── Geometria quad ──────────────────────────────────────────

type P = { x: number; y: number }
type Quad = { tl: P; tr: P; br: P; bl: P }

function qPath({ tl, tr, br, bl }: Quad): string {
  return `M ${tl.x},${tl.y} L ${tr.x},${tr.y} L ${br.x},${br.y} L ${bl.x},${bl.y} Z`
}

function insetQ(q: Quad, d: number): Quad {
  return {
    tl: { x: q.tl.x + d, y: q.tl.y + d },
    tr: { x: q.tr.x - d, y: q.tr.y + d },
    br: { x: q.br.x - d, y: q.br.y - d },
    bl: { x: q.bl.x + d, y: q.bl.y - d },
  }
}

/** Slice verticale della quad: da frazione f0 a f1 (0..1) della larghezza */
function sliceV(q: Quad, f0: number, f1: number): Quad {
  const lxt = q.tl.x + (q.tr.x - q.tl.x) * f0
  const rxt = q.tl.x + (q.tr.x - q.tl.x) * f1
  const lyt = q.tl.y + (q.tr.y - q.tl.y) * f0
  const ryt = q.tl.y + (q.tr.y - q.tl.y) * f1
  const lxb = q.bl.x + (q.br.x - q.bl.x) * f0
  const rxb = q.bl.x + (q.br.x - q.bl.x) * f1
  const lyb = q.bl.y + (q.br.y - q.bl.y) * f0
  const ryb = q.bl.y + (q.br.y - q.bl.y) * f1
  return {
    tl: { x: lxt, y: lyt }, tr: { x: rxt, y: ryt },
    br: { x: rxb, y: ryb }, bl: { x: lxb, y: lyb },
  }
}

function splitMontante(q: Quad, f: number): [Quad, Quad] {
  const x  = q.tl.x + (q.tr.x - q.tl.x) * f
  const yt = q.tl.y + (q.tr.y - q.tl.y) * f
  const yb = q.bl.y + (q.br.y - q.bl.y) * f
  return [
    { tl: q.tl, tr: { x, y: yt }, br: { x, y: yb }, bl: q.bl },
    { tl: { x, y: yt }, tr: q.tr, br: q.br, bl: { x, y: yb } },
  ]
}

function splitTraverso(q: Quad, f: number): [Quad, Quad] {
  const yl = q.tl.y + (q.bl.y - q.tl.y) * f
  const yr = q.tr.y + (q.br.y - q.tr.y) * f
  return [
    { tl: q.tl, tr: q.tr, br: { x: q.tr.x, y: yr }, bl: { x: q.tl.x, y: yl } },
    { tl: { x: q.tl.x, y: yl }, tr: { x: q.tr.x, y: yr }, br: q.br, bl: q.bl },
  ]
}

function hitQuad(q: Quad, px: number, py: number): boolean {
  const w = q.tr.x - q.tl.x
  if (w <= 0 || px < q.tl.x || px > q.tr.x) return false
  const f = (px - q.tl.x) / w
  const topY = q.tl.y + (q.tr.y - q.tl.y) * f
  const botY = q.bl.y + (q.br.y - q.bl.y) * f
  return py >= topY && py <= botY
}

function hitTree(node: VanoNode, q: Quad, wMm: number, hMm: number, px: number, py: number): VanoLeaf | null {
  if (!hitQuad(q, px, py)) return null
  if (node.type === 'leaf') return node
  const clampedF = clampSplitF(node, wMm, hMm)
  const [q0, q1] = node.direzione === 'montante'
    ? splitMontante(q, clampedF)
    : splitTraverso(q, clampedF)
  const [w0, h0] = node.direzione === 'montante' ? [node.mm, hMm] : [wMm, hMm - node.mm]
  const [w1, h1] = node.direzione === 'montante' ? [wMm - node.mm, hMm] : [wMm, node.mm]
  return hitTree(node.figli[0], q0, w0, h0, px, py) ?? hitTree(node.figli[1], q1, w1, h1, px, py)
}

/** Calcola la frazione SVG di un VanoSplit in base ai mm e alle dimensioni del vano padre */
function clampSplitF(node: { direzione: 'montante' | 'traverso'; mm: number }, wMm: number, hMm: number): number {
  const f = node.direzione === 'montante'
    ? node.mm / Math.max(wMm, 1)
    : (hMm - node.mm) / Math.max(hMm, 1)   // mm dal basso → frazione dall'alto
  return Math.max(0.04, Math.min(0.96, f))
}

// ─── Simbolo apertura SVG ─────────────────────────────────────

function AperturaSymbol({
  tipo, gx, gy, gw, gh,
}: { tipo: string; gx: number; gy: number; gw: number; gh: number }) {
  const cx = gx + gw / 2
  const cy = gy + gh / 2
  const lw = 1
  if (tipo === 'fisso') return (
    <g opacity={0.35}>
      <line x1={gx} y1={gy} x2={gx + gw} y2={gy + gh} stroke={C_LINE} strokeWidth={lw} />
      <line x1={gx + gw} y1={gy} x2={gx} y2={gy + gh} stroke={C_LINE} strokeWidth={lw} />
    </g>
  )
  if (tipo === 'battente_interno_sx') return <line x1={gx} y1={gy} x2={gx + gw} y2={gy + gh} stroke={C_LINE} strokeWidth={lw} />
  if (tipo === 'battente_interno_dx') return <line x1={gx + gw} y1={gy} x2={gx} y2={gy + gh} stroke={C_LINE} strokeWidth={lw} />
  if (tipo === 'battente_esterno_sx') return <line x1={gx} y1={gy} x2={gx + gw} y2={gy + gh} stroke={C_LINE} strokeWidth={lw} strokeDasharray="3,2" />
  if (tipo === 'battente_esterno_dx') return <line x1={gx + gw} y1={gy} x2={gx} y2={gy + gh} stroke={C_LINE} strokeWidth={lw} strokeDasharray="3,2" />
  if (tipo === 'vasistas') return <g><line x1={gx} y1={gy} x2={cx} y2={gy + gh} stroke={C_LINE} strokeWidth={lw} /><line x1={gx + gw} y1={gy} x2={cx} y2={gy + gh} stroke={C_LINE} strokeWidth={lw} /></g>
  if (tipo === 'vasistas_rovescio') return <g><line x1={gx} y1={gy + gh} x2={cx} y2={gy} stroke={C_LINE} strokeWidth={lw} /><line x1={gx + gw} y1={gy + gh} x2={cx} y2={gy} stroke={C_LINE} strokeWidth={lw} /></g>
  if (tipo === 'vasistas_spingere') return <g><line x1={gx} y1={gy} x2={cx} y2={gy + gh} stroke={C_LINE} strokeWidth={lw} strokeDasharray="3,2" /><line x1={gx + gw} y1={gy} x2={cx} y2={gy + gh} stroke={C_LINE} strokeWidth={lw} strokeDasharray="3,2" /></g>
  if (tipo === 'bilico_v') return <g><line x1={cx} y1={gy} x2={cx} y2={gy + gh} stroke={C_LINE} strokeWidth={lw} strokeDasharray="2,1.5" /><text x={gx + 3} y={cy + 3} fontSize={7} fill={C_LINE}>←</text><text x={gx + gw - 3} y={cy + 3} fontSize={7} fill={C_LINE} textAnchor="end">→</text></g>
  if (tipo === 'bilico_h') return <g><line x1={gx} y1={cy} x2={gx + gw} y2={cy} stroke={C_LINE} strokeWidth={lw} strokeDasharray="2,1.5" /><text x={cx} y={gy + 8} fontSize={7} fill={C_LINE} textAnchor="middle">↑</text><text x={cx} y={gy + gh - 3} fontSize={7} fill={C_LINE} textAnchor="middle">↓</text></g>
  if (tipo === 'mobile_sx') return <text x={cx} y={cy + 5} fontSize={16} fill={C_LINE} textAnchor="middle" fontWeight="bold">←</text>
  if (tipo === 'mobile_dx') return <text x={cx} y={cy + 5} fontSize={16} fill={C_LINE} textAnchor="middle" fontWeight="bold">→</text>
  return null
}

// ─── Handle ─────────────────────────────────────────────────

function Handle({ a, side }: { a: { x: number; y: number; w: number; h: number }; side: PosManiglia }) {
  const midX = a.x + a.w / 2
  const midY = a.y + a.h / 2
  if (side === 'right') {
    const px = a.x + a.w - AW - 3.5
    return <g fill={C_HANDLE}><rect x={px} y={midY - 9} width={3.5} height={18} rx={1.75} /><rect x={px - 7} y={midY - 2} width={8} height={4} rx={2} /></g>
  }
  if (side === 'left') {
    const px = a.x + AW + 0.5
    return <g fill={C_HANDLE}><rect x={px} y={midY - 9} width={3.5} height={18} rx={1.75} /><rect x={px + 3.5} y={midY - 2} width={8} height={4} rx={2} /></g>
  }
  if (side === 'top') {
    const py = a.y + AW + 0.5
    return <g fill={C_HANDLE}><rect x={midX - 9} y={py} width={18} height={3.5} rx={1.75} /><rect x={midX - 2} y={py + 3.5} width={4} height={8} rx={2} /></g>
  }
  const py = a.y + a.h - AW - 4
  return <g fill={C_HANDLE}><rect x={midX - 9} y={py} width={18} height={3.5} rx={1.75} /><rect x={midX - 2} y={py - 8} width={4} height={8} rx={2} /></g>
}

// ─── Rendering foglia con N ante ─────────────────────────────

function renderLeaf(
  node: VanoLeaf,
  q: Quad,
  selectedId: string | null,
  canClick: boolean,
  onSelectVano?: (id: string) => void,
) {
  const isSelected = node.id === selectedId
  const nAnte = Math.max(1, Math.min(8, node.n_ante ?? 1))
  const inner = insetQ(q, AW)

  return (
    <g key={node.id}
      onClick={() => canClick && onSelectVano?.(node.id)}
      style={{ cursor: canClick ? 'pointer' : 'default' }}>
      {/* Bordo esterno del vano */}
      <path d={qPath(q)} fill={C_FRAME} />

      {/* Ante (divisioni verticali uguali) */}
      {Array.from({ length: nAnte }, (_, i) => {
        const aQ = sliceV(inner, i / nAnte, (i + 1) / nAnte)
        const apertura = node.apertura_ante[i] ?? ''
        const isFisso = apertura === 'fisso'
        const glassColor = isSelected ? C_GLASS_S : isFisso ? C_GLASS_F : C_GLASS
        const borderColor = isSelected ? C_ABORD_S : C_ABORDER
        const bw = isSelected ? 1.5 : 0.5

        // bounding box approssimata per simbolo e maniglia
        const gx = aQ.tl.x
        const gy = Math.max(aQ.tl.y, aQ.tr.y)
        const gw = aQ.tr.x - aQ.tl.x
        const gh = aQ.bl.y - gy
        const handleSide = aperturaToHandle(apertura)

        return (
          <g key={i}>
            {/* Montante inter-anta (dal secondo in poi) */}
            {i > 0 && (
              <line
                x1={aQ.tl.x} y1={aQ.tl.y} x2={aQ.bl.x} y2={aQ.bl.y}
                stroke={C_FRAME} strokeWidth={AW}
              />
            )}
            {gw > 2 && gh > 2 && (
              <>
                <path d={qPath(aQ)} fill={glassColor} stroke={borderColor} strokeWidth={bw} />
                {apertura && <AperturaSymbol tipo={apertura} gx={gx} gy={gy} gw={gw} gh={gh} />}
                {handleSide && (
                  <Handle a={{ x: aQ.tl.x, y: gy, w: gw, h: gh }} side={handleSide} />
                )}
              </>
            )}
          </g>
        )
      })}

      {/* Indicatore "vuoto" se nessuna configurazione */}
      {!node.tipo_apertura && nAnte === 1 && (
        <text x={(inner.tl.x + inner.tr.x) / 2} y={(inner.tl.y + inner.bl.y) / 2 + 4}
          textAnchor="middle" fontSize={10} fill={C_ABORDER} opacity={0.4}>—</text>
      )}
    </g>
  )
}

// ─── Rendering ricorsivo albero vani ─────────────────────────

function renderNode(
  node: VanoNode,
  q: Quad,
  wMm: number,
  hMm: number,
  selectedId: string | null,
  canClick: boolean,
  onSelectVano?: (id: string) => void,
): React.ReactNode {
  if (node.type === 'leaf') return renderLeaf(node, q, selectedId, canClick, onSelectVano)

  const f = clampSplitF(node, wMm, hMm)
  const [q0, q1] = node.direzione === 'montante' ? splitMontante(q, f) : splitTraverso(q, f)
  const [w0, h0] = node.direzione === 'montante' ? [node.mm, hMm] : [wMm, hMm - node.mm]
  const [w1, h1] = node.direzione === 'montante' ? [wMm - node.mm, hMm] : [wMm, node.mm]

  return (
    <>
      {renderNode(node.figli[0], q0, w0, h0, selectedId, canClick, onSelectVano)}
      {renderNode(node.figli[1], q1, w1, h1, selectedId, canClick, onSelectVano)}
    </>
  )
}

// ─── Props ───────────────────────────────────────────────────

interface Props {
  struttura: string | null
  nAnte: number | null
  nTraverse?: number | null
  larghezza: number | null
  altezza: number | null
  antaPrincipale: number | null
  posManiglia?: PosManiglia | null
  tipoApertura?: TipoApertura
  aperturaAnte?: string[]
  onSelectAnta?: (idx: number) => void
  // Forma trapezoidale
  fuoriSquadro?: boolean
  altezzaSx?: number | null
  altezzaDx?: number | null
  // Albero vani avanzato
  vaniTree?: VanoNode | null
  selectedVanoId?: string | null
  onSelectVano?: (id: string) => void
  className?: string
}

// ─── Componente principale ────────────────────────────────────

export default function PreviewSerramento({
  struttura, nAnte, nTraverse, larghezza, altezza,
  antaPrincipale, posManiglia,
  tipoApertura, aperturaAnte,
  onSelectAnta,
  fuoriSquadro = false,
  altezzaSx, altezzaDx,
  vaniTree, selectedVanoId, onSelectVano,
  className,
}: Props) {

  // Dimensioni efficaci in mm per l'albero
  const wMm = larghezza ?? 1000
  const hMm = fuoriSquadro && altezzaSx && altezzaDx
    ? Math.max(altezzaSx, altezzaDx)
    : (altezza ?? 1000)

  // Dimensioni SVG
  const altMax = fuoriSquadro && altezzaSx && altezzaDx
    ? Math.max(altezzaSx, altezzaDx)
    : (altezza ?? 0)
  const ratio = larghezza && altMax && larghezza > 0 ? altMax / larghezza : 4 / 3
  const SVG_H = Math.max(90, Math.min(320, Math.round(SVG_W * ratio)))
  const ix = FW, iy = FW
  const iw = SVG_W - FW * 2
  const ih = SVG_H - FW * 2

  // Root quad
  let rootQuad: Quad
  let outerTopLeft: P
  let outerTopRight: P

  if (fuoriSquadro && altezzaSx && altezzaDx && altMax > 0) {
    const hSx = ih * altezzaSx / altMax
    const hDx = ih * altezzaDx / altMax
    rootQuad = {
      tl: { x: ix,      y: iy + (ih - hSx) },
      tr: { x: ix + iw, y: iy + (ih - hDx) },
      br: { x: ix + iw, y: iy + ih },
      bl: { x: ix,      y: iy + ih },
    }
    outerTopLeft  = { x: 0,     y: rootQuad.tl.y - FW }
    outerTopRight = { x: SVG_W, y: rootQuad.tr.y - FW }
  } else {
    rootQuad = {
      tl: { x: ix,      y: iy },
      tr: { x: ix + iw, y: iy },
      br: { x: ix + iw, y: iy + ih },
      bl: { x: ix,      y: iy + ih },
    }
    outerTopLeft  = { x: 0, y: 0 }
    outerTopRight = { x: SVG_W, y: 0 }
  }

  const outerPath = `M ${outerTopLeft.x},${outerTopLeft.y} L ${outerTopRight.x},${outerTopRight.y} L ${SVG_W},${SVG_H} L 0,${SVG_H} Z`

  const isTreeMode = !!vaniTree
  const canClickVano = isTreeMode && !!onSelectVano
  const canClickAnta = !isTreeMode && !!onSelectAnta

  // Griglia legacy
  const nCols = Math.max(0, Math.min(nAnte ?? 0, 8))
  const nRows = Math.max(1, (nTraverse ?? 0) + 1)

  const legacyCells = !isTreeMode ? Array.from({ length: nCols * nRows }, (_, i) => {
    const col = i % nCols
    const row = Math.floor(i / nCols)
    return {
      x: ix + Math.round((iw / nCols) * col),
      y: iy + Math.round((ih / nRows) * row),
      w: Math.round(iw / nCols),
      h: Math.round(ih / nRows),
      idx: i,
    }
  }) : []

  function getAperturaAnta(idx: number) { return aperturaAnte?.[idx] ?? '' }
  function getHandleSide(idx: number): PosManiglia | null {
    if (tipoApertura) return aperturaToHandle(getAperturaAnta(idx))
    if (antaPrincipale !== idx) return null
    if (posManiglia) return posManiglia
    return nCols === 1 ? 'right' : (idx < nCols / 2 ? 'right' : 'left')
  }

  const CYCLE_MANIGLIA: PosManiglia[] = ['right', 'left', 'top', 'bottom']

  function handleSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!canClickVano || !vaniTree) return
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const px = (e.clientX - rect.left) * SVG_W / rect.width
    const py = (e.clientY - rect.top) * SVG_H / rect.height
    const hit = hitTree(vaniTree, rootQuad, wMm, hMm, px, py)
    if (hit) onSelectVano?.(hit.id)
  }

  return (
    <div className={cn('flex flex-col items-center gap-1.5', className)}>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ width: '100%', maxWidth: SVG_W, display: 'block' }}
        aria-label="Anteprima serramento"
        onClick={handleSvgClick}
      >
        {/* Telaio esterno */}
        <path d={outerPath} fill={C_FRAME} stroke={C_FBORDER} strokeWidth={1} />
        {/* Sfondo interno */}
        <path d={qPath(rootQuad)} fill={C_BG} />

        {/* ── Albero vani ── */}
        {isTreeMode && vaniTree && renderNode(vaniTree, rootQuad, wMm, hMm, selectedVanoId ?? null, canClickVano, onSelectVano)}

        {/* ── Griglia legacy ── */}
        {!isTreeMode && nCols === 0 && (
          <>
            <rect x={ix + AW} y={iy + AW} width={iw - AW * 2} height={ih - AW * 2}
              fill={C_GLASS} stroke={C_ABORDER} strokeWidth={AW} />
            <line x1={ix + AW} y1={iy + AW} x2={ix + iw - AW} y2={iy + ih - AW} stroke="#93c5fd" strokeWidth={1} />
            <line x1={ix + iw - AW} y1={iy + AW} x2={ix + AW} y2={iy + ih - AW} stroke="#93c5fd" strokeWidth={1} />
            {struttura && (
              <text x={SVG_W / 2} y={iy + ih / 2 + 4} textAnchor="middle" fontSize={9} fill="#60a5fa" fontWeight="600">
                {struttura.toUpperCase()}
              </text>
            )}
          </>
        )}
        {!isTreeMode && legacyCells.map((cell) => {
          const isPrinc = antaPrincipale === cell.idx
          const apertura = getAperturaAnta(cell.idx)
          const handleSide = getHandleSide(cell.idx)
          const gx = cell.x + AW, gy = cell.y + AW
          const gw = cell.w - AW * 2, gh = cell.h - AW * 2
          const isFisso = apertura === 'fisso'
          const glassColor = tipoApertura ? (isPrinc ? C_GLASS_S : isFisso ? C_GLASS_F : C_GLASS) : (isPrinc ? C_GLASS_S : C_GLASS)
          return (
            <g key={cell.idx}
              onClick={() => canClickAnta && onSelectAnta?.(cell.idx)}
              style={{ cursor: canClickAnta ? 'pointer' : 'default' }}>
              <rect x={cell.x} y={cell.y} width={cell.w} height={cell.h} fill={C_FRAME} />
              <rect x={gx} y={gy} width={gw} height={gh} fill={glassColor} stroke={isPrinc ? C_ABORD_S : C_ABORDER} strokeWidth={isPrinc ? 1.5 : 0.5} />
              {apertura && tipoApertura && <AperturaSymbol tipo={apertura} gx={gx} gy={gy} gw={gw} gh={gh} />}
              {handleSide && <Handle a={cell} side={handleSide} />}
              {!tipoApertura && canClickAnta && !isPrinc && (
                <text x={cell.x + cell.w / 2} y={cell.y + cell.h / 2 + 4} textAnchor="middle" fontSize={14} fill="#94a3b8" opacity={0.8}>○</text>
              )}
              {!tipoApertura && isPrinc && nCols > 1 && (
                <text x={cell.x + cell.w / 2} y={cell.y + cell.h / 2 + 4} textAnchor="middle" fontSize={14} fill={C_ABORD_S}>●</text>
              )}
            </g>
          )
        })}

        {/* Quote */}
        {larghezza && (
          <text x={SVG_W / 2} y={SVG_H - 1.5} textAnchor="middle" fontSize={7.5} fill={C_DIM}>{larghezza} mm</text>
        )}
        {!fuoriSquadro && altezza && (
          <text x={SVG_W - 2.5} y={SVG_H / 2} textAnchor="middle" fontSize={7.5} fill={C_DIM}
            transform={`rotate(-90,${SVG_W - 2.5},${SVG_H / 2})`}>{altezza} mm</text>
        )}
        {fuoriSquadro && altezzaSx && (
          <text x={3} y={rootQuad.tl.y + (rootQuad.bl.y - rootQuad.tl.y) / 2}
            textAnchor="middle" fontSize={6.5} fill={C_DIM}
            transform={`rotate(-90,3,${rootQuad.tl.y + (rootQuad.bl.y - rootQuad.tl.y) / 2})`}>{altezzaSx}</text>
        )}
        {fuoriSquadro && altezzaDx && (
          <text x={SVG_W - 3} y={rootQuad.tr.y + (rootQuad.br.y - rootQuad.tr.y) / 2}
            textAnchor="middle" fontSize={6.5} fill={C_DIM}
            transform={`rotate(-90,${SVG_W - 3},${rootQuad.tr.y + (rootQuad.br.y - rootQuad.tr.y) / 2})`}>{altezzaDx}</text>
        )}
      </svg>
      {(canClickAnta || canClickVano) && (
        <p className="text-[10px] text-gray-400 text-center leading-tight">Tocca un vano per selezionarlo</p>
      )}
    </div>
  )
}
