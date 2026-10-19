// Interprete dei modelli di forma di FP PRO (file Prm\MODELS\MODEL-xx.PRM): VAR/SET con
// espressioni, IF/ELSE/ENDIF, MOVETO, LINETO, LINEREL, ARCTO, RECTANGLE, CIRCLE. Le righe
// di quota e di stile (LQUOTE, LDIM, RDIM, COLOR, LINESTYLE) si ignorano. Il risultato e'
// il contorno come elenco di lati (rette e archi), cosi' come lo disegna FP PRO.
import type { Pt } from '@/types/rilievo-grafico'

export type LatoContorno =
  | { tipo: 'retta'; da: Pt; a: Pt }
  /** orario: senso di percorrenza con y verso l'alto (ARCTO ... ,-1 di FP PRO) */
  | { tipo: 'arco'; da: Pt; a: Pt; centro: Pt; orario: boolean }

// ---------- espressioni ----------

type Token = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string }

function tokenizza(s: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) { i++; continue }
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < s.length && /[0-9.eE]/.test(s[j])) j++
      out.push({ t: 'num', v: Number(s.slice(i, j)) })
      i = j
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++
      out.push({ t: 'id', v: s.slice(i, j).toUpperCase() })
      i = j
      continue
    }
    if (s.startsWith('**', i)) { out.push({ t: 'op', v: '**' }); i += 2; continue }
    if (s.startsWith('<=', i) || s.startsWith('>=', i) || s.startsWith('<>', i)) { out.push({ t: 'op', v: s.slice(i, i + 2) }); i += 2; continue }
    if ('+-*/(),<>='.includes(c)) { out.push({ t: 'op', v: c }); i++; continue }
    throw new Error(`Carattere non previsto: ${c}`)
  }
  return out
}

const GRADI = Math.PI / 180
const FUNZIONI: Record<string, (x: number) => number> = {
  COS: x => Math.cos(x * GRADI),
  SIN: x => Math.sin(x * GRADI),
  TAN: x => Math.tan(x * GRADI),
  SQRT: x => Math.sqrt(x),
  ABS: x => Math.abs(x),
}

/** Valuta un'espressione FP PRO (angoli in gradi, ** potenza, = uguale nelle condizioni) */
export function valuta(espr: string, v: Record<string, number>): number {
  const tk = tokenizza(espr)
  let p = 0
  const guarda = () => tk[p]
  const prendi = () => tk[p++]
  const op = (s: string) => guarda()?.t === 'op' && guarda().v === s

  const confronto = (): number => {
    const a = somma()
    for (const o of ['<=', '>=', '<>', '<', '>', '=']) {
      if (op(o)) {
        prendi()
        const b = somma()
        const r = o === '<=' ? a <= b : o === '>=' ? a >= b : o === '<>' ? a !== b : o === '<' ? a < b : o === '>' ? a > b : Math.abs(a - b) < 1e-9
        return r ? 1 : 0
      }
    }
    return a
  }
  const somma = (): number => {
    let a = prodotto()
    while (op('+') || op('-')) a = prendi().v === '+' ? a + prodotto() : a - prodotto()
    return a
  }
  const prodotto = (): number => {
    let a = unario()
    while (op('*') || op('/')) a = prendi().v === '*' ? a * unario() : a / unario()
    return a
  }
  const unario = (): number => {
    if (op('-')) { prendi(); return -unario() }
    if (op('+')) { prendi(); return unario() }
    return potenza()
  }
  const potenza = (): number => {
    const b = primario()
    if (op('**')) { prendi(); return b ** unario() }
    return b
  }
  const primario = (): number => {
    const t = prendi()
    if (!t) throw new Error('Espressione incompleta')
    if (t.t === 'num') return t.v
    if (t.t === 'id') {
      if (op('(') && FUNZIONI[t.v]) {
        prendi()
        const x = confronto()
        if (!op(')')) throw new Error('Manca )')
        prendi()
        return FUNZIONI[t.v](x)
      }
      return v[t.v] ?? 0
    }
    if (t.v === '(') {
      const x = confronto()
      if (!op(')')) throw new Error('Manca )')
      prendi()
      return x
    }
    throw new Error(`Simbolo non previsto: ${t.v}`)
  }
  const r = confronto()
  if (p < tk.length) throw new Error('Espressione non valida')
  return r
}

