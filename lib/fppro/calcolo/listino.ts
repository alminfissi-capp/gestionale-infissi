// Listino del calcolo costruito dalle righe delle tabelle fp_* (lette da actions/calcolo-fp.ts).
import type { SezioneProfilo } from '../dxf-sezione'
import type { ListinoCalcolo, ProfiloListino } from './voce'
import { prezzoAccessorio, type CostoAccessorio, type RigaAccessorio } from './prezzo-accessorio'

export interface RigheListino {
  profili: { fp_id: number; codice: string; kg_ml: number | null; costo_kg: number | null; costo_ml: number | null }[]
  /** costo_profili di FP PRO: prezzo per profilo e trattamento (colore) */
  costi: { profilo_fp_id: number; colore_fp_id: number; costo_kg: number | null; costo_ml: number | null }[]
  barre: { profilo_fp_id: number; lunghezza: number | null }[]
  scarti: { codice: string; testa: number | null; coda: number | null }[]
  componenti: { composto_fp_id: number; componente_fp_id: number; principale: boolean | null; offset_mm: number | null }[]
  sezioni: { codice: string; vista: number | null; aletta: number | null }[]
  accessori: RigaAccessorio[]
  /** costi per trattamento (colore accessori) di FP PRO: vincono sul prezzo generale */
  costiAccessori?: CostoAccessorio[]
  vetri: { codice: string; prezzo_mq: number | null; min_fatt: number | null; kg_mq: number | null }[]
  pannelli: { codice: string; prezzo_mq: number | null; min_fatt: number | null }[]
}

/** Barra e scarti usati quando FP PRO non li indica */
export const BARRA_PREDEFINITA = 6500
export const SCARTO_PREDEFINITO = 30

const n = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? 0 : Number(v))
const chiave = (s: string) => s.trim().toUpperCase()
const positivo = (v: number | null | undefined) => (n(v) > 0 ? n(v) : null)

export function listinoDaRighe(
  r: RigheListino,
  colore: { fpId: number; tolleranzaPeso: number } | null,
  /** Colori accessori della voce, in ordine di preferenza */
  coloriAcc: { fpId: number; descrizione: string }[] = [],
): ListinoCalcolo {
  const perCodice = new Map<string, RigheListino['profili'][number]>()
  for (const p of r.profili) if (!perCodice.has(chiave(p.codice))) perCodice.set(chiave(p.codice), p)
  const perId = new Map(r.profili.map(p => [p.fp_id, p]))
  const costi = new Map<number, RigheListino['costi']>()
  for (const c of r.costi) costi.set(c.profilo_fp_id, [...(costi.get(c.profilo_fp_id) ?? []), c])
  const barre = new Map<number, number>()
  for (const b of r.barre) barre.set(b.profilo_fp_id, Math.max(barre.get(b.profilo_fp_id) ?? 0, n(b.lunghezza)))
  const scarti = new Map(r.scarti.map(s => [chiave(s.codice), s]))
  const sezioni = new Map(r.sezioni.map(s => [chiave(s.codice), s]))
  const vetri = new Map(r.vetri.map(v => [chiave(v.codice), v]))
  const pannelli = new Map(r.pannelli.map(p => [chiave(p.codice), p]))

  const prezzo = (p: RigheListino['profili'][number]): { euroKg: number | null; euroMl: number | null; colorato: boolean } => {
    const righe = costi.get(p.fp_id) ?? []
    const delColore = colore ? righe.find(c => c.colore_fp_id === colore.fpId) : undefined
    if (delColore) return { euroKg: positivo(delColore.costo_kg), euroMl: positivo(delColore.costo_ml), colorato: true }
    if (positivo(p.costo_kg) || positivo(p.costo_ml)) return { euroKg: positivo(p.costo_kg), euroMl: positivo(p.costo_ml), colorato: false }
    // Un solo trattamento (es. guarnizioni in EPDM nero): vale per ogni colore.
    const trattamenti = new Set(righe.map(c => c.colore_fp_id))
    if (trattamenti.size === 1) return { euroKg: positivo(righe[0].costo_kg), euroMl: positivo(righe[0].costo_ml), colorato: false }
    return { euroKg: null, euroMl: null, colorato: false }
  }

  return {
    profilo(codice): ProfiloListino | null {
      const p = perCodice.get(chiave(codice))
      if (!p) return null
      const { euroKg, euroMl, colorato } = prezzo(p)
      const scarto = scarti.get(chiave(codice))
      return {
        kgMl: n(p.kg_ml),
        euroKg,
        euroMl,
        fattorePeso: colorato && colore ? 1 + colore.tolleranzaPeso : 1,
        barra: barre.get(p.fp_id) || BARRA_PREDEFINITA,
        testa: scarto?.testa ?? SCARTO_PREDEFINITO,
        coda: scarto?.coda ?? SCARTO_PREDEFINITO,
        componenti: r.componenti
          .filter(c => c.composto_fp_id === p.fp_id)
          .flatMap(c => {
            const comp = perId.get(c.componente_fp_id)
            return comp ? [{ codice: comp.codice, principale: c.principale === true, offset: n(c.offset_mm) }] : []
          }),
      }
    },
    accessorio(codice, serie) {
      const tutti = r.accessori.filter(a => chiave(a.codice) === chiave(codice))
      return prezzoAccessorio(tutti, r.costiAccessori ?? [], serie, coloriAcc.map(c => c.fpId), coloriAcc.map(c => c.descrizione))
    },
    vetro(codice) {
      const v = vetri.get(chiave(codice))
      return v ? { euroMq: n(v.prezzo_mq), minFatt: n(v.min_fatt), kgMq: n(v.kg_mq) } : null
    },
    pannello(codice) {
      const p = pannelli.get(chiave(codice))
      return p ? { euroMq: n(p.prezzo_mq), minFatt: n(p.min_fatt) } : null
    },
    sezione(codice): SezioneProfilo | null {
      const s = sezioni.get(chiave(codice))
      return s && n(s.vista) > 0 ? { vista: n(s.vista), aletta: n(s.aletta) } : null
    },
  }
}
