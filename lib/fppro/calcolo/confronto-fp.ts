// Confronto fra gli accessori calcolati da WinStudio e quelli di una commessa di FP PRO
// (banco di prova: ponte/strumenti/banco-prova.ts). Senza import: lo esegue anche il ponte.

export interface RigaQuantita { codice: string; quantita: number }

export interface ConfrontoAccessori {
  inPiu: RigaQuantita[]
  mancanti: RigaQuantita[]
  diverse: { codice: string; winstudio: number; fp: number }[]
}

const TOLLERANZA = 0.01

function somme(righe: RigaQuantita[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of righe) {
    // "_AVVISO1" e simili sono messaggi di FP PRO, non prodotti.
    if (r.codice.startsWith('_')) continue
    m.set(r.codice, (m.get(r.codice) ?? 0) + r.quantita)
  }
  return m
}

const tondo = (v: number) => Math.round(v * 10000) / 10000

export function confrontaAccessori(winstudio: RigaQuantita[], fp: RigaQuantita[]): ConfrontoAccessori {
  const w = somme(winstudio)
  const f = somme(fp)
  const out: ConfrontoAccessori = { inPiu: [], mancanti: [], diverse: [] }
  for (const [codice, q] of w) {
    const atteso = f.get(codice)
    if (atteso === undefined) out.inPiu.push({ codice, quantita: tondo(q) })
    else if (Math.abs(q - atteso) > TOLLERANZA) out.diverse.push({ codice, winstudio: tondo(q), fp: tondo(atteso) })
  }
  for (const [codice, q] of f) if (!w.has(codice)) out.mancanti.push({ codice, quantita: tondo(q) })
  return out
}
