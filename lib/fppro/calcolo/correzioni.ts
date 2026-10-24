// Tempi nel pannello Correggi, in MINUTI come in FP PRO. Il motore lavora in ore: la
// conversione sta solo qui. I campi mostrano i minuti che il calcolo usa davvero (struttura
// + correzioni), cosi' i tempi della struttura non restano nascosti e non si sommano a quelli
// scritti a mano. Si salva solo cio' che cambia (o era gia' corretto).
import type { OreVoce } from './tipi'

const CHIAVI = ['taglio', 'lavorazione', 'montaggio', 'assemblaggio', 'posa'] as const

export const minutiDaOre = (ore: number): number => Math.round(ore * 60)

export function campiMinuti(attuali: OreVoce): Record<keyof OreVoce, string> {
  return Object.fromEntries(CHIAVI.map(k => [k, String(minutiDaOre(attuali[k]))])) as Record<keyof OreVoce, string>
}

/** Minuti scritti nei campi -> correzioni in ore da salvare. */
export function oreDaMinuti(
  campi: Partial<Record<keyof OreVoce, string>>,
  attuali: OreVoce,
  giaCorrette: Partial<OreVoce>,
): Partial<OreVoce> {
  const out: Partial<OreVoce> = {}
  for (const k of CHIAVI) {
    const testo = (campi[k] ?? '').trim()
    const minuti = testo === '' ? 0 : Number(testo.replace(',', '.'))
    // Valore non valido o uguale a quello mostrato: restano le ore attuali, senza arrotondarle.
    const cambiato = Number.isFinite(minuti) && minuti >= 0 && minuti !== minutiDaOre(attuali[k])
    const valore = cambiato ? minuti / 60 : attuali[k]
    if (k in giaCorrette || cambiato) out[k] = valore
  }
  return out
}

/**
 * Tempi della struttura con i minuti scritti nella voce in cantiere (VoceFpDati.minuti):
 * un valore scritto sostituisce quello della struttura, non si somma. Le correzioni del
 * Calcolo si applicano dopo e vincono su entrambi.
 */
export function tempiConMinuti(tempi: OreVoce, minuti: Partial<Record<keyof OreVoce, number>> | undefined): OreVoce {
  const out = { ...tempi }
  for (const k of CHIAVI) {
    const m = minuti?.[k]
    if (typeof m === 'number' && Number.isFinite(m) && m >= 0) out[k] = m / 60
  }
  return out
}
