import type { ConteggiSync } from '@/types/fatture-fornitori'

export function formatDataOra(iso: string): string {
  const d = new Date(iso)
  const data = d.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric' })
  const ora = d.toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' })
  return `${data} ${ora}`
}

/** 'YYYY-MM-DD' → 'gg/mm/aaaa' senza passare da Date (niente sorprese di fuso). */
export function formatData(iso: string): string {
  const [a, m, g] = iso.slice(0, 10).split('-')
  return `${g}/${m}/${a}`
}

export function descriviConteggi(c: ConteggiSync): string {
  const parti: string[] = []
  if (c.nuove) parti.push(`${c.nuove} ${c.nuove === 1 ? 'nuova' : 'nuove'}`)
  if (c.aggiornate) parti.push(`${c.aggiornate} ${c.aggiornate === 1 ? 'aggiornata' : 'aggiornate'}`)
  if (c.eliminate) parti.push(`${c.eliminate} ${c.eliminate === 1 ? 'eliminata' : 'eliminate'}`)
  return parti.length ? parti.join(', ') : 'nessuna novità'
}
