// Fissaggi dei profili come FP PRO (squadrette, cavallotti): per ogni profilo, gli accessori
// dei filtri (sistemi di giunzione) della sua serie con l'ordine piu' basso. Verificato sulla
// commessa 183-26G: PLANET 62 = ACP 5008 + 5801M + 50153 su ogni pezzo, 50110 sulle ante.
import type { FissaggioProfilo } from './accessori'

export interface RigaFissaggio {
  codice_profilo: string | null
  codice_accessorio: string | null
  serie_fp_id: number | null
  quantita: number | string | null
  dim_rif: number | null
  filtro: string | null
}
export interface RigaSerieFissaggio { serie_fp_id: number | null; ordine: number | null; filtro: string | null }

export function fissaggiPredefiniti(righe: RigaFissaggio[], serie: RigaSerieFissaggio[]): (codiceProfilo: string) => FissaggioProfilo[] {
  const ordine = new Map<string, number>()
  for (const s of serie) if (s.serie_fp_id !== null && s.filtro) ordine.set(`${s.serie_fp_id}|${s.filtro}`, Number(s.ordine ?? 99))
  // Ordine piu' basso fra i filtri che il profilo ha davvero.
  const minimo = new Map<string, number>()
  for (const r of righe) {
    const o = ordine.get(`${r.serie_fp_id}|${r.filtro}`)
    if (o === undefined || !r.codice_profilo) continue
    minimo.set(r.codice_profilo, Math.min(minimo.get(r.codice_profilo) ?? Infinity, o))
  }
  const perProfilo = new Map<string, FissaggioProfilo[]>()
  const visti = new Set<string>()
  for (const r of righe) {
    if (!r.codice_profilo || !r.codice_accessorio) continue
    if (ordine.get(`${r.serie_fp_id}|${r.filtro}`) !== minimo.get(r.codice_profilo)) continue
    const chiave = `${r.codice_profilo}|${r.codice_accessorio}|${r.filtro}`
    if (visti.has(chiave)) continue
    visti.add(chiave)
    const l = perProfilo.get(r.codice_profilo) ?? []
    l.push({ codice: r.codice_accessorio, quantita: Number(r.quantita ?? 0), dimRif: Number(r.dim_rif ?? 0) })
    perProfilo.set(r.codice_profilo, l)
  }
  return codice => perProfilo.get(codice) ?? []
}
