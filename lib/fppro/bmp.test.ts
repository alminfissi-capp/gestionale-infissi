import { describe, expect, it } from 'vitest'
import { bmpInRgba } from './bmp'

/** BMP non compresso: pixel in BGR(A), righe dal basso, ogni riga allineata a 4 byte. */
function creaBmp(larghezza: number, altezza: number, bpp: 24 | 32, pixel: [number, number, number][], dallAlto = false): Uint8Array {
  const byte = bpp / 8
  const passo = Math.ceil((larghezza * bpp) / 32) * 4
  const dati = new Uint8Array(54 + passo * altezza)
  const v = new DataView(dati.buffer)
  dati[0] = 0x42; dati[1] = 0x4d
  v.setUint32(2, dati.length, true)
  v.setUint32(10, 54, true)
  v.setUint32(14, 40, true)
  v.setInt32(18, larghezza, true)
  v.setInt32(22, dallAlto ? -altezza : altezza, true)
  v.setUint16(26, 1, true)
  v.setUint16(28, bpp, true)
  v.setUint32(30, 0, true)
  for (let y = 0; y < altezza; y++) {
    const riga = dallAlto ? y : altezza - 1 - y
    for (let x = 0; x < larghezza; x++) {
      const [r, g, b] = pixel[y * larghezza + x]
      const o = 54 + riga * passo + x * byte
      dati[o] = b; dati[o + 1] = g; dati[o + 2] = r
      if (bpp === 32) dati[o + 3] = 0 // FP PRO salva alfa a 0: va ignorato
    }
  }
  return dati
}

const ROSSO: [number, number, number] = [255, 0, 0]
const VERDE: [number, number, number] = [0, 255, 0]
const BLU: [number, number, number] = [0, 0, 255]
const BIANCO: [number, number, number] = [255, 255, 255]

describe('bmpInRgba', () => {
  it('32 bit dal basso (come FP PRO): pixel in ordine dall\'alto, alfa pieno', () => {
    const r = bmpInRgba(creaBmp(2, 2, 32, [ROSSO, VERDE, BLU, BIANCO]))
    expect([r.larghezza, r.altezza]).toEqual([2, 2])
    expect(Array.from(r.rgba)).toEqual([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255])
  })
  it('24 bit con righe da allineare (larghezza 3)', () => {
    const r = bmpInRgba(creaBmp(3, 1, 24, [ROSSO, VERDE, BLU]))
    expect(Array.from(r.rgba)).toEqual([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255])
  })
  it('altezza negativa = righe dall\'alto', () => {
    const r = bmpInRgba(creaBmp(1, 2, 24, [ROSSO, BLU], true))
    expect(Array.from(r.rgba)).toEqual([255, 0, 0, 255, 0, 0, 255, 255])
  })
  it('non e\' un BMP', () => {
    expect(() => bmpInRgba(new Uint8Array([1, 2, 3]))).toThrow(/BMP/)
  })
  it('BMP a 8 bit (con palette) non supportato', () => {
    const b = creaBmp(1, 1, 24, [ROSSO])
    new DataView(b.buffer).setUint16(28, 8, true)
    expect(() => bmpInRgba(b)).toThrow(/non supportato/)
  })
})
