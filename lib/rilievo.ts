/**
 * lib/rilievo.ts
 * Logica pura per il rilievo misure serramenti.
 *
 * Una FormaShape è un TEMPLATE che descrive:
 *   - la geometria del serramento (punti, segmenti, archi)
 *   - i NOMI delle misure da rilevare (misuraNome, sagittaNome)
 *   - le FORMULE per i valori derivati (misuraFormula, sagittaFormula)
 *   - gli angoli (fisso → valore noto; automatico → calcolato dalle misure)
 *
 * Questo modulo trasforma il template in:
 *   - lista campi da mostrare all'operatore (input / calcolato)
 *   - valori numerici calcolati a partire dalle misure inserite
 *   - raggi archi calcolati con le formule geometriche corrette
 */

import type { FormaShape, TipoArco } from '@/types/rilievo'
import { arcRadius, arcRadiusSpezzato } from '@/types/rilievo'

// ============================================================
// Tipi
// ============================================================

/** Un campo misura estratto dalla FormaShape (template) */
export interface CampoRilievo {
  /** ID del segmento sorgente */
  segmentoId: string
  /** 'misura' = lato/corda del segmento; 'freccia' = sagitta/vertice arco */
  tipo: 'misura' | 'freccia'
  /** Etichetta visualizzata all'operatore (es. "Larghezza", "Freccia") */
  nome: string
  /** 'input' = da misurare sul campo; 'calcolato' = derivato da formula */
  tipoMisura: 'input' | 'calcolato'
  /** Formula es. "Larghezza / 2" — valida solo se tipoMisura='calcolato' */
  formula: string
  /** Tipo arco — solo per tipo='freccia', usato per mostrare hint formula */
  tipoArco?: TipoArco
}

/** Raggio arco calcolato dalle misure rilevate */
export interface RaggioCalcolato {
  segmentoId: string
  nomeCorda: string
  nomeFreccia: string
  corda: number
  freccia: number
  /** Raggio in mm (stessa unità delle misure inserite) */
  R: number
  tipoArco: TipoArco
}

/** Misure di un singolo vano/serramento rilevato */
export interface VanoMisurato {
  id: string
  /** Nome descrittivo (es. "Camera letto – finestra sx") */
  nome: string
  forma: import('@/types/rilievo').FormaSerramentoDb
  /** Mappa nome_misura → valore in mm (o cm, coerente con quanto inserito) */
  valori: Record<string, number>
  note: string
}

// ============================================================
// extractCampiRilievo
// ============================================================

/**
 * Estrae in ordine tutti i campi (lato + freccia arco) da una FormaShape chiusa.
 * Campi con lo stesso nome vengono de-duplicati (stesso nome = stesso valore).
 */
export function extractCampiRilievo(shape: FormaShape): CampoRilievo[] {
  if (!shape.chiusa) return []
  const campi: CampoRilievo[] = []
  const seen = new Set<string>()

  for (const seg of shape.segmenti) {
    // Campo misura (lato/corda)
    if (seg.misuraNome) {
      const key = `m:${seg.misuraNome}`
      if (!seen.has(key)) {
        seen.add(key)
        campi.push({
          segmentoId: seg.id,
          tipo: 'misura',
          nome: seg.misuraNome,
          tipoMisura: seg.misuraTipo,
          formula: seg.misuraFormula ?? '',
        })
      }
    }
    // Campo freccia/vertice (solo per archi)
    if (seg.tipo === 'arco' && seg.sagittaNome) {
      const key = `f:${seg.sagittaNome}`
      if (!seen.has(key)) {
        seen.add(key)
        campi.push({
          segmentoId: seg.id,
          tipo: 'freccia',
          nome: seg.sagittaNome,
          tipoMisura: seg.sagittaTipo,
          formula: seg.sagittaFormula ?? '',
          tipoArco: seg.tipoArco,
        })
      }
    }
  }
  return campi
}

// ============================================================
// Formula evaluator
// ============================================================

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Valuta una formula testuale sostituendo i nomi-variabile con valori numerici.
 * Operatori supportati: + - * / ( ) numeri decimali, sqrt(...).
 * Restituisce null se la formula è vuota, ha variabili mancanti o sintassi errata.
 */
