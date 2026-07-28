import { describe, it, expect } from 'vitest'
import {
  riassumiEventi,
  conFallbackInvio,
  formattaDataOra,
  righeTooltip,
  righeFooterPdf,
  TRACKING_VUOTO,
} from '@/lib/produzione-tracking'
import type { EventoTracking } from '@/types/produzione'

const ev = (
  tipo: EventoTracking['tipo'],
  avvenuto_at: string,
  destinatario: string | null = null
): EventoTracking => ({ tipo, avvenuto_at, destinatario })

const INVIO = '2026-07-28T09:42:00.000Z'
const APERTURA_MAIL = '2026-07-28T11:10:00.000Z'
const APERTURA_PAGINA = '2026-07-28T12:00:00.000Z'
const DOWNLOAD = '2026-07-28T12:03:00.000Z'

describe('riassumiEventi', () => {
  it('senza eventi risulta non inviato', () => {
    expect(riassumiEventi([])).toEqual(TRACKING_VUOTO)
  })

  it('con il solo invio risulta inviato, senza date di lettura', () => {
    const t = riassumiEventi([ev('inviato', INVIO, 'rossi@esempio.it')])
    expect(t.stato).toBe('inviato')
    expect(t.inviatoAt).toBe(INVIO)
    expect(t.destinatario).toBe('rossi@esempio.it')
    expect(t.emailApertaAt).toBeNull()
    expect(t.aperture).toBe(0)
    expect(t.invii).toBe(1)
  })

  it('con il pixel aperto risulta letto', () => {
    const t = riassumiEventi([ev('inviato', INVIO), ev('email_aperta', APERTURA_MAIL)])
    expect(t.stato).toBe('letto')
    expect(t.emailApertaAt).toBe(APERTURA_MAIL)
  })

  it('risulta letto anche col solo download, se il pixel è stato bloccato', () => {
    const t = riassumiEventi([ev('inviato', INVIO), ev('pdf_scaricato', DOWNLOAD)])
    expect(t.stato).toBe('letto')
    expect(t.emailApertaAt).toBeNull()
    expect(t.pdfScaricatoAt).toBe(DOWNLOAD)
  })

  it('il reinvio riporta lo stato a inviato e azzera le letture', () => {
    const reinvio = '2026-07-29T08:00:00.000Z'
    const t = riassumiEventi([
      ev('inviato', INVIO, 'rossi@esempio.it'),
      ev('email_aperta', APERTURA_MAIL),
      ev('pdf_scaricato', DOWNLOAD),
      ev('inviato', reinvio, 'nuovo@esempio.it'),
    ])
    expect(t.stato).toBe('inviato')
    expect(t.inviatoAt).toBe(reinvio)
    expect(t.destinatario).toBe('nuovo@esempio.it')
    expect(t.emailApertaAt).toBeNull()
    expect(t.pdfScaricatoAt).toBeNull()
    expect(t.aperture).toBe(0)
    expect(t.invii).toBe(2)
  })

  it('conta le aperture di pagina e i download, non il pixel', () => {
    const t = riassumiEventi([
      ev('inviato', INVIO),
      ev('email_aperta', APERTURA_MAIL),
      ev('pagina_aperta', APERTURA_PAGINA),
      ev('pdf_scaricato', DOWNLOAD),
    ])
    expect(t.aperture).toBe(2)
  })

  it('tiene la prima lettura di ciascun tipo dopo l ultimo invio', () => {
    const secondaApertura = '2026-07-28T15:00:00.000Z'
    const t = riassumiEventi([
      ev('inviato', INVIO),
      ev('pagina_aperta', APERTURA_PAGINA),
      ev('pagina_aperta', secondaApertura),
    ])
    expect(t.paginaApertaAt).toBe(APERTURA_PAGINA)
    expect(t.aperture).toBe(2)
  })

  it('non dipende dall ordine in cui arrivano gli eventi', () => {
    const disordinati = [
      ev('pdf_scaricato', DOWNLOAD),
      ev('inviato', INVIO, 'rossi@esempio.it'),
      ev('email_aperta', APERTURA_MAIL),
    ]
    expect(riassumiEventi(disordinati)).toEqual(
      riassumiEventi([...disordinati].reverse())
    )
  })

  it('non modifica l array ricevuto', () => {
    const eventi = [ev('pdf_scaricato', DOWNLOAD), ev('inviato', INVIO)]
    riassumiEventi(eventi)
    expect(eventi[0].tipo).toBe('pdf_scaricato')
  })
})

