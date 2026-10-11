import { describe, expect, it } from 'vitest'
import { sezioneDaDxf } from './dxf-sezione'

/** DXF minimo come quelli di FP PRO: entita' LINE + ATTDEF con i punti di riferimento. */
function dxf(punti: Record<string, [number, number]>, righe = '0\r\nLINE\r\n8\r\n0\r\n10\r\n0\r\n20\r\n0\r\n11\r\n80\r\n21\r\n68.7\r\n'): string {
  const attdef = Object.entries(punti).map(([tag, [x, y]]) =>
    `0\r\nATTDEF\r\n8\r\n0\r\n10\r\n${x}\r\n20\r\n${y}\r\n1\r\n\r\n2\r\n${tag}\r\n`).join('')
  return `0\r\nSECTION\r\n2\r\nENTITIES\r\n${righe}${attdef}0\r\nENDSEC\r\n0\r\nEOF\r\n`
}

describe('sezioneDaDxf', () => {
  it('telaio TT8002: in vista 46,7, aletta 22 (come la lista di taglio di FP PRO)', () => {
    const s = sezioneDaDxf(dxf({
      VC_START: [3189.726783, 1338.090896], VC_END: [3188.027831, 1291.390896], FP_LCS_ORIG: [3187.427831, 1269.390896],
    }))
    expect(s).toEqual({ vista: 46.7, aletta: 22 })
  })
  it('anta TT8011 senza aletta: in vista 78', () => {
    expect(sezioneDaDxf(dxf({ VC_START: [2956.48, 1356.377521], VC_END: [2957.28, 1278.377421], FP_LCS_ORIG: [2953.48, 1278.377421] })))
      .toEqual({ vista: 78, aletta: 0 })
  })
  it('VC in ordine inverso: stessa misura', () => {
    expect(sezioneDaDxf(dxf({ VC_START: [0.3, 12], VC_END: [1.5, 0], FP_LCS_ORIG: [0, 0] }))).toEqual({ vista: 12, aletta: 0 })
  })
  it('senza punti di riferimento o con file non DXF: null', () => {
    expect(sezioneDaDxf(dxf({}))).toBeNull()
    expect(sezioneDaDxf('ciao')).toBeNull()
    expect(sezioneDaDxf(dxf({ VC_START: [0, 5], VC_END: [0, 5], FP_LCS_ORIG: [0, 0] }))).toBeNull()
  })
  it('senza FP_LCS_ORIG: aletta 0', () => {
    expect(sezioneDaDxf(dxf({ VC_START: [0, 70], VC_END: [0, 20] }))).toEqual({ vista: 50, aletta: 0 })
  })
})
