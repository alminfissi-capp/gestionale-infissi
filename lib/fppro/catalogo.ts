// Regole della pagina Catalogo FP PRO (solo app: il ponte non lo usa).
import type { RigaCatalogo } from '@/types/fppro'

const euro = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const decimali = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 3 })

export function formatoEuro(n: number): string {
  return euro.format(n)
}

/** Toglie i caratteri speciali di PostgREST (`, ( )`) e i jolly di ILIKE (`% _ *`). */
export function pulisciRicerca(s: string): string {
  return s.replace(/[,()%_*\\]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** In FP PRO il prezzo dell'accessorio vale per `unita_vendita` pezzi (432 EUR ogni 400). */
export function prezzoUnitarioAccessorio(prezzo: number | null, unitaVendita: number | null): number | null {
  if (prezzo === null || prezzo <= 0) return null
  return unitaVendita && unitaVendita > 0 ? prezzo / unitaVendita : prezzo
}

export function rigaProfilo(
  p: { id: string; codice: string; descrizione: string | null; kg_ml: number | null; serie_fp_id: number | null },
  serie: string | null,
  costi: { costo_kg: number | null; costo_ml: number | null }[],
): RigaCatalogo {
  const kg = costi.map(c => c.costo_kg ?? 0).filter(v => v > 0)
  const ml = costi.map(c => c.costo_ml ?? 0).filter(v => v > 0)
  const intervallo = (valori: number[], unita: string) => {
    const min = Math.min(...valori)
    const max = Math.max(...valori)
    const testo = min === max ? formatoEuro(min) : `${formatoEuro(min)} – ${formatoEuro(max)}`
    return `${testo} €/${unita} (${valori.length} ${valori.length === 1 ? 'colore' : 'colori'})`
  }
  const prezzo = kg.length > 0 ? intervallo(kg, 'kg') : ml.length > 0 ? intervallo(ml, 'm') : 'manca'
  return {
    id: p.id,
    codice: p.codice,
    descrizione: p.descrizione ?? '',
    serie: serie ?? '—',
    dettaglio: p.kg_ml ? `${decimali.format(p.kg_ml)} kg/m` : '',
    prezzo,
    senzaPrezzo: prezzo === 'manca',
  }
}

export function rigaAccessorio(
  a: { id: string; codice: string; descrizione: string | null; serie: string | null; prezzo: number | null; unita_vendita: number | null },
): RigaCatalogo {
  const unitario = prezzoUnitarioAccessorio(a.prezzo, a.unita_vendita)
  const confezione = a.prezzo && a.prezzo > 0 && a.unita_vendita && a.unita_vendita > 1
    ? `${formatoEuro(a.prezzo)} € ogni ${decimali.format(a.unita_vendita)} pz`
    : ''
  return {
    id: a.id,
    codice: a.codice,
    descrizione: a.descrizione ?? '',
    serie: a.serie ?? '—',
    dettaglio: confezione,
    prezzo: unitario === null ? 'manca' : `${formatoEuro(unitario)} € al pezzo`,
    senzaPrezzo: unitario === null,
  }
}

export function rigaVetro(
  v: { id: string; codice: string; descrizione: string | null; prezzo_mq: number | null; min_fatt: number | null; spessore: number | null },
): RigaCatalogo {
  const parti = [
    v.spessore ? `sp. ${decimali.format(v.spessore)} mm` : null,
    v.min_fatt ? `min. ${decimali.format(v.min_fatt)} m²` : null,
  ].filter(Boolean)
  const ha = v.prezzo_mq !== null && v.prezzo_mq > 0
  return {
    id: v.id,
    codice: v.codice,
    descrizione: v.descrizione ?? '',
    serie: '',
    dettaglio: parti.join(' · '),
    prezzo: ha ? `${formatoEuro(v.prezzo_mq as number)} €/m²` : 'manca',
    senzaPrezzo: !ha,
  }
}

export function rigaColore(
  c: { id: string; descrizione: string; costo_kg: number | null; per_profili: boolean; per_accessori: boolean; per_vetri: boolean },
): RigaCatalogo {
  const usi = [c.per_profili && 'profili', c.per_accessori && 'accessori', c.per_vetri && 'vetri'].filter(Boolean)
  return {
    id: c.id,
    codice: '',
    descrizione: c.descrizione,
    serie: '',
    dettaglio: usi.join(', '),
    prezzo: c.costo_kg && c.costo_kg > 0 ? `+${formatoEuro(c.costo_kg)} €/kg` : '',
    senzaPrezzo: false,
  }
}
