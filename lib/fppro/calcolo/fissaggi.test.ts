import { describe, expect, it } from 'vitest'
import { fissaggiPredefiniti } from './fissaggi'

// Telaio UP61802 della serie 14 (PLANET 62): filtri con ordine 1, 2, 4 (dati veri di FP PRO, ridotti).
const fissaggi = [
  { codice_profilo: 'UP61802', codice_accessorio: 'ACP 5008', serie_fp_id: 14, quantita: 1, dim_rif: 1, filtro: 'A1' },
  { codice_profilo: 'UP61802', codice_accessorio: 'ACP 5801M', serie_fp_id: 14, quantita: 1, dim_rif: 1, filtro: 'A1' },
  { codice_profilo: 'UP61802', codice_accessorio: 'ACP 50153', serie_fp_id: 14, quantita: 1, dim_rif: 1, filtro: 'B1' },
  { codice_profilo: 'UP61802', codice_accessorio: 'ACP 5800', serie_fp_id: 14, quantita: 2, dim_rif: 1, filtro: 'C2' },
  { codice_profilo: 'UP61802', codice_accessorio: 'ACP 5002', serie_fp_id: 14, quantita: 1, dim_rif: 1, filtro: 'D4' },
]
const serie = [
  { serie_fp_id: 14, ordine: 1, filtro: 'A1' }, { serie_fp_id: 14, ordine: 1, filtro: 'B1' },
  { serie_fp_id: 14, ordine: 2, filtro: 'C2' }, { serie_fp_id: 14, ordine: 4, filtro: 'D4' },
]

describe('fissaggiPredefiniti: sistema di giunzione con l\'ordine piu\' basso della serie', () => {
  const f = fissaggiPredefiniti(fissaggi, serie)
  it('solo i filtri con ordine 1 (squadrette cianfrinare + allineamento)', () => {
    expect(f('UP61802').map(x => x.codice)).toEqual(['ACP 5008', 'ACP 5801M', 'ACP 50153'])
  })
  it('profilo senza fissaggi: niente', () => expect(f('XX')).toEqual([]))
  it('stessa riga ripetuta: contata una volta', () => {
    expect(fissaggiPredefiniti([...fissaggi, fissaggi[0]], serie)('UP61802').filter(x => x.codice === 'ACP 5008')).toHaveLength(1)
  })
})
