// Testi della scheda compatta (riepilogo) di una voce disegnata: stessi campi della voce FP PRO.
import type { VoceDisegnata } from '@/types/rilievo-fp'
import { formaInPunti } from './forma'
import { calcolaDisegno } from './geometria'
import { disegnoDellaVoce } from '@/lib/rilievo-unico'

export interface DatiRiepilogoDisegnata {
  /** Ingombro (rettangolo che contiene la forma) x quantita', in m² */
  mq: number
  larghezza: number
  altezza: number
  tipo: string
  serie: string | null
  finituraEst: string | null
  finituraInt: string | null
  coloreAcc: string | null
  accessori: string | null
  note: string | null
}

const testo = (t: string | null | undefined) => (t && t.trim() ? t.trim() : null)

export function datiRiepilogoDisegnata(v: VoceDisegnata, nomiSerie: Map<number, string>): DatiRiepilogoDisegnata {
  const calc = calcolaDisegno(disegnoDellaVoce(v))
  const larghezza = Math.round(calc.larghezza), altezza = Math.round(calc.altezza)
  const punti = formaInPunti(v.grafico.forma)
  const conArco = punti.some(p => p.freccia)
  const g = v.grafico
  const serie = g.serie.map(id => nomiSerie.get(id)).filter((x): x is string => !!x)
  const accessori = (g.accessoriAggiunti ?? []).filter(a => a.quantita > 0)
    .map(a => `${a.quantita > 1 ? `${a.quantita} x ` : ''}${a.descrizione || a.codice}`)
  return {
    mq: (larghezza * altezza * (v.quantita || 1)) / 1e6,
    larghezza,
    altezza,
    tipo: `Voce disegnata · ${punti.length} lati${conArco ? ' con arco' : ''}`,
    serie: serie.length ? serie.join(', ') : null,
    finituraInt: testo(g.coloreInt?.descrizione),
    finituraEst: testo(g.coloreEst?.descrizione),
    coloreAcc: g.coloriAcc?.length ? g.coloriAcc.map(c => c.descrizione).join(' / ') : null,
    accessori: accessori.length ? accessori.join(', ') : null,
    note: testo(v.note),
  }
}
