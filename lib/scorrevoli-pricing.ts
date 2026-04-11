import type { ScorevoliListino, Modello, FasciaPrezzo } from '@/actions/scorrevoli'
import type { RigaScorrevoli, PreventivoScorrevoli, TotaliScorrevoli } from '@/types/scorrevoli'

/** Trova il modello nel listino */
export function getModello(listino: ScorevoliListino, id: string): Modello | undefined {
  return listino.modelli.find((m) => m.id === id)
}

/** Prezzo €/mq per Prisma in base all'altezza reale */
export function getPrezzoMqPrisma(fasce: FasciaPrezzo[], altezza_mm: number): number {
  // Usa la fascia che contiene l'altezza (considerando l'altezza reale, non quella fatturata)
  for (const fascia of fasce) {
    if (altezza_mm <= fascia.altezza_max_mm) return fascia.prezzo_mq
  }
  // Oltre tutte le fasce → ultima fascia
  return fasce[fasce.length - 1].prezzo_mq
}

/** Nr. ante standard Prisma in base alla larghezza */
export function getNrAntePrisma(listino: ScorevoliListino, larghezza_mm: number): number {
  const prisma = listino.modelli.find((m) => m.id === 'prisma')
  if (!prisma?.configurazione_ante_per_larghezza) return 1
  for (const cfg of prisma.configurazione_ante_per_larghezza) {
    if (larghezza_mm <= cfg.larghezza_max_mm) return cfg.nr_ante
  }
  return prisma.configurazione_ante_per_larghezza[prisma.configurazione_ante_per_larghezza.length - 1].nr_ante
}

/** Calcola i dati di una singola riga */
export function calcolaRiga(
  listino: ScorevoliListino,
  riga: RigaScorrevoli,
  sconto_vetrata_prisma: number,
  sconto_optional: number
) {
  const modello = getModello(listino, riga.modello)
  const { larghezza_mm, altezza_mm } = riga

  if (!modello || !larghezza_mm || !altezza_mm) {
    return {
      id: riga.id,
      mq_reali: 0, mq_fatturati: 0, prezzo_mq: 0,
      prezzo_vetrata: 0, sconto_vetrata: 0, prezzo_vetrata_netto: 0,
      maggiorazione_colore: 0, prezzo_vetro_extra: 0,
      totale_optional: 0, sconto_optional: 0, totale_optional_netto: 0,
      totale_riga: 0, totale_riga_x_qty: 0,
    }
  }

  const mq_reali = (larghezza_mm / 1000) * (altezza_mm / 1000)

  let mq_fatturati: number
  let prezzo_mq: number
  let sconto_vetrata = 0

  if (riga.modello === 'prisma') {
    const h_fatt = Math.max(altezza_mm, modello.altezza_min_fatturazione_mm)
    mq_fatturati = Math.max((larghezza_mm / 1000) * (h_fatt / 1000), modello.mq_minimi_fatturazione ?? 3)
    prezzo_mq = getPrezzoMqPrisma(modello.prezzo_mq_fasce!, altezza_mm)
    sconto_vetrata = sconto_vetrata_prisma
  } else {
    const h_fatt = Math.max(altezza_mm, modello.altezza_min_fatturazione_mm)
    mq_fatturati = (larghezza_mm / 1000) * (h_fatt / 1000)
    prezzo_mq = modello.prezzo_mq ?? 0
  }

  const prezzo_vetrata = mq_fatturati * prezzo_mq
  const prezzo_vetrata_netto = prezzo_vetrata * (1 - sconto_vetrata)

  // Maggiorazione colore: si applica sul netto (come da foglio Prisma)
  const maggiorazione_colore = prezzo_vetrata_netto * riga.colore_struttura_maggiorazione

  // Sovrapprezzo vetro speciale
  let prezzo_vetro_extra = 0
  if (riga.tipo_vetro !== 'standard') {
    const optVetro = listino.optional.find((o) => o.id === `vetro_${riga.tipo_vetro}`)
    if (optVetro?.prezzo) prezzo_vetro_extra = mq_fatturati * optVetro.prezzo
  }

  // Optional di riga
  const totale_optional_lordo = riga.optional.reduce((sum, o) => {
    return sum + (o.prezzo * o.quantita)
  }, 0)
  const sconto_opt = totale_optional_lordo * sconto_optional
  const totale_optional_netto = totale_optional_lordo - sconto_opt

  const totale_riga =
    prezzo_vetrata_netto + maggiorazione_colore + prezzo_vetro_extra + totale_optional_netto

  return {
    id: riga.id,
    mq_reali: round2(mq_reali),
    mq_fatturati: round2(mq_fatturati),
    prezzo_mq,
    prezzo_vetrata: round2(prezzo_vetrata),
    sconto_vetrata: round2(prezzo_vetrata * sconto_vetrata),
    prezzo_vetrata_netto: round2(prezzo_vetrata_netto),
    maggiorazione_colore: round2(maggiorazione_colore),
    prezzo_vetro_extra: round2(prezzo_vetro_extra),
    totale_optional: round2(totale_optional_lordo),
    sconto_optional: round2(sconto_opt),
    totale_optional_netto: round2(totale_optional_netto),
    totale_riga: round2(totale_riga),
    totale_riga_x_qty: round2(totale_riga * riga.quantita),
  }
}

/** Calcola tutti i totali del preventivo */
export function calcolaTotali(
  listino: ScorevoliListino,
  preventivo: PreventivoScorrevoli
): TotaliScorrevoli {
  const righeCalcolate = preventivo.righe.map((r) =>
    calcolaRiga(listino, r, preventivo.sconto_vetrata_prisma, preventivo.sconto_optional)
  )

  const subtotale_vetrate = righeCalcolate.reduce((s, r) => s + r.prezzo_vetrata_netto * (preventivo.righe.find(x => x.id === r.id)?.quantita ?? 1), 0)
  const subtotale_optional = righeCalcolate.reduce((s, r) => {
    const qty = preventivo.righe.find(x => x.id === r.id)?.quantita ?? 1
    return s + (r.maggiorazione_colore + r.prezzo_vetro_extra + r.totale_optional_netto) * qty
  }, 0)

  const totale_netto = round2(subtotale_vetrate + subtotale_optional)
  const trasporto = round2(totale_netto * preventivo.trasporto)
  const totale_imponibile = round2(totale_netto + trasporto)
  const iva = round2(totale_imponibile * preventivo.iva)
  const totale_generale = round2(totale_imponibile + iva)

  return {
    righe: righeCalcolate,
    subtotale_vetrate: round2(subtotale_vetrate),
    subtotale_optional: round2(subtotale_optional),
    totale_netto,
    trasporto,
    totale_imponibile,
    iva,
    totale_generale,
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function formatEuroScorrevoli(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