describe('conFallbackInvio', () => {
  it('mostra inviato per gli ordini spediti prima del tracking', () => {
    const t = conFallbackInvio(TRACKING_VUOTO, INVIO)
    expect(t.stato).toBe('inviato')
    expect(t.inviatoAt).toBe(INVIO)
    expect(t.invii).toBe(1)
  })

  it('lascia intatto un tracking che ha già eventi', () => {
    const reale = riassumiEventi([ev('inviato', INVIO), ev('pdf_scaricato', DOWNLOAD)])
    expect(conFallbackInvio(reale, '2020-01-01T00:00:00.000Z')).toEqual(reale)
  })

  it('resta non inviato se non c è nemmeno inviato_at', () => {
    expect(conFallbackInvio(TRACKING_VUOTO, null)).toEqual(TRACKING_VUOTO)
  })
})

describe('formattaDataOra', () => {
  it('formatta in ora italiana', () => {
    // 09:42 UTC in luglio = 11:42 a Roma
    expect(formattaDataOra(INVIO)).toBe('28/07/2026 11:42')
  })

  it('formatta correttamente anche in ora solare (CET, +1h)', () => {
    // 09:42 UTC in gennaio = 10:42 a Roma
    expect(formattaDataOra('2026-01-15T09:42:00.000Z')).toBe('15/01/2026 10:42')
  })

  it('restituisce stringa vuota su null o data non valida', () => {
    expect(formattaDataOra(null)).toBe('')
    expect(formattaDataOra('non-una-data')).toBe('')
  })
})

describe('righeTooltip', () => {
  it('dice non inviato quando non c è nulla', () => {
    expect(righeTooltip(TRACKING_VUOTO)).toEqual(['Non inviato'])
  })

  it('mostra destinatario e data di invio', () => {
    const t = riassumiEventi([ev('inviato', INVIO, 'rossi@esempio.it')])
    expect(righeTooltip(t)).toEqual(['Inviato a rossi@esempio.it il 28/07/2026 11:42'])
  })

  it('omette il destinatario se non registrato', () => {
    const t = riassumiEventi([ev('inviato', INVIO)])
    expect(righeTooltip(t)).toEqual(['Inviato il 28/07/2026 11:42'])
  })

  it('elenca ogni evento di lettura registrato', () => {
    const t = riassumiEventi([
      ev('inviato', INVIO, 'rossi@esempio.it'),
      ev('email_aperta', APERTURA_MAIL),
      ev('pagina_aperta', APERTURA_PAGINA),
      ev('pdf_scaricato', DOWNLOAD),
    ])
    expect(righeTooltip(t)).toEqual([
      'Inviato a rossi@esempio.it il 28/07/2026 11:42',
      'Email aperta il 28/07/2026 13:10',
      'Pagina aperta il 28/07/2026 14:00',
      'PDF scaricato il 28/07/2026 14:03',
      'Aperto 2 volte',
    ])
  })

  it('segnala i reinvii', () => {
    const t = riassumiEventi([
      ev('inviato', INVIO),
      ev('inviato', '2026-07-29T08:00:00.000Z', 'rossi@esempio.it'),
    ])
    expect(righeTooltip(t)).toContain('Inviato 2 volte in tutto')
  })
})

describe('righeFooterPdf', () => {
  it('non scrive nulla se l ordine non è mai partito', () => {
    expect(righeFooterPdf(TRACKING_VUOTO)).toEqual([])
  })

  it('scrive la sola riga di invio se non risulta letto', () => {
    const t = riassumiEventi([ev('inviato', INVIO, 'rossi@esempio.it')])
    expect(righeFooterPdf(t)).toEqual([
      'Inviato a rossi@esempio.it il 28/07/2026 11:42',
    ])
  })

  it('aggiunge l apertura del documento usando la prima fra pagina e download', () => {
    const t = riassumiEventi([
      ev('inviato', INVIO, 'rossi@esempio.it'),
      ev('pagina_aperta', APERTURA_PAGINA),
      ev('pdf_scaricato', DOWNLOAD),
    ])
    expect(righeFooterPdf(t)).toEqual([
      'Inviato a rossi@esempio.it il 28/07/2026 11:42',
      'Documento aperto dal destinatario il 28/07/2026 14:00',
    ])
  })

  it('con il solo pixel parla di email, non di documento', () => {
    const t = riassumiEventi([
      ev('inviato', INVIO, 'rossi@esempio.it'),
      ev('email_aperta', APERTURA_MAIL),
    ])
    expect(righeFooterPdf(t)).toEqual([
      'Inviato a rossi@esempio.it il 28/07/2026 11:42',
      'Email aperta dal destinatario il 28/07/2026 13:10',
    ])
  })
})
