// lib/calendario.test.ts
import { describe, it, expect } from 'vitest'
import {
  minutiDaOra,
  oraDaMinuti,
  indiceGiornoSettimana,
  statoGiorno,
  fasciaGriglia,
  posizioneBarra,
  impilaEventi,
  snapMinuti,
  etichettaEvento,
  espandiCatena,
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

const fascia = { inizio: '08:00', fine: '19:00' } // 660 minuti

describe('posizioneBarra', () => {
  it('un evento che parte all apertura inizia a sinistra', () => {
    const p = posizioneBarra('08:00', '09:00', fascia)
    expect(p.sinistraPct).toBeCloseTo(0)
    expect(p.larghezzaPct).toBeCloseTo((60 / 660) * 100)
  })

  it('un evento a meta giornata e posizionato in proporzione', () => {
    const p = posizioneBarra('13:00', '14:00', fascia)
    expect(p.sinistraPct).toBeCloseTo((300 / 660) * 100)
  })

  it('taglia un evento che sborda oltre la fine della griglia', () => {
    const p = posizioneBarra('18:00', '21:00', fascia)
    expect(p.sinistraPct + p.larghezzaPct).toBeCloseTo(100)
  })

  it('taglia un evento che inizia prima della griglia', () => {
    const p = posizioneBarra('06:00', '09:00', fascia)
    expect(p.sinistraPct).toBe(0)
    expect(p.larghezzaPct).toBeCloseTo((60 / 660) * 100)
  })
})

describe('impilaEventi', () => {
  const ev = (id: string, ora_inizio: string, ora_fine: string) =>
    ({ id, ora_inizio, ora_fine })

  it('mette su una sola riga eventi che non si sovrappongono', () => {
    const righe = impilaEventi([ev('a', '08:00', '10:00'), ev('b', '10:00', '12:00')])
    expect(righe.map((r) => r.riga)).toEqual([0, 0])
  })

  it('impila gli eventi sovrapposti su righe diverse', () => {
    const righe = impilaEventi([ev('a', '08:00', '12:00'), ev('b', '09:00', '10:00')])
    expect(righe.find((r) => r.id === 'a')!.riga).toBe(0)
    expect(righe.find((r) => r.id === 'b')!.riga).toBe(1)
  })

  it('riusa la prima riga libera invece di aprirne sempre una nuova', () => {
    const righe = impilaEventi([
      ev('a', '08:00', '12:00'),
      ev('b', '09:00', '10:00'),
      ev('c', '10:30', '11:00'),
    ])
    expect(righe.find((r) => r.id === 'c')!.riga).toBe(1)
  })

  it('ordina per ora di inizio anche se arrivano in disordine', () => {
    const righe = impilaEventi([ev('b', '10:00', '11:00'), ev('a', '08:00', '09:00')])
    expect(righe[0].id).toBe('a')
  })
})

describe('snapMinuti', () => {
  it('arrotonda al passo di 30 minuti piu vicino', () => {
    expect(snapMinuti(497)).toBe(510)
    expect(snapMinuti(492)).toBe(480)
  })

  it('accetta un passo diverso', () => {
    expect(snapMinuti(497, 15)).toBe(495)
  })
})

describe('etichettaEvento', () => {
  it('compone tipo e cliente come sul foglio in officina', () => {
    expect(
      etichettaEvento({
        tipo: 'lavorazione',
        titolo: null,
        cliente_nome: 'MARCELLO ZAMUELI',
        fornitore_nome: null,
      })
    ).toBe('Lavorazione ---MARCELLO ZAMUELI---')
  })

  it('infila il fornitore fra tipo e cliente nelle ricezioni', () => {
    expect(
      etichettaEvento({
        tipo: 'ricez_vetri',
        titolo: null,
        cliente_nome: 'SPAGNA',
        fornitore_nome: 'METALVETRO',
      })
    ).toBe('Ricez. Vetri METALVETRO ---SPAGNA---')
  })

  it('usa il titolo quando non c e un cliente', () => {
    expect(
      etichettaEvento({
        tipo: 'promemoria',
        titolo: 'Chiamare il commercialista',
        cliente_nome: null,
        fornitore_nome: null,
      })
    ).toBe('Chiamare il commercialista')
  })

  it('ripiega sull etichetta del tipo se non c e altro', () => {
    expect(
      etichettaEvento({ tipo: 'carico', titolo: null, cliente_nome: null, fornitore_nome: null })
    ).toBe('Carico/Imballo/Trasp.')
  })
})

describe('espandiCatena', () => {
  it('genera un giorno per volta a partire dalla data di inizio', () => {
    const giorni = espandiCatena('2026-08-17', 3, '08:00', '17:30', ORARI_LAVORO_DEFAULT, [])
    expect(giorni.map((g) => g.data)).toEqual(['2026-08-17', '2026-08-18', '2026-08-19'])
    expect(giorni[0]).toEqual({ data: '2026-08-17', ora_inizio: '08:00', ora_fine: '17:30' })
  })

  it('salta i giorni chiusi senza consumarli dal conteggio', () => {
    // 2026-08-21 e' venerdi, 22 sabato, 23 domenica, 24 lunedi
    const giorni = espandiCatena('2026-08-21', 3, '08:00', '17:30', ORARI_LAVORO_DEFAULT, [])
    expect(giorni.map((g) => g.data)).toEqual(['2026-08-21', '2026-08-22', '2026-08-24'])
  })

  it('accorcia l orario di fine se il giorno chiude prima', () => {
    const giorni = espandiCatena('2026-08-22', 1, '08:00', '17:30', ORARI_LAVORO_DEFAULT, [])
    expect(giorni[0].ora_fine).toBe('12:30')
  })

  it('salta anche le chiusure straordinarie', () => {
    const giorni = espandiCatena('2026-08-17', 2, '08:00', '17:30', ORARI_LAVORO_DEFAULT, [
      chiusura('2026-08-18', '2026-08-18', 'Ponte'),
    ])
    expect(giorni.map((g) => g.data)).toEqual(['2026-08-17', '2026-08-19'])
  })
})
