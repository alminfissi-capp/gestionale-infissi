import { formatEuro } from '@/lib/pricing'
import type { TipoRitenuta } from '@/types/commessa'
import type { MetodiIncassoFic, QuotaIncasso, TipoFatturaEmessa } from '@/types/fatture-emesse'

/*
 * Logica pura degli incassi sulle fatture emesse: quanto di una fattura spetta
 * a una commessa, come si ripartisce un incasso, cosa proporre per lo storico.
 * Gli importi delle quote sono quelli che si scrivono su FiC (rate pagate).
 */

const cent = (v: number) => Math.round(v * 100) / 100
const TOLLERANZA = 0.01

export type FatturaRipartibile = {
  fic_id: number
  tipo: TipoFatturaEmessa
  data: string
  /** Totale FiC, gia' al netto della ritenuta. Con segno. */
  importo_lordo: number
  ritenuta: number
  /** Positivo: rate non incassate su FiC (piu' quanto l'incasso stesso vi ha gia' scritto). */
  disponibile: number
  /** Parte della quota della commessa non ancora coperta da altri incassi. */
  quota_libera: number
}

export type IncassoDaRipartire = {
  /** Lordo pagato dal cliente, ritenuta compresa (vedi AccontoCommessa). */
  importo: number
  ritenuta: number
  ritenuta_tipo: TipoRitenuta | null
}

/** Parte di una fattura ancora assegnabile a una commessa. Note di credito: negativa. */
export function quotaLibera(importoFattura: number, quoteAltre: number[]): number {
  const libera = cent(importoFattura - quoteAltre.reduce((s, q) => s + q, 0))
  if (importoFattura < 0) return Math.min(0, libera)
  return Math.max(0, libera)
}

/**
 * Quanto di 1 € di incasso finisce sulla fattura FiC. Condominio (4%) con la
 * ritenuta gia' in fattura: FiC aspetta il netto, quindi totale/(totale+ritenuta).
 * In tutti gli altri casi (bonifico parlante 11%, fattura senza ritenuta) 1.
 */
export function fattoreFic(incasso: IncassoDaRipartire, f: Pick<FatturaRipartibile, 'importo_lordo' | 'ritenuta'>): number {
  if (incasso.ritenuta_tipo !== 'condominio' || f.ritenuta <= 0 || f.importo_lordo <= 0) return 1
  return f.importo_lordo / (f.importo_lordo + f.ritenuta)
}

const capienza = (f: FatturaRipartibile) => cent(Math.min(f.disponibile, f.quota_libera))
const perData = (a: FatturaRipartibile, b: FatturaRipartibile) => a.data.localeCompare(b.data) || a.fic_id - b.fic_id

/**
 * Ripartizione automatica di un incasso sulle fatture della commessa, dalla piu'
 * vecchia. Le note di credito non si "incassano": restano fuori.
 */
export function ripartisciIncasso(incasso: IncassoDaRipartire, fatture: FatturaRipartibile[]): QuotaIncasso[] {
  const quote: QuotaIncasso[] = []
  let resto = cent(incasso.importo)
  for (const f of [...fatture].filter((x) => x.tipo === 'fattura').sort(perData)) {
    if (resto < TOLLERANZA) break
    const cap = capienza(f)
    if (cap < TOLLERANZA) continue
    const k = fattoreFic(incasso, f)
    const importo = cent(Math.min(cap, resto * k))
    if (importo < TOLLERANZA) continue
    quote.push({ fic_documento_id: f.fic_id, tipo_documento: 'fattura', importo })
    resto = cent(resto - importo / k)
  }
  return quote
}

export type ControlloQuote = {
  /** Bloccano il salvataggio. */
  errori: string[]
  /** Si salvano dopo conferma. */
  avvisi: string[]
  /** Somma delle quote: cio' che si scrive su FiC. */
  totaleFic: number
  /** Parte dell'incasso (al lordo della ritenuta) coperta dalle quote. */
  coperto: number
}

export function controllaQuote(
  incasso: IncassoDaRipartire,
  fatture: FatturaRipartibile[],
  quote: QuotaIncasso[],
): ControlloQuote {
  const errori: string[] = []
  const avvisi: string[] = []
  let totaleFic = 0
  let coperto = 0
  for (const q of quote) {
    const f = fatture.find((x) => x.fic_id === q.fic_documento_id)
    if (!f) { errori.push('Una fattura non e\' piu\' collegata alla commessa'); continue }
    const nome = `la fattura del ${f.data.split('-').reverse().join('/')}`
    if (!(q.importo > 0)) { errori.push(`Importo non valido per ${nome}`); continue }
    if (q.importo > f.disponibile + TOLLERANZA) {
      errori.push(`Su FiC ${nome} ha da incassare ${formatEuro(f.disponibile)} €, non ${formatEuro(q.importo)} €`)
    } else if (q.importo > f.quota_libera + TOLLERANZA) {
      avvisi.push(`Per ${nome} superi la quota della commessa (${formatEuro(Math.max(0, f.quota_libera))} €)`)
    }
    totaleFic += q.importo
    coperto += q.importo / fattoreFic(incasso, f)
  }
  totaleFic = cent(totaleFic)
  coperto = cent(coperto)
  const importo = cent(incasso.importo)
  if (quote.length > 0 && coperto > importo + TOLLERANZA * quote.length) {
    errori.push(`Le fatture prendono ${formatEuro(coperto)} €, piu' dell'incasso (${formatEuro(importo)} €)`)
  } else if (quote.length > 0 && coperto < importo - TOLLERANZA * quote.length) {
    avvisi.push(`Le fatture coprono ${formatEuro(coperto)} € su ${formatEuro(importo)} € di incasso`)
  }
  return { errori, avvisi, totaleFic, coperto }
}

export type IncassoStorico = IncassoDaRipartire & { id: string; data: string }

/**
 * Abbinamento degli incassi gia' registrati alle fatture appena collegate:
 * in ordine di data, l'incasso piu' vecchio sulla fattura piu' vecchia.
 */
export function propostaStorico(
  incassi: IncassoStorico[],
  fatture: FatturaRipartibile[],
): { acconto_id: string; quote: QuotaIncasso[] }[] {
  const capienze = new Map(fatture.map((f) => [f.fic_id, { ...f }]))
  const proposta: { acconto_id: string; quote: QuotaIncasso[] }[] = []
  for (const i of [...incassi].sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id))) {
    const quote = ripartisciIncasso(i, [...capienze.values()])
    if (quote.length === 0) continue
    for (const q of quote) {
      const c = capienze.get(q.fic_documento_id)!
      c.disponibile = cent(c.disponibile - q.importo)
      c.quota_libera = cent(c.quota_libera - q.importo)
    }
    proposta.push({ acconto_id: i.id, quote })
  }
  return proposta
}

const NOMI_METODO: { metodo: keyof MetodiIncassoFic; regola: RegExp }[] = [
  { metodo: 'bonifico', regola: /bonific/i },
  { metodo: 'contanti', regola: /contant|cassa/i },
  { metodo: 'riba', regola: /ri\.?\s*ba/i },
]

/** Prima proposta dell'abbinamento metodo WinStudio → conto FiC, per nome. "Altro" si sceglie a mano. */
export function abbinaMetodiIncasso(metodiFic: { id: number; nome: string }[]): MetodiIncassoFic {
  const abbinati: MetodiIncassoFic = { bonifico: null, contanti: null, riba: null, altro: null }
  for (const { metodo, regola } of NOMI_METODO) {
    abbinati[metodo] = metodiFic.find((m) => regola.test(m.nome))?.id ?? null
  }
  return abbinati
}
