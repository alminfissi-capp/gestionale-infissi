// Le due ritenute d'acconto che possono colpire un incasso.
//
// Sono alternative, mai sommate: se il pagamento arriva col bonifico parlante,
// il condominio non applica anche il suo 4%.
//
//   'detrazioni'  11%, la trattiene la BANCA sul bonifico parlante
//   'condominio'   4%, la trattiene il CONDOMINIO come sostituto d'imposta
//
// ── 1. Ritenuta sui bonifici per detrazioni fiscali ("bonifico parlante").
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

// ── 2. Ritenuta d'acconto dei condomini.
//
// Il condominio e' sostituto d'imposta: sui lavori che gli fatturi trattiene il
// 4% dell'imponibile e lo versa all'Erario per tuo conto. Come sopra, il cliente
// ha pagato tutto: in azienda entra meno denaro.
//
//     100,00 imponibile + 22,00 IVA = 122,00 dovuti
//       4% di 100,00                =   4,00 trattenuti
//     il condominio bonifica          118,00
//
// Qui l'imponibile e' quello VERO della commessa, non uno scorporo fisso al 22%:
// a fare il conto non e' la banca ma il commercialista del condominio, che legge
// la fattura. Su una commessa al 10% — i condomini in ristrutturazione sono quasi
// tutti li' — 110 pagati danno imponibile 100 e ritenuta 4,00, non 3,61.

/** Quota trattenuta dal condominio sull'imponibile della fattura. */
export const ALIQUOTA_RITENUTA_CONDOMINIO = 0.04

/** Quale delle due: il tipo si salva accanto alla cifra, l'aliquota no. */
export type TipoRitenuta = 'detrazioni' | 'condominio'

/**
 * La frazione del pagato che e' imponibile, dai totali della commessa. Applicata
 * a un acconto parziale ne scorpora la sua quota, con la stessa proporzione del
 * totale.
 *
 * Ricade sullo scorporo al 22% quando i totali non sono utilizzabili — e il caso
 * piu' frequente non e' un dato sporco ma `iva_totale = 0`, cioe' la commessa
 * registrata col totale IVA compresa senza spezzarlo (in DB sono un centinaio).
 * Li' il rapporto varrebbe 1 e il 4% finirebbe sul lordo.
 */
export function quotaImponibile(
  imponibile: number | null | undefined,
  totale: number | null | undefined,
): number {
  const fallback = 1 / (1 + IVA_SCORPORO_RITENUTA)
  const i = Number(imponibile)
  const t = Number(totale)
  if (!Number.isFinite(i) || !Number.isFinite(t) || i <= 0 || t <= 0) return fallback
  const quota = i / t
  // quota = 1 significa "IVA non scorporata", non "commessa senza IVA": non c'e'
  // modo di distinguerle e trattenere di piu' e' l'errore piu' caro dei due.
  if (quota <= 0 || quota >= 1) return fallback
  return quota
}

/**
 * Quanto trattiene il condominio su un pagamento lordo, al centesimo.
 * `quota` arriva da `quotaImponibile` con i totali della commessa.
 */
export function calcolaRitenutaCondominio(lordo: number, quota: number): number {
  if (!Number.isFinite(lordo) || lordo <= 0) return 0
  const q = Number.isFinite(quota) && quota > 0 && quota <= 1 ? quota : 1 / (1 + IVA_SCORPORO_RITENUTA)
  return euro(lordo * q * ALIQUOTA_RITENUTA_CONDOMINIO)
}

/**
 * La trattenuta del tipo scelto. `null` e' lo stato a spunte spente: nessuna
 * ritenuta, niente da sottrarre.
 *
 * La quota imponibile serve solo al 4%: l'11% la ignora, perche' la banca
 * scorpora il suo 22% a prescindere dall'aliquota della fattura.
 */
export function calcolaRitenutaPer(
  tipo: TipoRitenuta | null,
  lordo: number,
  quota: number,
): number {
  if (tipo === 'detrazioni') return calcolaRitenuta(lordo)
  if (tipo === 'condominio') return calcolaRitenutaCondominio(lordo, quota)
  return 0
}

/**
 * Il denaro davvero entrato: il bonifico meno la trattenuta. Vale per entrambe
 * le ritenute — quello che cambia e' come si calcola la cifra, non cosa fa.
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
