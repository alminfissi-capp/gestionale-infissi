import { describe, expect, it } from 'vitest'
import { condizioneVera, misuraRif, type MisureRif } from './misure-riferimento'

// Finestra 2 ante 1512 x 2260: anta 1 = principale (maniglia), anta 2 = passiva
const m: MisureRif = {
  L: 1512, H: 2260, peso: 120,
  ante: [{ l: 756, h: 2260, peso: 45 }, { l: 756, h: 2260, peso: 41 }],
  scorrevoli: [],
}

describe('misure di riferimento di FP PRO', () => {
  it('1 = H, 2 = L, 3 = perimetro, 4 = 2H + L', () => {
    expect(misuraRif(1, m)).toBe(2260)
    expect(misuraRif(2, m)).toBe(1512)
    expect(misuraRif(3, m)).toBe(2 * (1512 + 2260))
    expect(misuraRif(4, m)).toBe(2 * 2260 + 1512)
  })
  it('1xx larghezza, 2xx peso, 3xx altezza, 4xx larghezza anta n', () => {
    expect(misuraRif(101, m)).toBe(756)
    expect(misuraRif(201, m)).toBe(45)
    expect(misuraRif(202, m)).toBe(41)
    expect(misuraRif(301, m)).toBe(2260)
    expect(misuraRif(402, m)).toBe(756)
  })
  it('anta che non esiste (anta 3 su 2 ante): nessuna misura', () => expect(misuraRif(103, m)).toBeNull())
  it('200 = peso del vano', () => expect(misuraRif(200, m)).toBe(120))
  it('scorrevole: 22 larghezza, 23 peso, 24 altezza della prima anta scorrevole', () => {
    const s: MisureRif = { ...m, scorrevoli: [{ l: 946, h: 2274, peso: 60 }] }
    expect(misuraRif(22, s)).toBe(946)
    expect(misuraRif(23, s)).toBe(60)
    expect(misuraRif(24, s)).toBe(2274)
  })
  it('codice sconosciuto: null (mai "altezza")', () => expect(misuraRif(999, m)).toBeNull())
})

describe('condizione di una riga', () => {
  it('dentro la fascia: vera; fuori: falsa', () => {
    expect(condizioneVera({ dim: 201, min: 1, max: 100 }, m)).toEqual({ vera: true })
    expect(condizioneVera({ dim: 201, min: 100.1, max: 150 }, m)).toEqual({ vera: false })
  })
  it('condizione senza fascia: sempre vera', () => expect(condizioneVera({ dim: 201, min: null, max: null }, m)).toEqual({ vera: true }))
  it('anta passiva assente: la riga della passiva non vale', () => {
    const una: MisureRif = { ...m, ante: [{ l: 675, h: 1342, peso: 30 }] }
    expect(condizioneVera({ dim: 202, min: 1, max: 100 }, una)).toEqual({ vera: false })
  })
  it('codice sconosciuto con fascia: falsa e segnalata', () => {
    expect(condizioneVera({ dim: 999, min: 1, max: 10 }, m)).toEqual({ vera: false, ignoto: 999 })
  })
})

describe('codici 901-904: numero di ante del nodo (A4011.20 x2 su 902, x4 su 903, x6 su 904)', () => {
  const ante = (k: number): MisureRif => ({ ...m, ante: Array.from({ length: k }, () => ({ l: 500, h: 1300, peso: 30 })) })
  it('902 vale solo con 2 ante', () => {
    expect(condizioneVera({ dim: 902, min: null, max: null }, ante(1)).vera).toBe(false)
    expect(condizioneVera({ dim: 902, min: null, max: null }, ante(2)).vera).toBe(true)
    expect(condizioneVera({ dim: 902, min: null, max: null }, ante(3)).vera).toBe(false)
  })
  it('903 con 3 ante, 904 con 4, 901 con una', () => {
    expect(condizioneVera({ dim: 903, min: 0, max: 0 }, ante(3)).vera).toBe(true)
    expect(condizioneVera({ dim: 904, min: null, max: null }, ante(4)).vera).toBe(true)
    expect(condizioneVera({ dim: 901, min: null, max: null }, ante(1)).vera).toBe(true)
    expect(condizioneVera({ dim: 901, min: null, max: null }, ante(2)).vera).toBe(false)
  })
})
