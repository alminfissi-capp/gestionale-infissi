// Testi del riepilogo del rilievo (scheda compatta a schermo e stampa A4): una funzione
// pura per voce, cosi' schermo e carta dicono la stessa cosa.
import { accessoriOpzionaliScelti, campiRiempimento, coloriAccessori, kitOpzionali } from './rilievo-fp'
import type { Lato, StrutturaLocale, VoceFp } from '@/types/rilievo-fp'
import type { ClienteSnapshotRilievo } from '@/types/rilievo-veloce'

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

/** Telai cambiati, raggruppando i lati con lo stesso profilo: "Telaio sinistro/destro TT1642B" */
function telaiRaggruppati(telai: Partial<Record<Lato, string>> | undefined): string[] {
  const perCodice = new Map<string, string[]>()
  for (const l of LATI) {
    const codice = telai?.[l.lato]
    if (codice) perCodice.set(codice, [...(perCodice.get(codice) ?? []), l.nome])
  }
  return [...perCodice].map(([codice, lati]) =>
    lati.length === LATI.length ? `Telaio ${codice}` : `Telaio ${lati.join('/')} ${codice}`)
}

/**
 * Nome del PDF del riepilogo ("Marcello Zamueli_RILIEVO MISURE"): il browser lo prende dal
 * titolo della pagina. Via i caratteri che Windows non accetta nei nomi di file.
 */
export function nomeFileRilievo(c: ClienteSnapshotRilievo): string {
  const nome = (c.tipo === 'azienda' ? c.ragione_sociale ?? '' : [c.nome, c.cognome].filter(Boolean).join(' '))
    .replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
  return nome ? `${nome}_RILIEVO MISURE` : 'RILIEVO MISURE'
}

const pulito = (s: string | null | undefined): string | null => (s && s.trim() ? s.trim() : null)

export function datiRiepilogo(
  v: VoceFp,
  s: Pick<StrutturaLocale, 'albero' | 'nome' | 'descrizione'> | null,
): DatiRiepilogo {
  const fp = v.fp
  const mq = fp.larghezza && fp.altezza ? (fp.larghezza * fp.altezza * (v.quantita || 1)) / 1e6 : null

  // Per campo: pannello scelto, vetro scelto, altrimenti il vetro della struttura.
  const vetri = [...new Set(s
    ? campiRiempimento(s.albero).map(c => {
        const pannello = fp.pannelli?.[c.codice]
        if (pannello) return `Pannello ${pannello.codice}`
        return fp.vetri?.[c.codice]?.codice ?? (c.tipo === 'vetro' ? c.codiceDefault : null)
      }).filter((x): x is string => !!x)
    : [...Object.values(fp.vetri ?? {}).map(x => x.codice), ...Object.values(fp.pannelli ?? {}).map(x => `Pannello ${x.codice}`)])]

  const profili = [
    ...telaiRaggruppati(fp.telai),
    ...(fp.anta ? [`Anta ${fp.anta}`] : []),
  ]

  const aggiunti = (fp.accessoriAggiunti ?? []).filter(a => a.quantita > 0)
    .map(a => `${a.quantita > 1 ? `${a.quantita} x ` : ''}${a.descrizione || a.codice}`)
  const accessori = s
    ? [
        ...kitOpzionali(s.albero).filter(k => fp.kit?.[k.chiave] ?? k.predefinito).map(k => k.descrizione || k.codice),
        // Solo quelli spuntati in cantiere: i predefiniti di FP PRO allungherebbero la scheda.
        ...accessoriOpzionaliScelti(s.albero, fp).filter(a => fp.accessori?.[a.chiave] === true).map(a => a.descrizione || a.codice),
        ...aggiunti,
      ]
    : aggiunti

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
