// Controlli di coerenza sul resoconto economico di commessa.
//
// Servono a far emergere da soli gli scostamenti che altrimenti si scoprono
// solo rifacendo i conti a mano: preventivato che non torna col fatturato,
// incassi superiori alle fatture, allegati doppi o intestati ad altri.
//
// Nessun avviso e' bloccante e nessuno finisce stampato da solo: sono
// segnalazioni per chi compila, che decide cosa farne.

import { formatEuro } from '@/lib/pricing'
import { calcolaTotaliResoconto, TOLLERANZA } from '@/lib/resoconto'
import type { RigaPreventivo, RigaFattura } from '@/lib/resoconto'

export type CodiceAvviso =
  | 'preventivato_non_fatturato'
  | 'fatturato_oltre_preventivo'
  | 'incassato_oltre_fatturato'
  | 'fattura_duplicata'
  | 'allegato_non_letto'
  | 'iva_incoerente'
  | 'fattura_precede_preventivo'
  | 'destinatario_diverso'

export type Avviso = {
  codice: CodiceAvviso
  messaggio: string
  /** valorizzato quando l'avviso riguarda una riga precisa, per evidenziarla */
  numeroFattura?: string
  differenza?: number
}

export type DatiVerifica = {
  preventivi: RigaPreventivo[]
  fatture: RigaFattura[]
  incassi: { importo: number }[]
  aliquoteIva: number[]
  clienteNome: string
  /** destinatario letto dal PDF, per numero di fattura */
  destinatariPerFattura: Record<string, string | null>
  /** preventivo citato nel PDF, per numero di fattura */
  preventiviCitati: Record<string, { numero: string; data: string } | null>
  /** nomi dei file che sembrano fatture ma che il parser non ha riconosciuto */
  allegatiNonLetti: string[]
}

/** Scarto massimo, in punti percentuali, fra aliquota implicita e configurata. */
const TOLLERANZA_ALIQUOTA = 0.5

/** Quota minima di parole in comune perche' due nomi siano la stessa persona. */
const SOGLIA_NOMI = 2 / 3

function parole(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(' ')
    .filter((p) => p.length > 2)
}

/**
 * Confronto fra il cliente della commessa e il destinatario della fattura.
 *
 * Non puo' essere letterale: sul caso reale la commessa dice "AZIENDA AGRICOLA
 * DI GIANLUCA TRANCHIDA" e la fattura "AZIENDA AGRICOLA DI TRANCHIDA GIANLUCA",
 * con nome e cognome invertiti. Si confrontano quindi gli insiemi di parole
 * significative, ignorando ordine, maiuscole, accenti e punteggiatura.
 *
 * Nel dubbio non si disturba l'utente: se una delle due stringhe resta senza
 * parole utili, la risposta e' che corrispondono.
 */
export function nomiCorrispondono(a: string, b: string): boolean {
  const pa = parole(a)
  const pb = parole(b)
  if (pa.length === 0 || pb.length === 0) return true

  const insieme = new Set(pb)
  const comuni = pa.filter((p) => insieme.has(p)).length
  return comuni / pa.length >= SOGLIA_NOMI
}

export function verificaResoconto(dati: DatiVerifica): Avviso[] {
  const avvisi: Avviso[] = []
  const t = calcolaTotaliResoconto(dati.preventivi, dati.fatture, dati.incassi)

  // ── Controlli sui totali ──────────────────────────────────

  // Senza righe preventivo non c'e' niente con cui confrontare il fatturato.
  if (dati.preventivi.length > 0 && dati.fatture.length > 0) {
    if (t.preventivatoNonFatturato > TOLLERANZA) {
      avvisi.push({
        codice: 'preventivato_non_fatturato',
        differenza: t.preventivatoNonFatturato,
        messaggio:
          `Preventivato ${formatEuro(t.preventivatoTotale)} ma fatturato ` +
          `${formatEuro(t.fatturatoTotale)}: mancano ${formatEuro(t.preventivatoNonFatturato)} da fatturare.`,
      })
    } else if (t.preventivatoNonFatturato < -TOLLERANZA) {
      const eccesso = Math.abs(t.preventivatoNonFatturato)
      avvisi.push({
        codice: 'fatturato_oltre_preventivo',
        differenza: eccesso,
        messaggio:
          `Fatturato ${formatEuro(t.fatturatoTotale)} a fronte di ${formatEuro(t.preventivatoTotale)} ` +
          `preventivati: ${formatEuro(eccesso)} in piu'. Verificare che la fattura a saldo esponga ` +
          `in detrazione gli acconti gia' fatturati.`,
      })
    }
  }

  if (dati.fatture.length > 0 && t.incassato - t.fatturatoTotale > TOLLERANZA) {
    const eccesso = Math.round((t.incassato - t.fatturatoTotale) * 100) / 100
    avvisi.push({
      codice: 'incassato_oltre_fatturato',
      differenza: eccesso,
      messaggio:
        `Incassati ${formatEuro(t.incassato)} a fronte di ${formatEuro(t.fatturatoTotale)} fatturati: ` +
        `${formatEuro(eccesso)} in piu'. Manca una fattura oppure un acconto e' stato registrato due volte.`,
    })
  }

  // ── Controlli sulle singole righe ─────────────────────────

  const visti = new Set<string>()
  for (const f of dati.fatture) {
    const chiave = `${f.tipo}|${f.numero.trim().toUpperCase()}`
    if (f.numero.trim() && visti.has(chiave)) {
      avvisi.push({
        codice: 'fattura_duplicata',
        numeroFattura: f.numero,
        messaggio: `Il numero ${f.numero} compare due volte: probabile allegato duplicato.`,
      })
    }
    visti.add(chiave)

    if (f.imponibile !== 0) {
      const aliquota = Math.abs((f.iva / f.imponibile) * 100)
      const nota = dati.aliquoteIva.some((a) => Math.abs(a - aliquota) <= TOLLERANZA_ALIQUOTA)
      if (!nota) {
        avvisi.push({
          codice: 'iva_incoerente',
          numeroFattura: f.numero,
          messaggio:
            `Sulla ${f.numero} l'IVA e' il ${aliquota.toFixed(1)}% dell'imponibile, ` +
            `che non corrisponde a nessuna aliquota configurata nelle Impostazioni.`,
        })
      }
    }

    const citato = dati.preventiviCitati[f.numero]
    if (citato && f.data && f.data < citato.data) {
      avvisi.push({
        codice: 'fattura_precede_preventivo',
        numeroFattura: f.numero,
        messaggio:
          `La ${f.numero} e' datata prima del preventivo ${citato.numero} che richiama: ` +
          `controllare le date.`,
      })
    }

    const destinatario = dati.destinatariPerFattura[f.numero]
    if (destinatario && !nomiCorrispondono(dati.clienteNome, destinatario)) {
      avvisi.push({
        codice: 'destinatario_diverso',
        numeroFattura: f.numero,
        messaggio:
          `La ${f.numero} e' intestata a "${destinatario}", mentre la commessa e' di ` +
          `"${dati.clienteNome}": forse e' allegata alla commessa sbagliata.`,
      })
    }
  }

  for (const nome of dati.allegatiNonLetti) {
    avvisi.push({
      codice: 'allegato_non_letto',
      messaggio: `"${nome}" sembra una fattura ma non e' stato possibile leggerlo: inserirlo a mano.`,
    })
  }

  return avvisi
}
