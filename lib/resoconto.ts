// Calcoli del resoconto economico di commessa: il documento riepilogativo che
// si consegna al cliente con preventivi accettati, fatture emesse, incassi e
// situazione contabile finale.
//
// Funzioni pure, nessun accesso ai dati: le righe arrivano gia' pronte dal
// form (components/commesse/DialogResoconto.tsx).

import { formatEuro } from '@/lib/pricing'
import type { TipoDocumentoFiscale } from '@/lib/parseFattura'

/** Sotto questa soglia una differenza e' arrotondamento, non uno scostamento. */
export const TOLLERANZA = 0.01

export type RigaPreventivo = {
  numero: string
  data: string | null
  oggetto: string
  imponibile: number
  iva: number
  totale: number
}

export type RigaFattura = {
  tipo: TipoDocumentoFiscale
  numero: string
  data: string | null
  descrizione: string
  imponibile: number
  iva: number
  totale: number
  /** true se la riga arriva dalla lettura di un PDF allegato, false se digitata */
  daAllegato: boolean
}

export type TotaliResoconto = {
  preventivatoImponibile: number
  preventivatoIva: number
  preventivatoTotale: number
  fatturatoImponibile: number
  fatturatoIva: number
  fatturatoTotale: number
  incassato: number
  saldoResiduoFatture: number
  preventivatoNonFatturato: number
  totaleASaldo: number
}

const somma = (valori: number[]): number =>
  Math.round(valori.reduce((tot, v) => tot + v, 0) * 100) / 100

/** Azzera gli scarti che sono solo arrotondamento del gestionale. */
const netto = (v: number): number => (Math.abs(v) < TOLLERANZA ? 0 : v)

export function calcolaTotaliResoconto(
  preventivi: RigaPreventivo[],
  fatture: RigaFattura[],
  incassi: { importo: number }[]
): TotaliResoconto {
  const preventivatoTotale = somma(preventivi.map((r) => r.totale))
  // Le note di credito hanno gli importi negativi: il fatturato e' gia' al netto.
  const fatturatoTotale = somma(fatture.map((r) => r.totale))
  const incassato = somma(incassi.map((i) => i.importo))

  const saldoResiduoFatture = netto(Math.round((fatturatoTotale - incassato) * 100) / 100)
  const preventivatoNonFatturato = netto(
    Math.round((preventivatoTotale - fatturatoTotale) * 100) / 100
  )

  return {
    preventivatoImponibile: somma(preventivi.map((r) => r.imponibile)),
    preventivatoIva: somma(preventivi.map((r) => r.iva)),
    preventivatoTotale,
    fatturatoImponibile: somma(fatture.map((r) => r.imponibile)),
    fatturatoIva: somma(fatture.map((r) => r.iva)),
    fatturatoTotale,
    incassato,
    saldoResiduoFatture,
    preventivatoNonFatturato,
    totaleASaldo: netto(
      Math.round((saldoResiduoFatture + preventivatoNonFatturato) * 100) / 100
    ),
  }
}

/**
 * Bozza della nota da stampare quando preventivato e fatturato non coincidono.
 * `differenzaTotale` e' IVA inclusa: positiva se resta da fatturare, negativa se
 * si e' fatturato piu' del pattuito. Il testo va sempre riletto e completato a
 * mano prima di consegnarlo al cliente: qui si mettono solo gli importi.
 */
export function bozzaNotaScostamento(
  differenzaTotale: number,
  aliquota: number
): { titolo: string; testo: string } | null {
  if (Math.abs(differenzaTotale) < TOLLERANZA) return null

  const totale = Math.abs(differenzaTotale)
  const imponibile = Math.round((totale / (1 + aliquota / 100)) * 100) / 100

  if (differenzaTotale > 0) {
    return {
      titolo: `Importo preventivato e non fatturato: ${formatEuro(totale)} (IVA inclusa)`,
      testo:
        `In sede di verifica contabile della commessa e' emersa una minore fatturazione di ` +
        `${formatEuro(imponibile)} di imponibile, pari a ${formatEuro(totale)} IVA inclusa, ` +
        `rispetto a quanto pattuito e sottoscritto in sede di accettazione del preventivo. ` +
        `L'importo, non essendo ricompreso nelle fatture gia' emesse, sara' oggetto di ` +
        `apposita fattura integrativa. Il "Totale a saldo della commessa" sopra indicato lo comprende.`,
    }
  }

  return {
    titolo: `Importo fatturato in eccesso: ${formatEuro(totale)} (IVA inclusa)`,
    testo:
      `In sede di verifica contabile della commessa e' emersa una fatturazione in eccesso di ` +
      `${formatEuro(imponibile)} di imponibile, pari a ${formatEuro(totale)} IVA inclusa, ` +
      `rispetto a quanto pattuito e sottoscritto in sede di accettazione del preventivo. ` +
      `L'importo sara' oggetto di apposita nota di credito.`,
  }
}
