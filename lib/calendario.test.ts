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
  aggiungiGiorni,
  settimanaDi,
  settimaneDelMese,
  raggruppaPerGiorno,
  messaggioAppuntamento,
} from '@/lib/calendario'
import { ASPETTO_TIPO, ORARI_LAVORO_DEFAULT } from '@/types/calendario'
import type { Chiusura, OrariLavoro } from '@/types/calendario'

/** Gli aspetti di partenza, nella forma mappa usata dai componenti. */
const ASPETTI = Object.fromEntries(
  Object.entries(ASPETTO_TIPO).map(([chiave, a]) => [chiave, a])
)

const chiusura = (
  data_inizio: string,
  data_fine: string,
  descrizione: string,
  ricorrente = false
): Chiusura => ({
  id: 'x', organization_id: 'o', data_inizio, data_fine, descrizione,
  ricorrente, created_at: '',
})

/** Festivita' fissa: l'anno memorizzato (2000) non conta, contano giorno e mese. */
const festivita = (
  giornoMeseInizio: string,
  giornoMeseFine: string,
  descrizione: string
): Chiusura => chiusura(`2000-${giornoMeseInizio}`, `2000-${giornoMeseFine}`, descrizione, true)

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
    // Il tipo e' un'unione discriminata: gli orari esistono solo se aperto.
    if (!s.aperto) throw new Error('il sabato deve risultare aperto')
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
      }, ASPETTI)
    ).toBe('Lavorazione ---MARCELLO ZAMUELI---')
  })

  it('infila il fornitore fra tipo e cliente nelle ricezioni', () => {
    expect(
      etichettaEvento({
        tipo: 'ricez_vetri',
        titolo: null,
        cliente_nome: 'SPAGNA',
        fornitore_nome: 'METALVETRO',
      }, ASPETTI)
    ).toBe('Ricez. Vetri METALVETRO ---SPAGNA---')
  })

  it('usa il titolo quando non c e un cliente', () => {
    expect(
      etichettaEvento({
        tipo: 'promemoria',
        titolo: 'Chiamare il commercialista',
        cliente_nome: null,
        fornitore_nome: null,
      }, ASPETTI)
    ).toBe('Chiamare il commercialista')
  })

  it('ripiega sull etichetta del tipo se non c e altro', () => {
    expect(
      etichettaEvento(
        { tipo: 'carico', titolo: null, cliente_nome: null, fornitore_nome: null },
        ASPETTI
      )
    ).toBe('Carico/Imballo/Trasp.')
  })

  it('un tipo non piu in anagrafica non fa saltare la barra', () => {
    expect(
      etichettaEvento(
        { tipo: 'tipo_sparito', titolo: null, cliente_nome: null, fornitore_nome: null },
        ASPETTI
      )
    ).toBe('Attività')
  })

  it('usa il nome personalizzato dall organizzazione', () => {
    expect(
      etichettaEvento(
        { tipo: 'posa', titolo: null, cliente_nome: 'V.TERESI', fornitore_nome: null },
        { ...ASPETTI, posa: { label: 'Montaggio', sfondo: '#A6D64B', testo: '#152300' } }
      )
    ).toBe('Montaggio ---V.TERESI---')
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

// --- Casi limite segnalati dalla revisione della logica pura ---

describe('casi limite', () => {
  it('fasciaGriglia ripiega su 08:00-19:00 se non c e nessun giorno aperto', () => {
    const tuttoChiuso: OrariLavoro = ORARI_LAVORO_DEFAULT.map((g) => ({ ...g, aperto: false }))
    expect(fasciaGriglia(tuttoChiuso)).toEqual({ inizio: '08:00', fine: '19:00' })
  })

  it('impilaEventi su lista vuota non esplode', () => {
    expect(impilaEventi([])).toEqual([])
  })

  it('espandiCatena torna vuoto se ogni giorno e chiuso', () => {
    const tuttoChiuso: OrariLavoro = ORARI_LAVORO_DEFAULT.map((g) => ({ ...g, aperto: false }))
    expect(espandiCatena('2026-08-17', 3, '08:00', '17:30', tuttoChiuso, [])).toEqual([])
  })

  it('espandiCatena tronca quando i giorni lavorativi non bastano', () => {
    // Una chiusura lunghissima lascia disponibile solo il primo giorno.
    const giorni = espandiCatena('2026-08-17', 5, '08:00', '17:30', ORARI_LAVORO_DEFAULT, [
      chiusura('2026-08-18', '2028-08-18', 'Chiusura infinita'),
    ])
    expect(giorni).toHaveLength(1)
  })

  it('etichettaEvento ignora un cliente fatto di soli spazi', () => {
    expect(
      etichettaEvento({
        tipo: 'lavorazione',
        titolo: 'Ripasso serramenti',
        cliente_nome: '   ',
        fornitore_nome: null,
      }, ASPETTI)
    ).toBe('Ripasso serramenti')
  })
})

describe('statoGiorno con chiusure ricorrenti', () => {
  it('una festivita ricorrente torna ogni anno', () => {
    const natale = [festivita('12-25', '12-25', 'Natale')]
    expect(statoGiorno('2026-12-25', ORARI_LAVORO_DEFAULT, natale)).toEqual({
      aperto: false, motivoChiusura: 'Natale',
    })
    expect(statoGiorno('2031-12-25', ORARI_LAVORO_DEFAULT, natale)).toEqual({
      aperto: false, motivoChiusura: 'Natale',
    })
  })

  it('una festivita ricorrente non tocca gli altri giorni', () => {
    const s = statoGiorno('2026-12-23', ORARI_LAVORO_DEFAULT, [
      festivita('12-25', '12-25', 'Natale'),
    ])
    expect(s.aperto).toBe(true)
  })

  it('un intervallo ricorrente a cavallo di capodanno copre i due tronconi', () => {
    const feste = [festivita('12-24', '01-06', 'Feste natalizie')]
    expect(statoGiorno('2026-12-31', ORARI_LAVORO_DEFAULT, feste).aperto).toBe(false)
    expect(statoGiorno('2027-01-02', ORARI_LAVORO_DEFAULT, feste).aperto).toBe(false)
    // Fuori intervallo: meta' gennaio e meta' dicembre restano aperti.
    expect(statoGiorno('2027-01-15', ORARI_LAVORO_DEFAULT, feste).aperto).toBe(true)
    expect(statoGiorno('2026-12-15', ORARI_LAVORO_DEFAULT, feste).aperto).toBe(true)
  })

  it('una chiusura non ricorrente resta legata al suo anno', () => {
    const ferie = [chiusura('2026-08-10', '2026-08-24', 'Ferie estive')]
    expect(statoGiorno('2026-08-12', ORARI_LAVORO_DEFAULT, ferie).aperto).toBe(false)
    expect(statoGiorno('2027-08-12', ORARI_LAVORO_DEFAULT, ferie).aperto).toBe(true)
  })

  it('il 29 febbraio ricorrente vale negli anni bisestili', () => {
    const s = statoGiorno('2028-02-29', ORARI_LAVORO_DEFAULT, [
      festivita('02-29', '02-29', 'Giorno in piu'),
    ])
    expect(s).toEqual({ aperto: false, motivoChiusura: 'Giorno in piu' })
  })
})

describe('aggiungiGiorni', () => {
  it('somma e sottrae restando in formato YYYY-MM-DD', () => {
    expect(aggiungiGiorni('2026-08-19', 1)).toBe('2026-08-20')
    expect(aggiungiGiorni('2026-08-01', -1)).toBe('2026-07-31')
  })

  it('scavalca il capodanno e regge il 29 febbraio', () => {
    expect(aggiungiGiorni('2026-12-31', 1)).toBe('2027-01-01')
    expect(aggiungiGiorni('2028-02-28', 1)).toBe('2028-02-29')
  })
})

describe('settimanaDi', () => {
  it('parte sempre da lunedi e finisce di domenica', () => {
    // Il 19 agosto 2026 e' un mercoledi.
    expect(settimanaDi('2026-08-19')).toEqual([
      '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20',
      '2026-08-21', '2026-08-22', '2026-08-23',
    ])
  })

  it('di domenica resta nella settimana che si sta chiudendo', () => {
    const s = settimanaDi('2026-08-23')
    expect(s[0]).toBe('2026-08-17')
    expect(s[6]).toBe('2026-08-23')
  })
})

describe('settimaneDelMese', () => {
  it('restituisce settimane intere che coprono tutto il mese', () => {
    const settimane = settimaneDelMese(2026, 8)
    expect(settimane.every((s) => s.length === 7)).toBe(true)
    // Il 1 agosto 2026 e' un sabato: la prima settimana inizia il 27 luglio.
    expect(settimane[0][0]).toBe('2026-07-27')
    const ultima = settimane[settimane.length - 1]
    expect(ultima[6] >= '2026-08-31').toBe(true)
    const tutti = settimane.flat()
    expect(tutti).toContain('2026-08-01')
    expect(tutti).toContain('2026-08-31')
  })

  it('un mese che inizia di lunedi non trascina giorni del mese prima', () => {
    // Il 1 giugno 2026 e' un lunedi.
    expect(settimaneDelMese(2026, 6)[0][0]).toBe('2026-06-01')
  })
})

describe('raggruppaPerGiorno', () => {
  it('mette gli eventi sotto la loro data, ordinati per ora', () => {
    const eventi = [
      { data: '2026-08-19', ora_inizio: '15:00' },
      { data: '2026-08-19', ora_inizio: '09:00' },
      { data: '2026-08-20', ora_inizio: '11:00' },
    ]
    const mappa = raggruppaPerGiorno(eventi)
    expect(mappa.get('2026-08-19')?.map((e) => e.ora_inizio)).toEqual(['09:00', '15:00'])
    expect(mappa.get('2026-08-20')).toHaveLength(1)
    expect(mappa.get('2026-08-21')).toBeUndefined()
  })
})

describe('messaggioAppuntamento', () => {
  const base = {
    titolo: 'Sopralluogo',
    data: '2026-09-03',
    ora_inizio: '15:30',
    ora_fine: '16:30',
    tutto_il_giorno: false,
    cliente_nome: 'Sig. Teresi',
    note: null,
    azienda: 'A.L.M. Infissi',
    telefonoAzienda: '091 1234567',
  }

  it('mette cliente, data in italiano, ora e firma', () => {
    const testo = messaggioAppuntamento(base)
    expect(testo).toContain('Gentile Sig. Teresi')
    expect(testo).toContain('giovedì 3 settembre 2026')
    expect(testo).toContain('15:30')
    expect(testo).toContain('Sopralluogo')
    expect(testo).toContain('091 1234567')
    expect(testo).toContain('A.L.M. Infissi')
  })

  it('senza cliente saluta senza nome e senza virgola pendente', () => {
    const testo = messaggioAppuntamento({ ...base, cliente_nome: null })
    expect(testo).toContain('Gentile cliente')
    expect(testo).not.toContain('Gentile ,')
  })

  it("un appuntamento di giornata non promette un'ora", () => {
    const testo = messaggioAppuntamento({ ...base, tutto_il_giorno: true })
    expect(testo).not.toContain('15:30')
    expect(testo).toContain('in giornata')
  })

  it('senza telefono aziendale non lascia la riga a meta', () => {
    const testo = messaggioAppuntamento({ ...base, telefonoAzienda: null })
    expect(testo).not.toContain('telefono')
    expect(testo).toContain('A.L.M. Infissi')
  })

  it('le note finiscono nel messaggio quando ci sono', () => {
    expect(messaggioAppuntamento({ ...base, note: 'Portare i campioni' }))
      .toContain('Portare i campioni')
  })
})
