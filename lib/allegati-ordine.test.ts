import { describe, it, expect } from 'vitest'
import {
  estensioneDi,
  MAX_ALLEGATO_BYTE,
  mimeAllegato,
  percorsoAllegatoOrdine,
  validaAllegato,
} from '@/lib/allegati-ordine'

describe('estensioneDi', () => {
  it('prende l\'ultima estensione, minuscola', () => {
    expect(estensioneDi('bolla.PDF')).toBe('pdf')
    expect(estensioneDi('foto.2026.01.jpeg')).toBe('jpeg')
  })

  it('senza estensione ripiega su bin', () => {
    expect(estensioneDi('scansione')).toBe('bin')
    expect(estensioneDi('archivio.')).toBe('bin')
  })
})

describe('mimeAllegato', () => {
  it('tiene il tipo dichiarato dal browser quando e significativo', () => {
    expect(mimeAllegato('bolla.pdf', 'application/pdf')).toBe('application/pdf')
    expect(mimeAllegato('foto.jpg', 'image/jpeg')).toBe('image/jpeg')
  })

  // Da Android arriva spesso il generico: salvarlo cosi' renderebbe il file
  // non apribile nel visualizzatore.
  it('ricava il tipo dall\'estensione quando il browser dice octet-stream', () => {
    expect(mimeAllegato('bolla.pdf', 'application/octet-stream')).toBe('application/pdf')
    expect(mimeAllegato('foto.HEIC', 'application/octet-stream')).toBe('image/heic')
  })

  it('ricava il tipo dall\'estensione quando il browser non dice niente', () => {
    expect(mimeAllegato('foto.png')).toBe('image/png')
    expect(mimeAllegato('foto.png', null)).toBe('image/png')
    expect(mimeAllegato('foto.webp', '')).toBe('image/webp')
  })

  it('su estensione sconosciuta resta generico', () => {
    expect(mimeAllegato('strano.xyz')).toBe('application/octet-stream')
  })
})

describe('validaAllegato', () => {
  it('accetta un file normale', () => {
    expect(validaAllegato({ name: 'bolla.pdf', size: 3_000_000 })).toBeNull()
  })

  it('rifiuta un file vuoto', () => {
    expect(validaAllegato({ name: 'vuoto.pdf', size: 0 })).toMatch(/vuoto/i)
  })

  it('rifiuta oltre i 20 MB, che e il tetto del bucket', () => {
    expect(validaAllegato({ name: 'enorme.pdf', size: MAX_ALLEGATO_BYTE + 1 })).toMatch(/grande/i)
    expect(validaAllegato({ name: 'giusto.pdf', size: MAX_ALLEGATO_BYTE })).toBeNull()
  })

  it('nomina il file nel messaggio, che con piu allegati serve a capire quale', () => {
    expect(validaAllegato({ name: 'bolla-marzo.pdf', size: 0 })).toContain('bolla-marzo.pdf')
  })
})

describe('percorsoAllegatoOrdine', () => {
  // orgId come prima cartella e' obbligatorio per le storage policy del bucket.
  it('mette orgId per primo e ordini/<id> dopo', () => {
    expect(percorsoAllegatoOrdine('ORG', 'ORD', 'bolla.pdf', 'fisso'))
      .toBe('ORG/ordini/ORD/fisso.pdf')
  })

  it('conserva l\'estensione del file', () => {
    expect(percorsoAllegatoOrdine('ORG', 'ORD', 'foto.JPG', 'fisso'))
      .toBe('ORG/ordini/ORD/fisso.jpg')
  })

  it('senza suffisso esplicito genera un nome unico', () => {
    const a = percorsoAllegatoOrdine('ORG', 'ORD', 'bolla.pdf')
    const b = percorsoAllegatoOrdine('ORG', 'ORD', 'bolla.pdf')
    expect(a).toMatch(/^ORG\/ordini\/ORD\/\d+-[a-z0-9]+\.pdf$/)
    expect(a).not.toBe(b)
  })
})
