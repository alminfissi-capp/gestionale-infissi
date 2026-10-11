// Ore nel pannello Correggi: i campi mostrano le ore che il calcolo usa davvero (struttura
// + correzioni), cosi' le ore della struttura non restano nascoste e non si sommano a quelle
// scritte a mano. Si salva solo cio' che cambia (o era gia' corretto).
import type { OreVoce } from './tipi'

const CHIAVI = ['taglio', 'lavorazione', 'montaggio', 'assemblaggio', 'posa'] as const

export function campiOre(attuali: OreVoce): Record<keyof OreVoce, string> {
  return Object.fromEntries(CHIAVI.map(k => [k, String(attuali[k])])) as Record<keyof OreVoce, string>
}

export function oreDaSalvare(
  campi: Partial<Record<keyof OreVoce, string>>,
  attuali: OreVoce,
  giaCorrette: Partial<OreVoce>,
): Partial<OreVoce> {
  const out: Partial<OreVoce> = {}
  for (const k of CHIAVI) {
    const testo = (campi[k] ?? '').trim()
    const n = testo === '' ? 0 : Number(testo.replace(',', '.'))
    const valore = Number.isFinite(n) && n >= 0 ? n : attuali[k]
    if (k in giaCorrette || valore !== attuali[k]) out[k] = valore
  }
  return out
}
