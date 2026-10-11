// Ottimizzazione dei tagli come FP PRO: si pagano le barre intere usate.
// "Il piu' lungo per primo" (first-fit decreasing), scarto di testa e coda per barra,
// lama per taglio. L'ottimizzatore di FP PRO (OPTI32) e' chiuso: il metodo e' lo stesso,
// i risultati si verificano sulle commesse vere (voce.test.ts).

export const LAMA_MM = 5

export function ottimizzaBarre(
  pezzi: number[],
  barra: number,
  testa: number,
  coda: number,
): { barre: number[]; lunghezzaTotale: number } {
  const utile = barra - testa - coda
  const residui: number[] = []
  const barre: number[] = []
  for (const p of [...pezzi].filter(x => x > 0).sort((a, b) => b - a)) {
    const serve = p + LAMA_MM
    if (serve > utile) {
      // Pezzo piu' lungo della barra: barra su misura.
      barre.push(p + testa + coda)
      continue
    }
    const i = residui.findIndex(r => r >= serve)
    if (i >= 0) residui[i] -= serve
    else {
      residui.push(utile - serve)
      barre.push(barra)
    }
  }
  return { barre, lunghezzaTotale: barre.reduce((s, b) => s + b, 0) }
}