/** Divide sugli argomenti separati da virgola fuori dalle parentesi */
function argomenti(s: string): string[] {
  const out: string[] = []
  let d = 0, cur = ''
  for (const ch of s) {
    if (ch === '(') d++
    if (ch === ')') d--
    if (ch === ',' && d === 0) { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur)
  return out.map(a => a.trim()).filter(a => a !== '')
}

export interface ModelloLetto {
  /** Variabili esposte (VAR) con il valore di esempio, in ordine */
  variabili: { nome: string; valore: number }[]
  lati: LatoContorno[]
}

/**
 * Esegue lo script. `misure` sostituisce i valori di esempio delle VAR (come quando in
 * FP PRO si inseriscono le misure del modello).
 */
export function eseguiModello(script: string, misure: Record<string, number> = {}): ModelloLetto {
  const v: Record<string, number> = {}
  const variabili: { nome: string; valore: number }[] = []
  const lati: LatoContorno[] = []
  let cur: Pt = { x: 0, y: 0 }
  const pila: boolean[] = []
  const attivo = () => pila.every(Boolean)

  const righe = script.replace(/\r/g, '').split('\n').map(r => r.replace(/;.*/, '').trim()).filter(Boolean)
  for (const riga of righe) {
    const m = riga.match(/^(\w+)\s*(.*)$/)
    if (!m) continue
    const cmd = m[1].toUpperCase()
    const resto = m[2]
    if (cmd === 'IF') { pila.push(attivo() && valuta(resto, v) !== 0); continue }
    if (cmd === 'ELSE') { const prima = pila.pop() ?? false; pila.push(!prima && pila.every(Boolean)); continue }
    if (cmd === 'ENDIF') { pila.pop(); continue }
    if (!attivo()) continue

    if (cmd === 'VAR' || cmd === 'SET') {
      const k = resto.indexOf('=')
      if (k < 0) continue
      const nome = resto.slice(0, k).trim().toUpperCase()
      const esempio = valuta(resto.slice(k + 1), v)
      if (cmd === 'VAR') {
        const val = misure[nome] ?? esempio
        v[nome] = val
        if (!variabili.some(x => x.nome === nome)) variabili.push({ nome, valore: esempio })
      } else {
        v[nome] = esempio
      }
      continue
    }
    if (cmd === 'ENDVAR') continue
    const a = argomenti(resto).map(x => valuta(x, v))
    if (cmd === 'MOVETO') { cur = { x: a[0], y: a[1] }; continue }
    if (cmd === 'LINETO' || cmd === 'LINEREL') {
      const a2 = cmd === 'LINETO' ? { x: a[0], y: a[1] } : { x: cur.x + a[0], y: cur.y + a[1] }
      lati.push({ tipo: 'retta', da: cur, a: a2 })
      cur = a2
      continue
    }
    if (cmd === 'ARCTO') {
      const a2 = { x: a[0], y: a[1] }
      lati.push({ tipo: 'arco', da: cur, a: a2, centro: { x: a[2], y: a[3] }, orario: (a[4] ?? -1) < 0 })
      cur = a2
      continue
    }
    if (cmd === 'RECTANGLE') {
      const [w, h] = a
      const p = [cur, { x: cur.x + w, y: cur.y }, { x: cur.x + w, y: cur.y + h }, { x: cur.x, y: cur.y + h }]
      for (let i = 0; i < 4; i++) lati.push({ tipo: 'retta', da: p[i], a: p[(i + 1) % 4] })
      continue
    }
    if (cmd === 'CIRCLE') {
      const r = a[0]
      const sx = { x: cur.x - r, y: cur.y }, dx = { x: cur.x + r, y: cur.y }
      lati.push({ tipo: 'arco', da: sx, a: dx, centro: cur, orario: true })
      lati.push({ tipo: 'arco', da: dx, a: sx, centro: cur, orario: true })
      continue
    }
    // LQUOTE, LDIM, RDIM, COLOR, LINESTYLE...: solo grafica di FP PRO
  }
  return { variabili, lati }
}
