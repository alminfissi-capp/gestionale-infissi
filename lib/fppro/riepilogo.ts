// Testi del riepilogo del rilievo (scheda compatta a schermo e stampa A4): una funzione
// pura per voce, cosi' schermo e carta dicono la stessa cosa.
import { campiRiempimento, coloriAccessori, kitOpzionali } from './rilievo-fp'
import type { Lato, StrutturaLocale, VoceFp } from '@/types/rilievo-fp'

export interface DatiRiepilogo {
  /** L x H x quantita' in m², null se mancano le misure */
  mq: number | null
  tipo: string
  serie: string
  finituraEst: string | null
  finituraInt: string | null
  coloreAcc: string | null
  vetri: string | null
  /** Profili cambiati rispetto alla struttura (telai per lato, anta) */
  profili: string | null
  mano: string | null
  /** Accessori opzionali scelti */
  accessori: string | null
  noteTelaio: Partial<Record<Lato, string>>
  note: string | null
}

const LATI: { lato: Lato; nome: string }[] = [
  { lato: 'sinistra', nome: 'sinistro' },
  { lato: 'alto', nome: 'superiore' },
  { lato: 'destra', nome: 'destro' },
  { lato: 'basso', nome: 'inferiore' },
]

export const formatMq = (mq: number): string => mq.toFixed(2).replace('.', ',')

const pulito = (s: string | null | undefined): string | null => (s && s.trim() ? s.trim() : null)

export function datiRiepilogo(
  v: VoceFp,
  s: Pick<StrutturaLocale, 'albero' | 'nome' | 'descrizione'> | null,
): DatiRiepilogo {
  const fp = v.fp
  const mq = fp.larghezza && fp.altezza ? (fp.larghezza * fp.altezza * (v.quantita || 1)) / 1e6 : null

  const vetriScelti = Object.values(fp.vetri ?? {}).map(x => x.codice)
  const vetriStruttura = s ? campiRiempimento(s.albero).filter(c => c.tipo === 'vetro').map(c => c.codiceDefault) : []
  // I campi scelti prendono il loro vetro, gli altri restano come la struttura.
  const vetriRestanti = s
    ? campiRiempimento(s.albero).filter(c => c.tipo === 'vetro' && !fp.vetri?.[c.codice]).map(c => c.codiceDefault)
    : []
  const vetri = [...new Set(vetriScelti.length ? [...vetriScelti, ...vetriRestanti] : vetriStruttura)]

  const profili = [
    ...LATI.filter(l => fp.telai?.[l.lato]).map(l => `Telaio ${l.nome} ${fp.telai[l.lato]}`),
    ...(fp.anta ? [`Anta ${fp.anta}`] : []),
  ]

  const accessori = s
    ? kitOpzionali(s.albero).filter(k => fp.kit?.[k.chiave] ?? k.predefinito).map(k => k.descrizione || k.codice)
    : []

  const noteTelaio: Partial<Record<Lato, string>> = {}
  for (const { lato } of LATI) {
    const t = pulito(fp.noteTelaio?.[lato])
    if (t) noteTelaio[lato] = t
  }

  return {
    mq,
    tipo: pulito(s?.descrizione) ?? s?.nome ?? fp.nome,
    serie: fp.serie,
    finituraEst: fp.coloreEst?.descrizione ?? null,
    finituraInt: fp.coloreInt?.descrizione ?? null,
    coloreAcc: coloriAccessori(fp).map(c => c.descrizione).join(', ') || null,
    vetri: vetri.length ? vetri.join(', ') : null,
    profili: profili.length ? profili.join(' · ') : null,
    mano: fp.mano === 'sx' ? 'Apertura sinistra' : fp.mano === 'dx' ? 'Apertura destra' : null,
    accessori: accessori.length ? [...new Set(accessori)].join(', ') : null,
    noteTelaio,
    note: pulito(v.note),
  }
}

export type StatoPrezzo = { tipo: 'assente' } | { tipo: 'da_ricalcolare' } | { tipo: 'prezzo'; unitario: number }

/**
 * Prezzo da stampare per una voce. Un prezzo calcolato prima di una modifica della voce
 * (nel dispositivo o sul server) non si stampa: "da ricalcolare".
 */
export function statoPrezzo(
  calcolata: { unitario: number; superata: boolean } | undefined,
  voceAggiornataAt: string,
  calcolatoAt: string,
): StatoPrezzo {
  if (!calcolata) return { tipo: 'assente' }
  if (calcolata.superata || voceAggiornataAt > calcolatoAt) return { tipo: 'da_ricalcolare' }
  return { tipo: 'prezzo', unitario: calcolata.unitario }
}
