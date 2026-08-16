import type { AccessorioSuMisuraSelezionato } from '@/types/preventivo'

/**
 * Logica pura dei listini "su misura" (prezzo al mq + accessori).
 *
 * Distinzione fondamentale fra le due quantità di un accessorio:
 * - **quantità grezza**: il moltiplicatore scelto dall'utente nel form (di norma 1)
 * - **quantità effettiva**: quella fatturata — per gli accessori con unità `mq`
 *   è `mq × quantità grezza`
 *
 * Su `config_su_misura.accessori` viene salvata la quantità **effettiva** (è quella
 * che finisce nel PDF e nei report). Riaprendo un articolo in modifica va quindi
 * riconvertita in quantità grezza con {@link selezioneAccessoriDaConfig}, altrimenti
 * la moltiplicazione per i mq viene applicata una seconda volta.
 */

/** Sottoinsieme di AccessorioSuMisura necessario al calcolo. */
export type AccessorioCalcolo = {
  id: string
  nome: string
  unita: 'pz' | 'mq' | 'ml'
  prezzo: number
  prezzo_acquisto: number
  qty_default: number
}

/** Sottoinsieme di GruppoAccessoriSuMisura necessario al calcolo. */
export type GruppoCalcolo = {
  id: string
  tipo_scelta: 'singolo' | 'multiplo' | 'incluso'
  accessori: AccessorioCalcolo[]
}

/** Stato del form: `{ [accessorio_id]: quantità grezza }` */
export type SelezioneAccessori = Record<string, number>

export type RisultatoAccessoriSuMisura = {
  /** Righe pronte per `config_su_misura.accessori` (qty = quantità effettiva) */
  accessori: AccessorioSuMisuraSelezionato[]
  /** Somma dei `totale` delle righe: prezzo di vendita degli accessori */
  totale: number
  /** Costo di acquisto complessivo degli accessori */
  costoAcquisto: number
}

/**
 * Quantità grezza di un accessorio, o `null` se non fa parte della configurazione.
 * I gruppi `incluso` ricadono su `qty_default` quando l'utente non sceglie nulla.
 */
function qtyGrezza(
  gruppo: GruppoCalcolo,
  acc: AccessorioCalcolo,
  selezione: SelezioneAccessori
): number | null {
  const scelta = selezione[acc.id]
  if (scelta != null && scelta > 0) return scelta
  if (gruppo.tipo_scelta === 'incluso') return acc.qty_default
  return null
}

/** Quantità fatturata: gli accessori al mq moltiplicano la quantità grezza per i mq. */
export function qtyEffettivaAccessorio(unita: AccessorioCalcolo['unita'], grezza: number, mq: number): number {
  return unita === 'mq' ? mq * grezza : grezza
}

/**
 * Unica sorgente di verità per gli accessori di un articolo su misura: la stessa
 * chiamata alimenta l'anteprima prezzi del form e le righe salvate, così i due
 * valori non possono divergere.
 */
export function calcolaAccessoriSuMisura(
  gruppi: GruppoCalcolo[],
  selezione: SelezioneAccessori,
  mq: number
): RisultatoAccessoriSuMisura {
  const accessori: AccessorioSuMisuraSelezionato[] = []
  let totale = 0
  let costoAcquisto = 0

  for (const gruppo of gruppi) {
    for (const acc of gruppo.accessori) {
      const grezza = qtyGrezza(gruppo, acc, selezione)
      if (grezza == null || grezza <= 0) continue

      const qty = qtyEffettivaAccessorio(acc.unita, grezza, mq)
      const totaleRiga = acc.prezzo * qty

      accessori.push({
        accessorio_id: acc.id,
        gruppo_id: gruppo.id,
        nome: acc.nome,
        unita: acc.unita,
        qty,
        prezzo_unitario: acc.prezzo,
        totale: totaleRiga,
      })
      totale += totaleRiga
      costoAcquisto += acc.prezzo_acquisto * qty
    }
  }

  return { accessori, totale, costoAcquisto }
}

/**
 * Inverso di {@link calcolaAccessoriSuMisura}: ricostruisce la selezione grezza del
 * form da una configurazione salvata. Usa i mq salvati nella configurazione (non
 * quelli ricalcolati) perché sono quelli con cui la quantità effettiva è stata prodotta.
 */
export function selezioneAccessoriDaConfig(config: {
  accessori: AccessorioSuMisuraSelezionato[]
  mq: number
}): SelezioneAccessori {
  const selezione: SelezioneAccessori = {}
  for (const acc of config.accessori ?? []) {
    const grezza = acc.unita === 'mq' && config.mq > 0 ? acc.qty / config.mq : acc.qty
    // arrotonda l'errore di virgola mobile della divisione (0.9999999999 → 1)
    selezione[acc.accessorio_id] = Math.round(grezza * 1e6) / 1e6
  }
  return selezione
}

export type ModoImporto = 'percentuale' | 'fisso'

/**
 * Prezzo unitario di un articolo su misura.
 * Le spese varie si applicano su prodotto + accessori; l'utile su tutto il resto.
 */
export function calcolaPrezzoUnitarioSuMisura(input: {
  totaleProdotto: number
  totaleAccessori: number
  manoDopera: number
  spese: { modo: ModoImporto; valore: number }
  utile: { modo: ModoImporto; valore: number }
}): { speseCalcolate: number; utileCalcolato: number; prezzoUnitario: number } {
  const base = input.totaleProdotto + input.totaleAccessori
  const speseCalcolate =
    input.spese.modo === 'percentuale' ? (base * input.spese.valore) / 100 : input.spese.valore
  const costiTotali = base + input.manoDopera + speseCalcolate
  const utileCalcolato =
    input.utile.modo === 'percentuale' ? (costiTotali * input.utile.valore) / 100 : input.utile.valore

  return { speseCalcolate, utileCalcolato, prezzoUnitario: costiTotali + utileCalcolato }
}
