import type { AziendaFic } from '@/types/fatture-fornitori'
import type { DocumentoFic, TipoSpesaFic } from '@/lib/fic/tipi'

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
}

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

  async function get<T>(percorso: string, parametri: Record<string, string> = {}): Promise<T> {
    n++
    const res = await fetchImpl(`${FIC_BASE_URL}${percorso}${querystring(parametri)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
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

  return {
    chiamate: () => n,

    async aziende() {
      const r = await get<{ data?: { companies?: { id: number; name: string }[] | null } | null }>(
        '/user/companies',
      )
      return (r.data?.companies ?? []).map((c) => ({ id: c.id, nome: c.name }))
    },

    async elencoSpese(companyId, tipo, dal) {
      const documenti: DocumentoFic[] = []
      for (let pagina = 1; pagina <= MAX_PAGINE; pagina++) {
        const r = await get<RispostaElenco>(`/c/${companyId}/received_documents`, {
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
    },

    async spesa(companyId, id) {
      const r = await get<{ data: DocumentoFic }>(`/c/${companyId}/received_documents/${id}`, {
        fieldset: 'detailed',
      })
      return r.data
    },
  }
}
