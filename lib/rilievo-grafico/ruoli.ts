// Quali profili del catalogo FP PRO vanno bene per ogni pezzo: gli "utilizzi" del
// profilo (tabella tipi_utilizzi di FP PRO). Il filtro si puo' spegnere in ufficio.
import type { Assegnazione, Materiale, ProfiloCatalogo, RuoloPezzo } from '@/types/rilievo-grafico'
import type { DisegnoCalcolato } from './geometria'

export const UTILIZZI_RUOLO: Record<RuoloPezzo, number[]> = {
  // 8470 = telai speciali (imbotte, capannoni)
  telaio: [8050, 8470],
  montante: [8060],
  traverso: [8070],
  // 8410/8420 ante a vista e con pannello, 8490 ante a T, 8540 bilico
  anta: [8090, 8410, 8420, 8490, 8540],
  anta_scorrevole: [8100, 8101],
  riporto: [8150, 8160],
  fermavetro: [8180],
  fermapannello: [8270],
}

/** Doghe e lamelle sono profili "ovalina o doga" (8300) */
export const UTILIZZI_DOGHE = [8300]

export function profiliAdatti(profili: ProfiloCatalogo[], utilizzi: number[] | null, cerca: string): ProfiloCatalogo[] {
  const q = cerca.trim().toLowerCase()
  return profili
    .filter(p => !utilizzi || p.utilizzi.some(u => utilizzi.includes(u)))
    .filter(p => !q || p.codice.toLowerCase().includes(q) || (p.descrizione ?? '').toLowerCase().includes(q))
    .sort((a, b) => a.codice.localeCompare(b.codice))
}

export const NOMI_MATERIALE: Record<Materiale, string> = { vetro: 'Vetro', pannello: 'Pannello', doghe: 'Doghe', lamelle: 'Lamelle' }

/** Pezzi e riempimenti ancora senza assegnazione */
export function mancanti(c: DisegnoCalcolato, profili: Record<string, Assegnazione>, riempimenti: Record<string, Assegnazione>) {
  return {
    pezzi: c.pezzi.filter(p => !profili[p.id]).length,
    riempimenti: c.zone.filter(z => z.foglia && z.materiale && (!riempimenti[z.id] || (riempimenti[z.id].materiale && riempimenti[z.id].materiale !== z.materiale))).length,
    vuote: c.zone.filter(z => z.foglia && !z.materiale).length,
  }
}

/** Toglie le assegnazioni di pezzi e zone che non esistono piu' (struttura cambiata) */
export function potaAssegnazioni(
  c: DisegnoCalcolato, profili: Record<string, Assegnazione>, riempimenti: Record<string, Assegnazione>,
): { profili: Record<string, Assegnazione>; riempimenti: Record<string, Assegnazione> } {
  const pezzi = new Set(c.pezzi.map(p => p.id))
  const zone = new Map(c.zone.filter(z => z.foglia && z.materiale).map(z => [z.id, z.materiale]))
  return {
    profili: Object.fromEntries(Object.entries(profili).filter(([k]) => pezzi.has(k))),
    riempimenti: Object.fromEntries(Object.entries(riempimenti).filter(([k, a]) => zone.has(k) && (!a.materiale || a.materiale === zone.get(k)))),
  }
}
