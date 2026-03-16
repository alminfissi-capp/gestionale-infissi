'use client'

import { useState, useMemo } from 'react'
import { X, Calculator, Ruler } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { FormaSerramentoDb, FormaShape } from '@/types/rilievo'
import { arcSvgPathScaled, arcSvgPathAcutoScaled } from '@/types/rilievo'
import {
  extractCampiRilievo,
  evaluaFormule,
  calcolaRaggi,
  tuttiInputCompilati,
  computeRealDimensions,
} from '@/lib/rilievo'

const TIPO_ARCO_FORMULA: Record<string, string> = {
  acuto:       'R = (L² + 4V²) / (4L)',
  tutto_sesto: 'R = (L² + 4F²) / (8F)',
  ribassato:   'R = (L² + 4F²) / (8F)',
  rialzato:    'R = (L² + 4F²) / (8F)',
  libero:      'R = (L² + 4F²) / (8F)',
}

// ── Helper: render per-segmento ───────────────────────────────────────────────

interface SegRender {
  id: string
  misuraNome: string
  sagittaNome: string
  path: string
  midX: number
  midY: number
  perpX: number  // direzione perpendicolare normalizzata (per offset label)
  perpY: number
}

/**
 * Ricostruisce le posizioni reali (in mm) di ogni punto a partire dalle misure.
 * Cammina in avanti lungo i segmenti usando normalize(direzioneGriglia) × misura.
 * Se l'ultimo punto rimane non piazzato (es. lato obliquo calcolato), viene derivato
 * a ritroso dal segmento di chiusura.
 */
function computeRealPositions(
  shape: FormaShape,
  valori: Record<string, number>
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>()
  if (shape.punti.length < 2 || shape.segmenti.length < 2) return pos

  pos.set(shape.punti[0].id, { x: 0, y: 0 })

  // Segmenti non-chiusura (tutti tranne l'ultimo per forme chiuse)
  const walkSegs = shape.chiusa ? shape.segmenti.slice(0, -1) : shape.segmenti

  for (const seg of walkSegs) {
    if (pos.has(seg.toId)) continue
    const fromPos = pos.get(seg.fromId)
    if (!fromPos) continue
    const fromPt = shape.punti.find((p) => p.id === seg.fromId)
    const toPt   = shape.punti.find((p) => p.id === seg.toId)
    if (!fromPt || !toPt) continue
    const gdx = toPt.gx - fromPt.gx
    const gdy = toPt.gy - fromPt.gy
    const glen = Math.sqrt(gdx * gdx + gdy * gdy) || 1
    const len = seg.misuraNome ? valori[seg.misuraNome] : undefined
    if (!len || len <= 0) continue
    pos.set(seg.toId, { x: fromPos.x + (gdx / glen) * len, y: fromPos.y + (gdy / glen) * len })
  }

  // Se l'ultimo punto non è stato piazzato (es. lato obliquo calcolato),
  // ricavalo a ritroso dal segmento di chiusura
  if (shape.chiusa) {
    const closingSeg = shape.segmenti[shape.segmenti.length - 1]
    if (!pos.has(closingSeg.fromId) && pos.has(closingSeg.toId)) {
      const toPos  = pos.get(closingSeg.toId)!
      const fromPt = shape.punti.find((p) => p.id === closingSeg.fromId)
      const toPt   = shape.punti.find((p) => p.id === closingSeg.toId)
      if (fromPt && toPt) {
        const gdx = toPt.gx - fromPt.gx
        const gdy = toPt.gy - fromPt.gy
        const glen = Math.sqrt(gdx * gdx + gdy * gdy) || 1
        const len = closingSeg.misuraNome ? valori[closingSeg.misuraNome] : undefined
        if (len && len > 0) {
          pos.set(closingSeg.fromId, {
            x: toPos.x - (gdx / glen) * len,
            y: toPos.y - (gdy / glen) * len,
          })
        }
      }
    }
  }

  return pos
}

