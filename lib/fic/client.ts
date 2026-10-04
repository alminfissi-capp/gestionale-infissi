import type { AziendaFic } from '@/types/fatture-fornitori'
import type { DocumentoFic, RataFic, TipoEmessoFic, TipoSpesaFic } from '@/lib/fic/tipi'

export const FIC_BASE_URL = 'https://api-v2.fattureincloud.it'

/** Oltre questo numero di pagine c'e' un ciclo impazzito, non un archivio. */
const MAX_PAGINE = 500

export class FicNonAutorizzato extends Error {
  constructor() {
    super('Token Fatture in Cloud non valido, revocato o senza i permessi necessari')
    this.name = 'FicNonAutorizzato'
  }
}

export class FicTroppeRichieste extends Error {
  readonly retryAfter: number | null
  constructor(retryAfter: number | null) {
    super('Troppe richieste a Fatture in Cloud')
    this.name = 'FicTroppeRichieste'
    this.retryAfter = retryAfter
  }
}

export class FicErrore extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'FicErrore'
    this.status = status
  }
}

export type FicClient = {
  /** Chiamate HTTP fatte finora da questo client: serve al budget della sincronizzazione. */
  chiamate: () => number
  aziende: () => Promise<AziendaFic[]>
  elencoSpese: (companyId: number, tipo: TipoSpesaFic, dal: string) => Promise<DocumentoFic[]>
  spesa: (companyId: number, id: number) => Promise<DocumentoFic>
  aggiornaRate: (companyId: number, id: number, rate: RataFic[]) => Promise<DocumentoFic>
  metodiPagamento: (companyId: number) => Promise<{ id: number; nome: string }[]>
  elencoEmessi: (companyId: number, tipo: TipoEmessoFic, dal: string) => Promise<DocumentoFic[]>
  emesso: (companyId: number, id: number) => Promise<DocumentoFic>
  aggiornaRateEmesso: (companyId: number, id: number, rate: RataFic[]) => Promise<DocumentoFic>
}

/** Documenti ricevuti (spese) ed emessi (vendite) hanno la stessa API, cambia solo il percorso. */
type Archivio = 'received_documents' | 'issued_documents'

type RispostaElenco = {
  data?: DocumentoFic[] | null
  current_page?: number
  last_page?: number
}

/**
 * I parametri si codificano a mano con encodeURIComponent: URLSearchParams
 * trasformerebbe gli spazi del filtro `q` in "+", e FiC vuole "%20".
 */
function querystring(parametri: Record<string, string>): string {
  const coppie = Object.entries(parametri).map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
  return coppie.length ? `?${coppie.join('&')}` : ''
}

export function creaClientFic(token: string, fetchImpl: typeof fetch = fetch): FicClient {
  let n = 0

  async function richiesta<T>(
    metodo: 'GET' | 'PUT',
    percorso: string,
    parametri: Record<string, string> = {},
    corpo?: unknown,
  ): Promise<T> {
    n++
    const res = await fetchImpl(`${FIC_BASE_URL}${percorso}${querystring(parametri)}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: 'no-store',
    })
    if (res.status === 401) throw new FicNonAutorizzato()
    if (res.status === 429) {
      const secondi = Number(res.headers.get('Retry-After'))
      throw new FicTroppeRichieste(Number.isFinite(secondi) && secondi > 0 ? secondi : null)
    }
    if (!res.ok) {
      let messaggio = `Errore Fatture in Cloud (${res.status})`
      try {
        const corpo = (await res.json()) as { error?: { message?: string } }
        if (corpo?.error?.message) messaggio += `: ${corpo.error.message}`
      } catch {
        // corpo non JSON: resta il messaggio generico
      }
      throw new FicErrore(messaggio, res.status)
    }
    return (await res.json()) as T
  }

  const get = <T,>(percorso: string, parametri: Record<string, string> = {}) =>
    richiesta<T>('GET', percorso, parametri)

  async function elenco(companyId: number, archivio: Archivio, tipo: string, dal: string) {
    const documenti: DocumentoFic[] = []
    for (let pagina = 1; pagina <= MAX_PAGINE; pagina++) {
      const r = await get<RispostaElenco>(`/c/${companyId}/${archivio}`, {
        type: tipo,
        fieldset: 'detailed',
        per_page: '100',
        page: String(pagina),
        sort: 'id',
        q: `date >= '${dal}'`,
      })
      documenti.push(...(r.data ?? []))
      if (!r.last_page || pagina >= r.last_page) return documenti
    }
    throw new FicErrore(`Elenco Fatture in Cloud oltre ${MAX_PAGINE} pagine`, 0)
  }

  async function dettaglio(companyId: number, archivio: Archivio, id: number) {
    const r = await get<{ data: DocumentoFic }>(`/c/${companyId}/${archivio}/${id}`, { fieldset: 'detailed' })
    return r.data
  }

  async function aggiorna(companyId: number, archivio: Archivio, id: number, rate: RataFic[]) {
    // Modalita' delta di FiC: si manda solo il campo che cambia.
    const r = await richiesta<{ data: DocumentoFic }>('PUT', `/c/${companyId}/${archivio}/${id}`, {}, {
      data: { payments_list: rate },
    })
    return r.data
  }

  return {
    chiamate: () => n,

    async aziende() {
      const r = await get<{ data?: { companies?: { id: number; name: string }[] | null } | null }>(
        '/user/companies',
      )
      return (r.data?.companies ?? []).map((c) => ({ id: c.id, nome: c.name }))
    },

    elencoSpese: (companyId, tipo, dal) => elenco(companyId, 'received_documents', tipo, dal),
    spesa: (companyId, id) => dettaglio(companyId, 'received_documents', id),
    aggiornaRate: (companyId, id, rate) => aggiorna(companyId, 'received_documents', id, rate),
    elencoEmessi: (companyId, tipo, dal) => elenco(companyId, 'issued_documents', tipo, dal),
    emesso: (companyId, id) => dettaglio(companyId, 'issued_documents', id),
    aggiornaRateEmesso: (companyId, id, rate) => aggiorna(companyId, 'issued_documents', id, rate),

    async metodiPagamento(companyId) {
      const r = await get<{ data?: { id: number; name: string }[] | null }>(`/c/${companyId}/settings/payment_accounts`)
      return (r.data ?? []).map((m) => ({ id: m.id, nome: m.name }))
    },
  }
}
