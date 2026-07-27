import type { StatoOrdine } from '@/types/produzione'

type RigaCalcolabile = { quantita: number; prezzo_unitario: number | null }

const arrotonda2 = (n: number): number => Math.round(n * 100) / 100

export function calcolaTotaleRigaOrdine(riga: RigaCalcolabile): number {
  if (riga.prezzo_unitario === null) return 0
  return arrotonda2(riga.quantita * riga.prezzo_unitario)
}

export function calcolaTotaleOrdine(righe: RigaCalcolabile[]): number {
  return arrotonda2(righe.reduce((tot, r) => tot + calcolaTotaleRigaOrdine(r), 0))
}

/**
 * Un ordine è in ritardo se la consegna prevista è già passata e non è
 * ancora arrivato. Gli ordini arrivati o annullati non sono mai in ritardo.
 */
export function isInRitardo(
  dataConsegnaPrevista: string | null,
  stato: StatoOrdine,
  oggi: Date = new Date()
): boolean {
  if (!dataConsegnaPrevista) return false
  if (stato === 'arrivato' || stato === 'annullato') return false
  const previsto = new Date(`${dataConsegnaPrevista}T00:00:00`)
  const riferimento = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate())
  return previsto.getTime() < riferimento.getTime()
}

/** Sigla mostrata davanti al numero ordine: "ORD 011-2026". */
export const PREFISSO_ORDINE = 'ORD'

const RE_NUMERO_ORDINE = /^(\d{1,4})-(\d{1,4})$/
const ANNO_MINIMO = 2000

/**
 * Legge un numero ordine in progressivo + anno. Accetta il formato attuale
 * NNN-AAAA, la sigla davanti ("ORD 011-2026") e il vecchio formato AAAA-NNN
 * degli ordini già in archivio. Restituisce null sui numeri liberi.
 */
export function parseNumeroOrdine(numero: string): { progressivo: number; anno: number } | null {
  const pulito = numero.trim().replace(/^ORD\s*/i, '')
  const match = RE_NUMERO_ORDINE.exec(pulito)
  if (!match) return null
  const primo = Number(match[1])
  const secondo = Number(match[2])
  if (match[2].length === 4 && secondo >= ANNO_MINIMO) return { progressivo: primo, anno: secondo }
  if (match[1].length === 4 && primo >= ANNO_MINIMO) return { progressivo: secondo, anno: primo }
  return null
}

/** Forma memorizzata a DB: NNN-AAAA, senza sigla. */
export function normalizzaNumeroOrdine(numero: string): string {
  const parsed = parseNumeroOrdine(numero)
  if (!parsed) return numero.trim()
  return `${String(parsed.progressivo).padStart(3, '0')}-${parsed.anno}`
}

/** Forma mostrata a video e nei PDF: "ORD 011-2026". */
export function formattaNumeroOrdine(numero: string | null | undefined): string {
  const pulito = (numero ?? '').trim()
  if (!pulito) return ''
  const parsed = parseNumeroOrdine(pulito)
  if (!parsed) return pulito
  return `${PREFISSO_ORDINE} ${String(parsed.progressivo).padStart(3, '0')}-${parsed.anno}`
}

/**
 * Progressivo NNN-AAAA. Usa il massimo esistente dell'anno, non il conteggio:
 * con i numeri modificabili a mano possono esserci buchi e duplicati.
 */
export function prossimoNumeroOrdine(numeriEsistenti: string[], anno: number): string {
  let massimo = 0
  for (const numero of numeriEsistenti) {
    const parsed = parseNumeroOrdine(numero)
    if (!parsed || parsed.anno !== anno) continue
    massimo = Math.max(massimo, parsed.progressivo)
  }
  return `${String(massimo + 1).padStart(3, '0')}-${anno}`
}
