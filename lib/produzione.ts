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

const RE_NUMERO_ORDINE = /^(\d{4})-(\d{3})$/

/**
 * Progressivo AAAA-NNN. Usa il massimo esistente dell'anno, non il conteggio:
 * con i numeri modificabili a mano possono esserci buchi e duplicati.
 */
export function prossimoNumeroOrdine(numeriEsistenti: string[], anno: number): string {
  let massimo = 0
  for (const numero of numeriEsistenti) {
    const match = RE_NUMERO_ORDINE.exec(numero.trim())
    if (!match) continue
    if (Number(match[1]) !== anno) continue
    massimo = Math.max(massimo, Number(match[2]))
  }
  return `${anno}-${String(massimo + 1).padStart(3, '0')}`
}
