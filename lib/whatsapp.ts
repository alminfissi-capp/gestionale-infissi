/**
 * Link wa.me con il messaggio già scritto.
 * - Con il telefono: apre la chat di quel numero (prefisso 39 se il numero non inizia con "+").
 * - Senza telefono: apre WhatsApp col messaggio pronto e il contatto lo sceglie l'utente
 *   (prima il pulsante spariva e sembrava un guasto).
 */
export function linkWhatsapp(telefono: string | null | undefined, testo: string): string {
  const tel = (telefono ?? '').trim()
  const cifre = tel.replace(/\D/g, '')
  const testoUrl = encodeURIComponent(testo)
  if (!cifre) return `https://wa.me/?text=${testoUrl}`
  const numero = tel.startsWith('+') ? cifre : `39${cifre}`
  return `https://wa.me/${numero}?text=${testoUrl}`
}
