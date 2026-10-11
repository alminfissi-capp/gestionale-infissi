/**
 * BMP non compresso (16 bit RGB555, 24 o 32 bit) -> pixel RGBA dall'alto in basso.
 * Usato dal ponte (Node, senza build) per convertire l'immagine che FP PRO salva
 * dentro ogni .STR (300x300, 32 bit, alfa a 0): nessun import.
 */
export function bmpInRgba(b: Uint8Array): { larghezza: number; altezza: number; rgba: Uint8Array } {
  if (b.length < 54 || b[0] !== 0x42 || b[1] !== 0x4d) throw new Error('Immagine non valida: non e\' un BMP')
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const inizio = v.getUint32(10, true)
  const larghezza = v.getInt32(18, true)
  const altezzaGrezza = v.getInt32(22, true)
  const bpp = v.getUint16(28, true)
  const compressione = v.getUint32(30, true)
  if (compressione !== 0 || (bpp !== 16 && bpp !== 24 && bpp !== 32)) {
    throw new Error(`BMP non supportato: ${bpp} bit, compressione ${compressione}`)
  }
  const altezza = Math.abs(altezzaGrezza)
  const dalBasso = altezzaGrezza > 0
  const passo = Math.ceil((larghezza * bpp) / 32) * 4
  const byte = bpp / 8
  if (inizio + passo * altezza > b.length) throw new Error('BMP troncato')

  const rgba = new Uint8Array(larghezza * altezza * 4)
  for (let y = 0; y < altezza; y++) {
    const riga = dalBasso ? altezza - 1 - y : y
    for (let x = 0; x < larghezza; x++) {
      const s = inizio + riga * passo + x * byte
      const d = (y * larghezza + x) * 4
      if (bpp === 16) {
        // RGB555 (strutture salvate con versioni vecchie di FP PRO): 5 bit per canale
        const p = b[s] | (b[s + 1] << 8)
        rgba[d] = Math.round((((p >> 10) & 31) * 255) / 31)
        rgba[d + 1] = Math.round((((p >> 5) & 31) * 255) / 31)
        rgba[d + 2] = Math.round(((p & 31) * 255) / 31)
      } else {
        rgba[d] = b[s + 2]
        rgba[d + 1] = b[s + 1]
        rgba[d + 2] = b[s]
      }
      rgba[d + 3] = 255
    }
  }
  return { larghezza, altezza, rgba }
}
