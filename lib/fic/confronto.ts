export type VoceFic = { fic_id: number; updated_at: string }
export type VoceLocale = { fic_id: number; fic_updated_at: string }
export type Differenze = { nuove: number[]; modificate: number[]; eliminate: number[] }

/**
 * Confronta l'elenco FiC con la copia locale. La data di modifica si confronta
 * come stringa grezza di FiC: e' cosi' che la salviamo, niente fusi di mezzo.
 */
export function confronta(fic: VoceFic[], locali: VoceLocale[]): Differenze {
  const localiPerId = new Map(locali.map((l) => [l.fic_id, l.fic_updated_at]))
  const suFic = new Set(fic.map((f) => f.fic_id))
  const nuove: number[] = []
  const modificate: number[] = []
  for (const f of fic) {
    const locale = localiPerId.get(f.fic_id)
    if (locale === undefined) nuove.push(f.fic_id)
    else if (locale !== f.updated_at) modificate.push(f.fic_id)
  }
  const eliminate = locali.filter((l) => !suFic.has(l.fic_id)).map((l) => l.fic_id)
  return { nuove, modificate, eliminate }
}
