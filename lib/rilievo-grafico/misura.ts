/** Misura scritta a mano: accetta la virgola e gli spazi intorno. null se non e' un numero */
export function leggiMisura(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