export function evaluaFormula(formula: string, valori: Record<string, number>): number | null {
  if (!formula.trim()) return null
  try {
    // Sostituisci i nomi più lunghi prima (evita match parziali su sottostringa)
    const sortedNames = Object.keys(valori).sort((a, b) => b.length - a.length)
    let expr = formula
    for (const nome of sortedNames) {
      const val = valori[nome]
      if (val === undefined || val === null || !isFinite(val)) return null
      expr = expr.replace(new RegExp(`\\b${escapeRegex(nome)}\\b`, 'g'), String(val))
    }
    // Supporto sqrt: sostituisci con token sicuro, verifica, ripristina
    expr = expr.replace(/\bsqrt\s*\(/g, '\x01(')
    // Safety: solo caratteri aritmetici + token sqrt
    if (/[^0-9+\-*/().\s\x01]/.test(expr)) return null
    expr = expr.replace(/\x01\(/g, 'Math.sqrt(')
    const result = new Function(`"use strict"; return (${expr})`)()
    return typeof result === 'number' && isFinite(result) && result >= 0
      ? Math.round(result * 10) / 10
      : null
  } catch {
    return null
  }
}

// ============================================================
// evaluaFormule
// ============================================================

/**
 * Dato il set di valori inseriti dall'operatore (inputValori),
 * calcola tutti i campi con tipoMisura='calcolato' usando le loro formule.
 * Usa fino a 5 passate per gestire dipendenze a catena (A dipende da B da C).
 *
 * Restituisce un map nome → valore con TUTTI i valori (input + calcolati).
 */
export function evaluaFormule(
  shape: FormaShape,
  inputValori: Record<string, number>
): Record<string, number> {
  const tutti = { ...inputValori }
  const calcolati = extractCampiRilievo(shape).filter((c) => c.tipoMisura === 'calcolato')

  for (let pass = 0; pass < 5; pass++) {
    let changed = false
    for (const campo of calcolati) {
      if (campo.formula && !(campo.nome in tutti)) {
        const val = evaluaFormula(campo.formula, tutti)
        if (val !== null) {
          tutti[campo.nome] = val
          changed = true
        }
      }
    }
    if (!changed) break
  }
  return tutti
}

// ============================================================
// calcolaRaggi
// ============================================================

/**
 * Per ogni segmento arco con corda e freccia disponibili nei valori,
 * calcola il raggio R usando la formula corretta per il tipo di arco.
 *
 * - archi singoli (tutto sesto, ribassato, rialzato, libero):
 *     R = (L² + 4F²) / (8F)
 * - arco acuto/gotico:
 *     R = (L² + 4V²) / (4L)
 */
export function calcolaRaggi(
  shape: FormaShape,
  valori: Record<string, number>
): RaggioCalcolato[] {
  const risultati: RaggioCalcolato[] = []
  const seen = new Set<string>()

  for (const seg of shape.segmenti) {
    if (seg.tipo !== 'arco') continue
    if (!seg.misuraNome || !seg.sagittaNome) continue

    const chiave = `${seg.misuraNome}|${seg.sagittaNome}`
    if (seen.has(chiave)) continue
    seen.add(chiave)

    const corda = valori[seg.misuraNome]
    const freccia = valori[seg.sagittaNome]
    if (!corda || !freccia || corda <= 0 || freccia <= 0) continue

    const R = seg.tipoArco === 'acuto'
      ? arcRadiusSpezzato(corda, freccia)
      : arcRadius(corda, freccia)

    risultati.push({
      segmentoId: seg.id,
      nomeCorda: seg.misuraNome,
      nomeFreccia: seg.sagittaNome,
      corda,
      freccia,
      R: Math.round(R * 10) / 10,
      tipoArco: seg.tipoArco ?? 'libero',
    })
  }
  return risultati
}

// ============================================================
// Helpers riepilogo
// ============================================================

// ============================================================
// computeRealDimensions
// ============================================================

/**
 * Stima le dimensioni reali (mm) del vano analizzando i segmenti della forma.
 * I segmenti più orizzontali (|dgx| ≥ |dgy|) contribuiscono alla larghezza,
 * quelli più verticali (|dgy| > |dgx|) all'altezza.
 * Vengono de-duplicati per nome misura.
 */
export function computeRealDimensions(
  shape: FormaShape,
  valori: Record<string, number>
): { widthMm: number; heightMm: number } {
  const seenH = new Set<string>()
  const seenV = new Set<string>()
  let widthMm = 0
  let heightMm = 0

  for (const seg of shape.segmenti) {
    const from = shape.punti.find((p) => p.id === seg.fromId)
    const to = shape.punti.find((p) => p.id === seg.toId)
    if (!from || !to || !seg.misuraNome) continue

    const dgx = Math.abs(to.gx - from.gx)
    const dgy = Math.abs(to.gy - from.gy)
    const val = valori[seg.misuraNome] ?? 0
    if (val <= 0) continue

    if (dgx >= dgy) {
      // segmento orizzontale → contribuisce alla larghezza
      if (!seenH.has(seg.misuraNome)) {
        seenH.add(seg.misuraNome)
        widthMm = Math.max(widthMm, val)
      }
    } else {
      // segmento verticale → contribuisce all'altezza
      if (!seenV.has(seg.misuraNome)) {
        seenV.add(seg.misuraNome)
        heightMm = Math.max(heightMm, val)
      }
    }
  }

  return {
    widthMm: widthMm || 1000,
    heightMm: heightMm || 1000,
  }
}

// ============================================================
// Helpers riepilogo
// ============================================================

/**
 * Ricostruisce le posizioni reali (in mm) di ogni punto a partire dalle misure inserite.
 * Cammina in avanti lungo i segmenti usando normalize(direzioneGriglia) × misura.
 * Se l'ultimo punto rimane non piazzato (es. lato obliquo calcolato), viene ricavato
 * a ritroso dal segmento di chiusura.
 */
export function computeRealPositions(
  shape: FormaShape,
  valori: Record<string, number>
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>()
  if (shape.punti.length < 2 || shape.segmenti.length < 2) return pos

  pos.set(shape.punti[0].id, { x: 0, y: 0 })

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

/** Restituisce true se tutti i campi 'input' sono stati compilati */
export function tuttiInputCompilati(
  shape: FormaShape,
  valori: Record<string, number>
): boolean {
  const campi = extractCampiRilievo(shape)
  return campi
    .filter((c) => c.tipoMisura === 'input')
    .every((c) => c.nome in valori && isFinite(valori[c.nome]) && valori[c.nome] > 0)
}
