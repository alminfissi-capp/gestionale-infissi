/**
 * Genera il numero/identificativo di un preventivo.
 *
 * Formato: {prefisso} {num_padded}/{anno} [{operatore}] {nome_cliente}
 * Esempio: PRE 01/2026 G Mario Rossi
 */
export function generaNumeroPreventivo(
  prefisso: string,
  contatore: number,
  anno: number,
  operatore: string | null,
  padding: number,
  nomeCliente: string
): string {
  const num = String(contatore).padStart(Math.max(1, padding), '0')
  const parts: string[] = []
  if (prefisso.trim()) parts.push(prefisso.trim())
  parts.push(`${num}/${anno}`)
  if (operatore?.trim()) parts.push(operatore.trim().toUpperCase().charAt(0))
  if (nomeCliente.trim()) parts.push(nomeCliente.trim())
  return parts.join(' ')
}
