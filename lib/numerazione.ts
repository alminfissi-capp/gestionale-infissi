/**
 * Genera il numero/identificativo di un preventivo.
 *
 * Formato: {prefisso} {num_padded}/{anno} [{operatore}]
 * Esempio: PRE 01/2026 G
 */
export function generaNumeroPreventivo(
  prefisso: string,
  contatore: number,
  anno: number,
  operatore: string | null,
  padding: number
): string {
  const num = String(contatore).padStart(Math.max(1, padding), '0')
  const parts: string[] = []
  if (prefisso.trim()) parts.push(prefisso.trim())
  parts.push(`${num}/${anno}`)
  if (operatore?.trim()) parts.push(operatore.trim().toUpperCase().charAt(0))
  return parts.join(' ')
}
