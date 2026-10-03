import type { RataFic } from '@/lib/fic/tipi'

const cent = (v: number) => Math.round(v * 100) / 100
const pagata = (r: RataFic) => r.status === 'paid'

export const totaleRate = (rate: RataFic[]) => cent(rate.reduce((s, r) => s + (r.amount ?? 0), 0))

/** Cosa WinStudio ha fatto su un documento FiC: serve ad annullare solo quello. */
export type ScritturaFic = {
  data: string
  metodo_id: number
  rate_pagate: { id: number; importo: number }[]
  rata_divisa: { pagata_id: number; resto_id: number; importo_originale: number } | null
}

export type PagamentoApplicato =
  | {
      ok: true
      rate: RataFic[]
      indiciPagati: number[]
      divisa: { indicePagata: number; importoOriginale: number } | null
    }
  | { ok: false; disponibile: number }

/**
 * Segna pagate le rate non pagate, dalla prima scadenza, fino a coprire
 * `importo`. Se l'ultima rata supera il rimanente la divide: la parte pagata
 * tiene l'id, il resto diventa una rata nuova (senza id) con la stessa
 * scadenza. Il totale delle rate non cambia mai.
 */
export function applicaPagamento(rate: RataFic[], importo: number, data: string, metodoId: number): PagamentoApplicato {
  const obiettivo = cent(importo)
  const disponibile = cent(rate.filter((r) => !pagata(r)).reduce((s, r) => s + (r.amount ?? 0), 0))
  if (obiettivo <= 0 || disponibile < obiettivo) return { ok: false, disponibile }

  const nuove: RataFic[] = rate.map((r) => ({ ...r }))
  const ordine = rate
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => !pagata(r))
    .sort((a, b) => (a.r.due_date ?? '9999').localeCompare(b.r.due_date ?? '9999') || a.i - b.i)

  const indiciPagati: number[] = []
  let divisa: { indicePagata: number; importoOriginale: number } | null = null
  let resto = obiettivo
  const segnaPagata = { status: 'paid', paid_date: data, payment_account: { id: metodoId } }

  for (const { i } of ordine) {
    if (resto <= 0) break
    const r = nuove[i]
    const importoRata = cent(r.amount ?? 0)
    if (importoRata <= resto) {
      Object.assign(r, segnaPagata)
      resto = cent(resto - importoRata)
    } else {
      const { id: _id, ...senzaId } = r
      void _id
      nuove.push({ ...senzaId, amount: cent(importoRata - resto) })
      Object.assign(r, segnaPagata, { amount: resto })
      divisa = { indicePagata: i, importoOriginale: importoRata }
      resto = 0
    }
    indiciPagati.push(i)
  }

  return { ok: true, rate: nuove, indiciPagati, divisa }
}

/**
 * Dopo il PUT: gli id veri vengono dalla risposta di FiC. Le rate pagate
 * tengono il loro id; la rata resto e' quella con un id che prima non c'era.
 */
export function costruisciScrittura(
  prima: RataFic[],
  esito: Extract<PagamentoApplicato, { ok: true }>,
  dopo: RataFic[],
  data: string,
  metodoId: number,
): ScritturaFic {
  const idPrima = new Set(prima.map((r) => r.id).filter((id): id is number => typeof id === 'number'))
  const rate_pagate = esito.indiciPagati.map((i) => ({ id: esito.rate[i].id as number, importo: cent(esito.rate[i].amount ?? 0) }))
  let rata_divisa: ScritturaFic['rata_divisa'] = null
  if (esito.divisa) {
    const nuova = dopo.find((r) => typeof r.id === 'number' && !idPrima.has(r.id))
    const pagataId = esito.rate[esito.divisa.indicePagata].id as number
    if (nuova?.id) rata_divisa = { pagata_id: pagataId, resto_id: nuova.id, importo_originale: esito.divisa.importoOriginale }
  }
  return { data, metodo_id: metodoId, rate_pagate, rata_divisa }
}

export type Annullamento = { ok: true; rate: RataFic[] } | { ok: false; motivo: string }

/**
 * Rimette da pagare solo le rate che WinStudio ha segnato pagate, e riunisce la
 * rata divisa se il resto e' ancora com'era. Se una rata scritta da WinStudio
 * e' stata toccata su FiC non modifica niente: la decisione spetta a una persona.
 */
export function annullaPagamento(rate: RataFic[], s: ScritturaFic): Annullamento {
  const nuove: RataFic[] = rate.map((r) => ({ ...r }))
  for (const p of s.rate_pagate) {
    const r = nuove.find((x) => x.id === p.id)
    if (!r) return { ok: false, motivo: 'Una rata pagata da WinStudio non esiste piu\' su FiC: sistemala a mano' }
    if (!pagata(r) || cent(r.amount ?? 0) !== cent(p.importo) || r.paid_date !== s.data) {
      return { ok: false, motivo: 'Una rata pagata da WinStudio e\' stata modificata su FiC: sistemala a mano' }
    }
    r.status = 'not_paid'
    r.paid_date = null
  }
  if (s.rata_divisa) {
    const d = s.rata_divisa
    const principale = nuove.find((x) => x.id === d.pagata_id)
    const iResto = nuove.findIndex((x) => x.id === d.resto_id)
    if (principale && iResto >= 0) {
      const resto = nuove[iResto]
      const intatta =
        !pagata(resto) &&
        resto.due_date === principale.due_date &&
        cent((principale.amount ?? 0) + (resto.amount ?? 0)) === cent(d.importo_originale)
      if (intatta) {
        principale.amount = d.importo_originale
        nuove.splice(iResto, 1)
      }
    }
  }
  return { ok: true, rate: nuove }
}
