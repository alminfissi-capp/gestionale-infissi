// Rilievo unico: una voce e' da struttura FP PRO (fp) oppure disegnata (grafico).
import type { DisegnoGrafico } from '@/types/rilievo-grafico'
import type { VoceDisegnata, VoceFp, VoceFpDati, VoceFpVera, VoceGraficoDati } from '@/types/rilievo-fp'

// Generiche: servono anche sulle righe del telefono (VoceLocale), che hanno daInviare in piu'.
export const eVoceDisegnata = <T extends VoceFp>(v: T): v is T & { fp: null; grafico: VoceGraficoDati } => v.fp === null && !!v.grafico
export const eVoceFp = <T extends VoceFp>(v: T): v is T & { fp: VoceFpDati } => v.fp !== null && v.fp !== undefined

/** Disegno completo della voce: quello del cantiere piu' le assegnazioni dell'ufficio */
export function disegnoDellaVoce(v: VoceDisegnata): DisegnoGrafico {
  return { ...v.grafico, profili: v.assegnazioni?.profili ?? {}, riempimenti: v.assegnazioni?.riempimenti ?? {} }
}

/** Riepilogo stampabile: per ora solo le voci FP PRO (le disegnate arrivano con la parte 2) */
export function vociDelRiepilogo(voci: VoceFp[]): { fp: VoceFpVera[]; disegnate: number } {
  return { fp: voci.filter(eVoceFp), disegnate: voci.filter(eVoceDisegnata).length }
}
