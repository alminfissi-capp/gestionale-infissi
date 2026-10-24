// Regole piccole della pagina del cantiere (navigazione tra le viste, card dei rilievi).

export type VistaCantiere =
  | { tipo: 'elenco' }
  | { tipo: 'rilievo'; id: string }
  | { tipo: 'riepilogo'; id: string }
  | { tipo: 'voce'; rilievoId: string; voceId: string | null; copiaDa?: string | null }

/**
 * Dove si torna quando la cronologia del browser non porta la vista (Next.js riscrive
 * history.state): dalla voce e dal riepilogo al loro rilievo, dal rilievo all'elenco.
 */
export function vistaPrecedente(v: VistaCantiere): VistaCantiere {
  if (v.tipo === 'voce') return { tipo: 'rilievo', id: v.rilievoId }
  if (v.tipo === 'riepilogo') return { tipo: 'rilievo', id: v.id }
  return { tipo: 'elenco' }
}

/** Per ogni rilievo: serramenti (voci) e pezzi (somma delle quantita'). */
export function riepilogoPezzi(voci: { rilievoId: string; quantita: number }[]): Map<string, { serramenti: number; pezzi: number }> {
  const m = new Map<string, { serramenti: number; pezzi: number }>()
  for (const v of voci) {
    const r = m.get(v.rilievoId) ?? { serramenti: 0, pezzi: 0 }
    r.serramenti += 1
    r.pezzi += v.quantita || 1
    m.set(v.rilievoId, r)
  }
  return m
}

/** Data del rilievo (gg/mm/aaaa); per i rilievi fatti prima che ci fosse, quella di creazione. */
export function dataRilievoTesto(r: { dataRilievo?: string | null; creatoAt: string }): string {
  const iso = r.dataRilievo || r.creatoAt.slice(0, 10)
  const [a, m, g] = iso.split('-')
  return `${g}/${m}/${a}`
}

/** Rilievo da aprire subito (/rilievo/cantiere?rilievo=ID, dal Calcolo e preventivo); null se manca o non e' un id. */
export function rilievoDaIndirizzo(search: string): string | null {
  const id = new URLSearchParams(search).get('rilievo')
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null
}
