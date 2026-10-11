// Barre di tutta la commessa, come FP PRO: i pezzi di tutte le voci (per la loro quantita')
// si tagliano dalle stesse barre, poi il costo delle barre si ripartisce sulle voci in
// proporzione al costo dei loro pezzi. Il rapporto barre/pezzi e' lo "sfrido" che FP PRO
// salva nella commessa (verificato su 95-2026G: 234,65 / 160,36 = 1 + 0,46327).
import { ottimizzaBarre } from './barre'
import type { TagliProfilo } from './voce'

export function fattoreBarreCommessa(voci: { quantita: number; tagli: TagliProfilo[] }[]): {
  fattore: number
  barre: { codice: string; barre: number }[]
} {
  const perCodice = new Map<string, TagliProfilo>()
  for (const v of voci) {
    for (const t of v.tagli) {
      const g = perCodice.get(t.codice) ?? { ...t, lunghezze: [] }
      for (let i = 0; i < Math.max(1, v.quantita); i++) g.lunghezze.push(...t.lunghezze)
      perCodice.set(t.codice, g)
    }
  }
  let costoBarre = 0
  let costoPezzi = 0
  const barre: { codice: string; barre: number }[] = []
  for (const t of perCodice.values()) {
    const r = ottimizzaBarre(t.lunghezze, t.barra, t.testa, t.coda)
    costoBarre += (r.lunghezzaTotale / 1000) * t.euroM
    costoPezzi += (t.lunghezze.reduce((s, l) => s + l, 0) / 1000) * t.euroM
    barre.push({ codice: t.codice, barre: r.barre.length })
  }
  return { fattore: costoPezzi > 0 ? costoBarre / costoPezzi : 1, barre }
}