function buildSegmentRenders(
  shape: FormaShape,
  valori: Record<string, number>,
  cw: number,
  ch: number
): SegRender[] {
  if (!shape.chiusa || shape.segmenti.length < 3 || shape.punti.length < 3) return []

  const pad = Math.min(cw, ch) * 0.1

  // Prova prima a usare posizioni reali dalle misure
  const realPos  = computeRealPositions(shape, valori)
  const allPlaced = shape.punti.every((p) => realPos.has(p.id))

  let getX: (id: string) => number
  let getY: (id: string) => number
  let scaleArc: number

  if (allPlaced) {
    const xs = Array.from(realPos.values()).map((p) => p.x)
    const ys = Array.from(realPos.values()).map((p) => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const rangeX = maxX - minX || 1
    const rangeY = maxY - minY || 1
    const scX = (cw - pad * 2) / rangeX
    const scY = (ch - pad * 2) / rangeY
    const sc  = Math.min(scX, scY)
    // centra la forma nel canvas
    const offX = pad + ((cw - pad * 2) - rangeX * sc) / 2
    const offY = pad + ((ch - pad * 2) - rangeY * sc) / 2
    scaleArc = sc
    getX = (id) => offX + ((realPos.get(id)?.x ?? 0) - minX) * sc
    getY = (id) => offY + ((realPos.get(id)?.y ?? 0) - minY) * sc
  } else {
    // Fallback: coordinate griglia (misure non ancora inserite)
    const gxs = shape.punti.map((p) => p.gx)
    const gys = shape.punti.map((p) => p.gy)
    const minGx = Math.min(...gxs), maxGx = Math.max(...gxs)
    const minGy = Math.min(...gys), maxGy = Math.max(...gys)
    const rangeGx = maxGx - minGx || 1
    const rangeGy = maxGy - minGy || 1
    const scX = (cw - pad * 2) / rangeGx
    const scY = (ch - pad * 2) / rangeGy
    scaleArc = Math.sqrt(scX * scY)
    getX = (id) => { const p = shape.punti.find((pt) => pt.id === id); return p ? pad + (p.gx - minGx) * scX : 0 }
    getY = (id) => { const p = shape.punti.find((pt) => pt.id === id); return p ? pad + (p.gy - minGy) * scY : 0 }
  }

  return shape.segmenti.map((seg): SegRender => {
    const from = shape.punti.find((p) => p.id === seg.fromId)
    const to   = shape.punti.find((p) => p.id === seg.toId)
    if (!from || !to) return { id: seg.id, misuraNome: seg.misuraNome, sagittaNome: seg.sagittaNome, path: '', midX: 0, midY: 0, perpX: 0, perpY: -1 }

    const fx = getX(seg.fromId), fy = getY(seg.fromId)
    const tx = getX(seg.toId),   ty = getY(seg.toId)

    const ddx = tx - fx, ddy = ty - fy
    const dlen = Math.sqrt(ddx * ddx + ddy * ddy) || 1
    const perpX = -ddy / dlen
    const perpY =  ddx / dlen

    let path: string
    let midX = (fx + tx) / 2
    let midY = (fy + ty) / 2

    if (seg.tipo === 'curva') {
      const cpx = (fx + tx) / 2 + seg.cpDx * scaleArc
      const cpy = (fy + ty) / 2 + seg.cpDy * scaleArc
      path = `M ${fx.toFixed(1)} ${fy.toFixed(1)} Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`
      midX = (fx + tx) / 2 + seg.cpDx * scaleArc * 0.4
      midY = (fy + ty) / 2 + seg.cpDy * scaleArc * 0.4
    } else if (seg.tipo === 'arco') {
      const arcPath = seg.tipoArco === 'acuto'
        ? arcSvgPathAcutoScaled(fx, fy, tx, ty, seg.cpDx, seg.cpDy, scaleArc, false)
        : arcSvgPathScaled(fx, fy, tx, ty, seg.cpDx, seg.cpDy, scaleArc, false)
      path = `M ${fx.toFixed(1)} ${fy.toFixed(1)} ${arcPath}`
      midX = (fx + tx) / 2 + seg.cpDx * scaleArc * 0.55
      midY = (fy + ty) / 2 + seg.cpDy * scaleArc * 0.55
    } else {
      path = `M ${fx.toFixed(1)} ${fy.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)}`
    }

    return { id: seg.id, misuraNome: seg.misuraNome, sagittaNome: seg.sagittaNome, path, midX, midY, perpX, perpY }
  })
}

// ── Preview SVG con highlight ─────────────────────────────────────────────────

function AnteprimeForma({
  forma,
  valoriNumerici,
  focusedNome,
}: {
  forma: FormaSerramentoDb
  valoriNumerici: Record<string, number>
  focusedNome: string | null
}) {
  // Dimensioni canvas dall'aspect ratio reale (posizioni reali o fallback computeRealDimensions)
  const MAX = 180
  const { cw, ch } = useMemo(() => {
    const realPos   = computeRealPositions(forma.shape, valoriNumerici)
    const allPlaced = forma.shape.punti.every((p) => realPos.has(p.id))
    if (allPlaced && realPos.size > 0) {
      const xs = Array.from(realPos.values()).map((p) => p.x)
      const ys = Array.from(realPos.values()).map((p) => p.y)
      const rangeX = (Math.max(...xs) - Math.min(...xs)) || 1
      const rangeY = (Math.max(...ys) - Math.min(...ys)) || 1
      const aspect = rangeX / rangeY
      return { cw: aspect >= 1 ? MAX : MAX * aspect, ch: aspect >= 1 ? MAX / aspect : MAX }
    }
    const { widthMm, heightMm } = computeRealDimensions(forma.shape, valoriNumerici)
    const aspect = widthMm / heightMm
    return { cw: aspect >= 1 ? MAX : MAX * aspect, ch: aspect >= 1 ? MAX / aspect : MAX }
  }, [forma, valoriNumerici])

  const segs = useMemo(
    () => buildSegmentRenders(forma.shape, valoriNumerici, cw, ch),
    [forma, valoriNumerici, cw, ch]
  )

  // Fill dell'intera forma (path chiuso)
  const fillPath = useMemo(() => {
    if (segs.length === 0) return null
    // concatena tutti i segmenti in un path chiuso partendo dal primo M
    let d = ''
    segs.forEach((s, i) => {
      if (!s.path) return
      if (i === 0) {
        d += s.path  // include M iniziale
      } else {
        // rimuovi "M x y " e aggiungi solo il comando di disegno
        d += ' ' + s.path.replace(/^M[\d.\s-]+/, '')
      }
    })
    return d ? d + ' Z' : null
  }, [segs])

  if (segs.length === 0) return null

  return (
    <svg
      viewBox={`0 0 ${cw.toFixed(1)} ${ch.toFixed(1)}`}
      style={{ width: '100%', maxWidth: `${MAX}px`, height: 'auto', maxHeight: `${MAX}px`, display: 'block', margin: '0 auto' }}
    >
      {/* Fill forma */}
      {fillPath && (
        <path d={fillPath} fill="#ccf2f0" stroke="none" />
      )}

      {/* Segmenti individuali */}
      {segs.map((seg) => {
        const isF = focusedNome !== null && (focusedNome === seg.misuraNome || focusedNome === seg.sagittaNome)
        return (
          <path
            key={seg.id}
            d={seg.path}
            fill="none"
            stroke={isF ? '#f59e0b' : '#0d9488'}
            strokeWidth={isF ? 3.5 : 1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      })}

      {/* Label nome misura su ogni segmento */}
      {segs.map((seg) => {
        const isF = focusedNome !== null && (focusedNome === seg.misuraNome || focusedNome === seg.sagittaNome)
        if (!seg.path) return null

        const OFFSET = Math.min(cw, ch) * 0.12
        const lx = seg.midX + seg.perpX * OFFSET
        const ly = seg.midY + seg.perpY * OFFSET
        const label = seg.misuraNome
        const charW = 5.5
        const bW = label.length * charW + 8
        const bH = 13

        return (
          <g key={`lbl-${seg.id}`}>
            <rect
              x={lx - bW / 2} y={ly - bH / 2}
              width={bW} height={bH}
              rx={3}
              fill={isF ? '#fef3c7' : 'white'}
              stroke={isF ? '#f59e0b' : '#d1d5db'}
              strokeWidth={isF ? 1 : 0.8}
              opacity={0.92}
            />
            <text
              x={lx} y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={7.5}
              fontFamily="system-ui, sans-serif"
              fontWeight={isF ? '700' : '500'}
              fill={isF ? '#92400e' : '#374151'}
            >
              {label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── DialogMisure ─────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  forma: FormaSerramentoDb | null
  onClose: () => void
  onConferma: (forma: FormaSerramentoDb, valori: Record<string, number>, note: string, nomeVano: string) => void
}

export default function DialogMisure({ open, forma, onClose, onConferma }: Props) {
  const [inputValori,  setInputValori]  = useState<Record<string, string>>({})
  const [note,         setNote]         = useState('')
  const [nomeVano,     setNomeVano]     = useState('')
  const [focusedNome,  setFocusedNome]  = useState<string | null>(null)

  const campi = useMemo(
    () => (forma ? extractCampiRilievo(forma.shape) : []),
    [forma]
  )

  const valoriNumerici = useMemo<Record<string, number>>(() => {
    const parsed: Record<string, number> = {}
    for (const [k, v] of Object.entries(inputValori)) {
      const n = parseFloat(v)
      if (!isNaN(n) && n > 0) parsed[k] = n
    }
    return forma ? evaluaFormule(forma.shape, parsed) : parsed
  }, [inputValori, forma])

  const raggi = useMemo(
    () => (forma ? calcolaRaggi(forma.shape, valoriNumerici) : []),
    [forma, valoriNumerici]
  )

  const isCompleto = useMemo(
    () => forma ? tuttiInputCompilati(forma.shape, valoriNumerici) : false,
    [forma, valoriNumerici]
  )

  if (!open || !forma) return null

  const handleConferma = () => {
    if (!isCompleto) return
    onConferma(forma, valoriNumerici, note, nomeVano)
    // reset
    setInputValori({})
    setNote('')
    setNomeVano('')
  }

  const campiInput     = campi.filter((c) => c.tipoMisura === 'input')
  const campiCalcolati = campi.filter((c) => c.tipoMisura === 'calcolato')

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-xl max-h-[96vh] flex flex-col sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg sm:rounded-2xl sm:max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b shrink-0">
          <div>
            <p className="text-base font-semibold text-gray-900">Inserisci misure</p>
            <p className="text-xs text-gray-500 mt-0.5">{forma.nome}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body a due colonne su schermi larghi */}
        <div className="overflow-y-auto flex-1">
          <div className="sm:flex sm:gap-0 sm:divide-x">

            {/* Colonna sinistra: preview SVG */}
            <div className="shrink-0 flex flex-col items-center justify-center px-5 py-5 sm:w-52 sm:sticky sm:top-0 sm:self-start">
              <AnteprimeForma
                forma={forma}
                valoriNumerici={valoriNumerici}
                focusedNome={focusedNome}
              />
              {focusedNome && (
                <p className="mt-2 text-[11px] text-amber-600 font-medium text-center">
                  ← {focusedNome}
                </p>
              )}
              {!focusedNome && (
                <p className="mt-2 text-[10px] text-gray-400 text-center leading-tight">
                  Tocca un campo per<br />vedere il lato evidenziato
                </p>
              )}
            </div>

            {/* Colonna destra: form */}
            <div className="flex-1 px-5 py-4 space-y-5">

              {/* Nome vano */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Descrizione vano <span className="text-gray-400 font-normal">(opzionale)</span>
                </label>
                <input
                  type="text"
                  value={nomeVano}
                  onChange={(e) => setNomeVano(e.target.value)}
                  placeholder="es. Camera letto – finestra sx"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Nessun campo configurato */}
              {campi.length === 0 && (
                <div className="text-center py-6 text-gray-400 text-sm">
                  <Ruler className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>Nessuna misura configurata per questa forma.</p>
                  <p className="text-xs mt-1">Apri le impostazioni e configura le misure dei lati.</p>
                </div>
              )}

              {/* Campi input */}
              {campiInput.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Ruler className="h-4 w-4 text-teal-600 shrink-0" />
                    <p className="text-sm font-semibold text-gray-800">Da rilevare</p>
                  </div>
                  {campiInput.map((campo) => {
                    const val = inputValori[campo.nome] ?? ''
                    const isEmpty = val === ''
                    const isFocused = focusedNome === campo.nome
                    return (
                      <div key={`${campo.segmentoId}-${campo.tipo}`}>
                        <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-1">
                          {/* Pallino colorato identificativo */}
                          <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${isFocused ? 'bg-amber-400' : 'bg-teal-400'}`} />
                          {campo.nome}
                          {campo.tipo === 'freccia' && (
                            <span className="ml-1 text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full">
                              {campo.tipoArco === 'acuto' ? 'altezza vertice' : 'freccia arco'}
                            </span>
                          )}
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            inputMode="decimal"
                            value={val}
                            onChange={(e) =>
                              setInputValori((prev) => ({ ...prev, [campo.nome]: e.target.value }))
                            }
                            onFocus={() => setFocusedNome(campo.nome)}
                            onBlur={() => setFocusedNome(null)}
                            placeholder="0"
                            min={0}
                            className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors ${
                              isFocused
                                ? 'border-amber-400 ring-2 ring-amber-200 bg-amber-50/40'
                                : isEmpty
                                  ? 'border-gray-300 focus:ring-teal-500'
                                  : 'border-teal-400 bg-teal-50/30 focus:ring-teal-500'
                            }`}
                          />
                          <span className="text-xs text-gray-400 w-8">mm</span>
                        </div>
                        {campo.tipo === 'freccia' && campo.tipoArco && (
                          <p className="text-[10px] text-orange-600 mt-0.5 ml-0.5">
                            {TIPO_ARCO_FORMULA[campo.tipoArco]}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Valori calcolati */}
              {campiCalcolati.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-blue-600 shrink-0" />
                    <p className="text-sm font-semibold text-gray-800">Calcolati automaticamente</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl border border-blue-100 divide-y divide-blue-100">
                    {campiCalcolati.map((campo) => {
                      const val = valoriNumerici[campo.nome]
                      return (
                        <div key={`${campo.segmentoId}-${campo.tipo}`} className="flex items-center justify-between px-3 py-2">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{campo.nome}</p>
                            <p className="text-[10px] text-blue-500 font-mono">{campo.formula}</p>
                          </div>
                          <span className={`text-sm font-semibold ${val !== undefined ? 'text-blue-700' : 'text-gray-300'}`}>
                            {val !== undefined ? `${val} mm` : '—'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Raggi archi */}
              {raggi.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-orange-500" />
                    Raggi archi
                  </p>
                  <div className="bg-orange-50 rounded-xl border border-orange-100 divide-y divide-orange-100">
                    {raggi.map((r) => (
                      <div key={r.segmentoId} className="px-3 py-2.5">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-800">
                              R — {r.nomeCorda}
                              {r.tipoArco === 'acuto' && (
                                <span className="ml-1.5 text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">gotico</span>
                              )}
                            </p>
                            <p className="text-[10px] text-orange-600">
                              L={r.corda} · {r.tipoArco === 'acuto' ? 'V' : 'F'}={r.freccia} mm
                            </p>
                          </div>
                          <span className="text-base font-bold text-orange-700">{r.R} mm</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Note */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Note <span className="text-gray-400 font-normal">(opzionale)</span>
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="es. Finestra con anta rotta, rilevare con cautela"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t px-5 py-3 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button
            onClick={handleConferma}
            disabled={campi.length > 0 && !isCompleto}
            title={!isCompleto ? 'Compila tutte le misure da rilevare' : ''}
          >
            Aggiungi vano
          </Button>
        </div>
      </div>
    </>
  )
}
