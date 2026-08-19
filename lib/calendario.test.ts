// lib/calendario.test.ts
import { describe, it, expect } from 'vitest'
import {
  minutiDaOra,
  oraDaMinuti,
  indiceGiornoSettimana,
  statoGiorno,
  fasciaGriglia,
} from '@/lib/calendario'
import { ORARI_LAVORO_DEFAULT } from '@/types/calendario'
import type { Chiusura, OrariLavoro } from '@/types/calendario'

const chiusura = (
  data_inizio: string,
  data_fine: string,
  descrizione: string
): Chiusura => ({
  id: 'x', organization_id: 'o', data_inizio, data_fine, descrizione, created_at: '',
})

describe('minutiDaOra', () => {
  it('converte HH:MM in minuti dalla mezzanotte', () => {
    expect(minutiDaOra('08:00')).toBe(480)
    expect(minutiDaOra('12:30')).toBe(750)
  })

  it('accetta il formato HH:MM:SS che arriva da Postgres', () => {
    expect(minutiDaOra('08:00:00')).toBe(480)
  })
})

describe('oraDaMinuti', () => {
  it('converte i minuti in HH:MM con lo zero davanti', () => {
    expect(oraDaMinuti(480)).toBe('08:00')
    expect(oraDaMinuti(750)).toBe('12:30')
  })
})

describe('indiceGiornoSettimana', () => {
  it('usa 0 per lunedi e 6 per domenica', () => {
    // 2026-08-17 e' un lunedi
    expect(indiceGiornoSettimana('2026-08-17')).toBe(0)
    expect(indiceGiornoSettimana('2026-08-22')).toBe(5) // sabato
    expect(indiceGiornoSettimana('2026-08-23')).toBe(6) // domenica
  })
})

describe('statoGiorno', () => {
  it('e aperto in un giorno feriale', () => {
    const s = statoGiorno('2026-08-17', ORARI_LAVORO_DEFAULT, [])
    expect(s).toEqual({
      aperto: true, apertura: '08:00', chiusura: '19:00', motivoChiusura: null,
    })
  })

  it('il sabato chiude a mezzogiorno e mezzo', () => {
    const s = statoGiorno('2026-08-22', ORARI_LAVORO_DEFAULT, [])
    expect(s.aperto).toBe(true)
    expect(s.chiusura).toBe('12:30')
  })

  it('la domenica e chiusa e lo dice', () => {
    const s = statoGiorno('2026-08-23', ORARI_LAVORO_DEFAULT, [])
    expect(s.aperto).toBe(false)
    expect(s.motivoChiusura).toBe('Domenica')
  })

  it('una chiusura chiude anche un giorno feriale, con la sua descrizione', () => {
    const s = statoGiorno('2026-08-18', ORARI_LAVORO_DEFAULT, [
      chiusura('2026-08-10', '2026-08-24', 'Ferie estive'),
    ])
    expect(s.aperto).toBe(false)
    expect(s.motivoChiusura).toBe('Ferie estive')
  })

  it('una chiusura fuori intervallo non tocca il giorno', () => {
    const s = statoGiorno('2026-08-18', ORARI_LAVORO_DEFAULT, [
      chiusura('2026-12-25', '2026-12-25', 'Natale'),
    ])
    expect(s.aperto).toBe(true)
  })
})

describe('fasciaGriglia', () => {
  it('va dalla apertura piu presto alla chiusura piu tardi dei giorni aperti', () => {
    expect(fasciaGriglia(ORARI_LAVORO_DEFAULT)).toEqual({ inizio: '08:00', fine: '19:00' })
  })

  it('ignora i giorni chiusi nel calcolo', () => {
    const orari: OrariLavoro = ORARI_LAVORO_DEFAULT.map((g, i) =>
      i === 6 ? { aperto: false, apertura: '05:00', chiusura: '23:00' } : g
    )
    expect(fasciaGriglia(orari)).toEqual({ inizio: '08:00', fine: '19:00' })
  })

  it('si allarga se un giorno apre prima', () => {
    const orari: OrariLavoro = ORARI_LAVORO_DEFAULT.map((g, i) =>
      i === 0 ? { ...g, apertura: '07:30' } : g
    )
    expect(fasciaGriglia(orari).inizio).toBe('07:30')
  })
})
