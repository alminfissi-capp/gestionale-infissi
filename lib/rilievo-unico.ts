// Rilievo unico: una voce e' da struttura FP PRO (fp) oppure disegnata (grafico).
import type { DisegnoGrafico } from '@/types/rilievo-grafico'
import type { VoceDisegnata, VoceFp, VoceFpVera } from '@/types/rilievo-fp'

export const eVoceDisegnata = (v: VoceFp): v is VoceDisegnata => v.fp === null && !!v.grafico
export const eVoceFp = (v: VoceFp): v is VoceFpVera => v.fp !== null && v.fp !== undefined

/** Disegno completo della voce: quello del cantiere piu' le assegnazioni dell'ufficio */
export function disegnoDellaVoce(v: VoceDisegnata): DisegnoGrafico {
  return { ...v.grafico, profili: v.assegnazioni?.profili ?? {}, riempimenti: v.assegnazioni?.riempimenti ?? {} }
}
