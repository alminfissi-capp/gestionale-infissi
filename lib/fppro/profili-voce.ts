// Profili della serie da offrire nella voce del rilievo: telai (8050) o ante (8090
// battente, 8100 scorrevole), presi dagli "utilizzi" di FP PRO.
import type { TelaioLocale } from '@/types/rilievo-fp'

export const UTILIZZO_TELAIO = 8050
export const UTILIZZI_ANTA = [8090, 8100]

export function profiliPer(profili: TelaioLocale[], serieFpId: number | null | undefined, utilizzi: number[]): TelaioLocale[] {
  if (serieFpId === null || serieFpId === undefined) return []
  return profili
    .filter(p => p.presente && p.serie_fp_id === serieFpId)
    // Catalogo scaricato prima dell'aggiornamento: righe senza utilizzi = solo telai.
    .filter(p => (p.utilizzi ?? [UTILIZZO_TELAIO]).some(u => utilizzi.includes(u)))
    .sort((a, b) => a.codice.localeCompare(b.codice))
}
