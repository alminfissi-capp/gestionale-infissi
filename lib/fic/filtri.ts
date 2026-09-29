import type { FatturaFornitore, StatoPagamento } from '@/types/fatture-fornitori'
import { statoPagamento } from '@/lib/fic/stato-pagamento'

export type FiltroStato = StatoPagamento | 'tutte'

export function filtraFatture(
  fatture: FatturaFornitore[],
  ricerca: string,
  stato: FiltroStato,
  oggi: string,
): FatturaFornitore[] {
  const q = ricerca.trim().toLowerCase()
  return fatture.filter((f) => {
    if (q && !f.fornitore_nome.toLowerCase().includes(q) && !(f.numero ?? '').toLowerCase().includes(q)) return false
    if (stato !== 'tutte' && statoPagamento(f.rate, oggi) !== stato) return false
    return true
  })
}

const cent = (v: number) => Math.round(v * 100) / 100

export function totaliFatture(fatture: FatturaFornitore[]): { netto: number; iva: number; lordo: number } {
  const t = fatture.reduce(
    (acc, f) => ({ netto: acc.netto + f.importo_netto, iva: acc.iva + f.importo_iva, lordo: acc.lordo + f.importo_lordo }),
    { netto: 0, iva: 0, lordo: 0 },
  )
  return { netto: cent(t.netto), iva: cent(t.iva), lordo: cent(t.lordo) }
}
