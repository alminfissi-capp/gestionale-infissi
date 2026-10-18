import { describe, expect, it } from 'vitest'
import { profiliPer } from './profili-voce'
import type { TelaioLocale } from '@/types/rilievo-fp'

const p = (fp_id: number, serie: number, codice: string, utilizzi: number[]): TelaioLocale =>
  ({ fp_id, serie_fp_id: serie, codice, descrizione: null, utilizzi, presente: true, segno_server: '' })

describe('profiliPer', () => {
  it('filtra per serie e utilizzo, esclude i non presenti, ordina per codice', () => {
    const lista = [p(1, 12, 'B', [8050]), p(2, 12, 'A', [8090]), p(3, 13, 'C', [8050]), { ...p(4, 12, 'D', [8050]), presente: false }, p(5, 12, 'AA', [8050, 8390])]
    expect(profiliPer(lista, 12, [8050]).map(x => x.codice)).toEqual(['AA', 'B'])
    expect(profiliPer(lista, 12, [8090, 8100]).map(x => x.codice)).toEqual(['A'])
  })
  it('righe vecchie senza utilizzi: considerate telai (prima si scaricavano solo i telai)', () => {
    const vecchia = { ...p(5, 12, 'E', []), utilizzi: undefined as unknown as number[] }
    expect(profiliPer([vecchia], 12, [8050]).map(x => x.codice)).toEqual(['E'])
    expect(profiliPer([vecchia], 12, [8090])).toEqual([])
  })
  it('serie sconosciuta: elenco vuoto', () => {
    expect(profiliPer([p(1, 12, 'B', [8050])], null, [8050])).toEqual([])
  })
})
