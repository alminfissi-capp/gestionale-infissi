import { describe, expect, it } from 'vitest'
import { accostamentiDaCampione, applicaAccostamenti } from './accostamenti'
import { LARGHEZZE_PREDEFINITE, pezziECampi } from './geometria'
import type { NodoStruttura, PezzoStruttura } from '../strutture-xml'

const pezzo = (tipo: number, dxf: string, indice = 0, reale?: PezzoStruttura['reale']): PezzoStruttura =>
  ({ tipo, dxf, serie: 'AL_62UP', indice, ...(reale ? { reale } : {}) })
const nodo = (tipo: number, codice: number, pezzi: PezzoStruttura[], figli: NodoStruttura[] = [], elementi = 1): NodoStruttura =>
  ({ tipo, codice, elementi, x: null, y: null, prm: [], macro: null, ante: [], ird: [], pezzi, accessori: [], kit: [], figli })

// Sezioni come i DXF: telaio UP61833 vista 50, anta UP61851 vista 28.
const sezione = (dxf: string) => (dxf.includes('UP61833') ? { vista: 50, aletta: 0 } : dxf.includes('UP61851') ? { vista: 28, aletta: 0 } : null)

// PLANET62UPCVI PF2A di 11-2026G voce 3 (1480 x 2410) come la scrive FP PRO nel file JOB.
function campione(): NodoStruttura[] {
  const anta = (i: number, x0: number) => [
    pezzo(8090, 'AL_62UP\\UP61851.DXF', i, { x: x0, y: 2348.5, l: 28, h: 2287 }),
    pezzo(8090, 'AL_62UP\\UP61851.DXF', i, { x: x0, y: 2348.5, l: 658.45, h: 28 }),
    pezzo(8090, 'AL_62UP\\UP61851.DXF', i, { x: x0 + 630.45, y: 2348.5, l: 28, h: 2287 }),
    pezzo(8090, 'AL_62UP\\UP61851.DXF', i, { x: x0, y: 89.5, l: 658.45, h: 28 }),
  ]
  const vetro = (codice: number) => nodo(8650, codice, [pezzo(8510, 'GLASSES\\33_20_33S+A.DXF', 0, { x: 0, y: 0, l: 585.45, h: 2214 })])
  const telaio = Array.from({ length: 4 }, () => pezzo(8050, 'AL_62UP\\UP61833.DXF'))
  return [nodo(8600, 1, telaio, [nodo(8610, 2, [...anta(0, 61.5), ...anta(1, 760.05)], [vetro(3), vetro(4)], 2)])]
}

describe('accostamenti di FP PRO', () => {
  it('legge bordi, fuga delle ante e riduzione del vetro dalla commessa calcolata', () => {
    const acc = accostamentiDaCampione(campione(), { L: 1480, H: 2410 }, LARGHEZZE_PREDEFINITE, sezione)
    expect(acc[2].ante).toEqual({ sx: 11.5, dx: 11.5, basso: 11.5, alto: 11.5, fuga: 40.1 })
    expect(acc[3].riempimento).toEqual({ l: 17, h: 17 })
  })

  it('a un\'altra misura ante e vetri seguono gli stessi accostamenti', () => {
    const acc = accostamentiDaCampione(campione(), { L: 1480, H: 2410 }, LARGHEZZE_PREDEFINITE, sezione)
    const albero = applicaAccostamenti(campione(), acc)
    const { campi } = pezziECampi(albero, { L: 1480, H: 2404, L0: 1480, H0: 2404, quote: {} }, LARGHEZZE_PREDEFINITE, sezione)
    // 11-2026G voce 11: FP PRO 585 x 2208
    expect(Math.round(campi[0].l)).toBe(585)
    expect(Math.round(campi[0].h)).toBe(2208)
  })

  it('senza accostamento resta la stima di WinStudio', () => {
    const { campi } = pezziECampi(campione(), { L: 1480, H: 2410, L0: 1480, H0: 2410, quote: {} }, LARGHEZZE_PREDEFINITE, sezione)
    expect(Math.round(campi[0].l)).toBe(659)
  })
})
