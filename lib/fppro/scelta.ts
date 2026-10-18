// Regole piccole degli elenchi del rilievo FP PRO, separate dai componenti per poterle testare.
import type { TabellaCatalogoLocale } from '@/types/rilievo-fp'

export interface VoceElenco { id: string; testo: string; sotto?: string | null }

/**
 * Cosa mostra un menu a tendina chiuso. Un valore salvato che non e' nell'elenco (colore
 * tolto da FP PRO, catalogo non ancora riscaricato, profilo di un'altra serie) si mostra
 * lo stesso, segnato fuori catalogo: dire "Non indicato" mentirebbe, il calcolo lo usa.
 */
export function voceMostrata<T extends VoceElenco>(
  voci: T[], valore: string | null, riserva: VoceElenco | null,
): { voce: T | VoceElenco | null; fuoriCatalogo: boolean } {
  if (valore === null) return { voce: null, fuoriCatalogo: false }
  const trovata = voci.find(v => v.id === valore)
  if (trovata) return { voce: trovata, fuoriCatalogo: false }
  return { voce: riserva ?? { id: valore, testo: valore }, fuoriCatalogo: true }
}

/**
 * Righe per pagina nel download del catalogo. Le miniature dei profili pesano fino a ~37 KB
 * l'una: a 200 per pagina la risposta arrivava a 3,25 MB, vicino al limite di Vercel (4,5 MB).
 */
export function dimensionePagina(tabella: TabellaCatalogoLocale): number {
  return tabella === 'fp_sezioni' ? 40 : 200
}
