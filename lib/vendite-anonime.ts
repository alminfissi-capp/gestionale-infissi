/**
 * Calcoli delle vendite anonime (e-commerce, eBay).
 *
 * Unica fonte di verita' dei numeri: la usano il dialog di inserimento per il
 * riepilogo dal vivo e la server action per decidere cosa scrivere in `commesse`.
 * Nessuna dipendenza React ne' Supabase, cosi' resta verificabile da sola.
 */

/** Aliquota IVA precompilata nel dialog, in punti percentuali. */
export const ALIQUOTA_IVA_DEFAULT = 22

/** Arrotondamento a due decimali, come tutti gli importi del gestionale. */
function euro(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export type ScorporoIva = { imponibile: number; iva: number }

/**
 * Scorpora l'IVA da un importo lordo.
 *
 * L'IVA e' la differenza fra lordo e imponibile, non un secondo arrotondamento
 * calcolato a parte: cosi' `imponibile + iva` ridà sempre il lordo esatto, che
 * e' il numero che finisce in `commesse.totale` e nell'acconto. Se i due fossero
 * arrotondati separatamente, la somma potrebbe scostarsi di un centesimo e il
 * saldo della commessa non sarebbe piu' zero.
 */
export function scorporaIva(lordo: number, aliquota: number): ScorporoIva {
  if (!Number.isFinite(lordo) || !Number.isFinite(aliquota) || aliquota <= 0) {
    return { imponibile: euro(lordo || 0), iva: 0 }
  }
  const imponibile = euro(lordo / (1 + aliquota / 100))
  return { imponibile, iva: euro(lordo - imponibile) }
}

/** Utile della vendita: imponibile meno i costi. Puo' essere negativo. */
export function calcolaUtile(
  imponibile: number,
  materiale: number,
  manodopera: number,
): number {
  return euro(imponibile - (materiale || 0) - (manodopera || 0))
}

/** Margine percentuale sull'imponibile. Zero quando non c'e' imponibile. */
export function margine(imponibile: number, utile: number): number {
  if (!imponibile) return 0
  return euro((utile / imponibile) * 100)
}

/**
 * Forma minima di una riga sommabile. Non e' `VenditaAnonima` di proposito:
 * qui servono solo gli importi, e tenerla strutturale lascia questo file senza
 * dipendenze dai tipi del dominio.
 */
export type RigaTotalizzabile = {
  lordo: number
  imponibile: number
  materiale: number
  manodopera: number
  utile: number
}

export type TotaliVendite = {
  numero: number
  lordo: number
  imponibile: number
  materiale: number
  manodopera: number
  utile: number
  margine: number
}

/**
 * Somma un elenco di vendite.
 *
 * Il margine si calcola sui totali e non come media dei margini di riga:
 * altrimenti una vendita da 10 euro peserebbe quanto una da 1000.
 */
export function totaliVendite(vendite: readonly RigaTotalizzabile[]): TotaliVendite {
  type Somma = {
    numero: number
    lordo: number
    imponibile: number
    materiale: number
    manodopera: number
    utile: number
  }
  const t = vendite.reduce<Somma>(
    (acc, v) => ({
      numero: acc.numero + 1,
      lordo: acc.lordo + (v.lordo || 0),
      imponibile: acc.imponibile + (v.imponibile || 0),
      materiale: acc.materiale + (v.materiale || 0),
      manodopera: acc.manodopera + (v.manodopera || 0),
      utile: acc.utile + (v.utile || 0),
    }),
    { numero: 0, lordo: 0, imponibile: 0, materiale: 0, manodopera: 0, utile: 0 },
  )
  const imponibile = euro(t.imponibile)
  const utile = euro(t.utile)
  return {
    numero: t.numero,
    lordo: euro(t.lordo),
    imponibile,
    materiale: euro(t.materiale),
    manodopera: euro(t.manodopera),
    utile,
    margine: margine(imponibile, utile),
  }
}
