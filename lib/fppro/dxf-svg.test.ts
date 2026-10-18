import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dxfInSvg } from './dxf-svg'

const dxf = (...righe: (string | number)[]) => ['0', 'SECTION', '2', 'ENTITIES', ...righe.map(String), '0', 'ENDSEC', '0', 'EOF'].join('\r\n')

describe('dxfInSvg', () => {
  it('LINE -> segmento, y ribaltata', () => {
    const r = dxfInSvg(dxf(0, 'LINE', 8, 0, 10, 0, 20, 0, 11, 10, 21, 5))
    expect(r?.d).toBe('M0 0L10 -5')
    expect(r?.viewBox).toBe('0 -5 10 5')
  })
  it('ARC -> arco SVG (antiorario nel DXF = sweep 0 con la y ribaltata)', () => {
    const r = dxfInSvg(dxf(0, 'ARC', 10, 0, 20, 0, 40, 10, 50, 0, 51, 90))
    expect(r?.d).toBe('M10 0A10 10 0 0 0 0 -10')
  })
  it('ARC oltre 180 gradi e che passa per 0: large-arc 1 e riquadro con gli estremi', () => {
    const r = dxfInSvg(dxf(0, 'ARC', 10, 0, 20, 0, 40, 10, 50, 300, 51, 240))
    expect(r?.d).toMatch(/A10 10 0 1 0 /)
    // Passa per 0, 90 e 180 gradi ma non per 270: in basso si ferma a 240 (y 8,66)
    expect(r?.viewBox).toBe('-10 -10 20 18.7')
  })
  it('LWPOLYLINE chiusa', () => {
    const r = dxfInSvg(dxf(0, 'LWPOLYLINE', 90, 3, 70, 1, 10, 0, 20, 0, 10, 4, 20, 0, 10, 4, 20, 3))
    expect(r?.d).toBe('M0 0L4 0L4 -3Z')
  })
  it('CIRCLE -> due mezzi archi', () => {
    expect(dxfInSvg(dxf(0, 'CIRCLE', 10, 0, 20, 0, 40, 2))?.d).toBe('M2 0A2 2 0 1 0 -2 0A2 2 0 1 0 2 0')
  })
  it('ignora ATTDEF e testo: null senza geometria', () => {
    expect(dxfInSvg(dxf(0, 'ATTDEF', 10, 1, 20, 1, 2, 'VC_START'))).toBeNull()
    expect(dxfInSvg('')).toBeNull()
  })
  it('DXF reale di FP PRO (UP61802): path con linee e archi, riquadro finito, sotto i 40.000 caratteri', () => {
    const r = dxfInSvg(readFileSync(new URL('./__fixtures__/profilo-UP61802.dxf', import.meta.url), 'latin1'))
    expect(r).not.toBeNull()
    expect(r!.d).toMatch(/A/)
    expect(r!.d.length).toBeGreaterThan(1000)
    expect(r!.d.length).toBeLessThan(40000)
    const [, , w, h] = r!.viewBox.split(' ').map(Number)
    expect(w > 10 && w < 300 && h > 10 && h < 300).toBe(true)
  })
})
