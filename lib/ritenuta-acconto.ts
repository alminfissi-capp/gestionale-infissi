// Ritenuta d'acconto sui bonifici per detrazioni fiscali ("bonifico parlante").
//
// Quando il cliente paga con il bonifico che gli da' diritto alla detrazione, la
// banca trattiene una quota e la versa all'Agenzia delle Entrate come acconto
// sulle imposte dell'impresa. Il cliente ha pagato tutto e non deve piu' niente:
// e' all'azienda che arriva meno denaro.
//
//   1.220,00 lordo  ÷ 1,22 = 1.000,00 imponibile
//   1.000,00 × 11%          =   110,00 trattenuti
//   1.220,00 −  110,00      = 1.110,00 realmente incassati
//
// Il divisore e' 1,22 SEMPRE, anche su una commessa al 10% o al 4%: la banca
// scorpora un'IVA ipotetica al 22% a prescindere dall'aliquota della fattura.
// Leggere qui `aliquota_iva` della commessa gonfierebbe la trattenuta.

/** Quota trattenuta dalla banca sull'imponibile. 8% fino al 2022, 11% da allora. */
export const ALIQUOTA_RITENUTA = 0.11

/** L'IVA che la banca scorpora per trovare l'imponibile: fissa, non quella della commessa. */
export const IVA_SCORPORO_RITENUTA = 0.22

function euro(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Quanto trattiene la banca su un bonifico lordo, arrotondato al centesimo.
 * Su un importo assente o non positivo non c'e' niente da trattenere.
 */
export function calcolaRitenuta(lordo: number): number {
  if (!Number.isFinite(lordo) || lordo <= 0) return 0
  const imponibile = lordo / (1 + IVA_SCORPORO_RITENUTA)
  return euro(imponibile * ALIQUOTA_RITENUTA)
}

/**
 * Il denaro davvero entrato: il bonifico meno la trattenuta.
 *
 * Il floor a zero difende le letture di cassa da una riga incoerente in DB
 * (il CHECK sulla colonna la esclude, ma i vincoli si possono allentare e un
 * incasso negativo falserebbe in silenzio il flusso del mese).
 */
export function nettoIncassato(lordo: number, ritenuta: number | null | undefined): number {
  const l = Number.isFinite(lordo) ? lordo : 0
  const r = Number.isFinite(ritenuta as number) ? (ritenuta as number) : 0
  return euro(Math.max(0, l - r))
}
