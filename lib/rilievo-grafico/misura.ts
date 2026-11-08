/**
 * Misura scritta a mano: accetta la virgola decimale, gli spazi intorno e il punto delle
 * migliaia all'italiana ("1.200" = 1200, "1.200,5" = 1200,5). null se non e' un numero.
 */
export function leggiMisura(s: string): number | null {
  let t = s.trim()
  if (!t) return null
  // Punto seguito da gruppi di 3 cifre = migliaia (con la virgola, o senza nessun altro decimale)
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '')
  t = t.replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
