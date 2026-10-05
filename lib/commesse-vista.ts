import type { StatoCommessa } from '@/types/commessa'

/* Aspetto condiviso fra la tabella delle commesse (tablet e PC) e le viste del telefono. */

// Il viola dell'inesigibile vince sul colore dello stato: la riga deve dire
// prima di tutto che quei soldi non arriveranno.
export function rigaClass(c: { stato: StatoCommessa; inesigibile?: boolean }): string {
  if (c.inesigibile)           return 'bg-violet-50'
  if (c.stato === 'concluso')  return 'bg-sky-50'
  if (c.stato === 'bloccato')  return 'bg-orange-50'
  if (c.stato === 'annullato') return 'bg-red-50'
  if (c.stato === 'in_attesa') return ''
  return 'bg-yellow-50'
}

export function formatMese(data: string): string {
  const [y, m] = data.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  const mese = d.toLocaleDateString('it-IT', { month: 'short' })
  return `${mese.charAt(0).toUpperCase() + mese.slice(1)} ${String(y).slice(-2)}`
}
