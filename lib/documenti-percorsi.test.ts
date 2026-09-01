import { describe, it, expect } from 'vitest'
import {
  LIMITE_BYTE_DOCUMENTO,
  estensioneDi,
  mimeDocumento,
  percorsoStorage,
} from './documenti-percorsi'

describe('estensioneDi', () => {
  it('prende l’ultima estensione, in minuscolo', () => {
    expect(estensioneDi('Rilievo.PDF')).toBe('pdf')
    expect(estensioneDi('scansione.2026.jpeg')).toBe('jpeg')
  })

  it('restituisce stringa vuota se non c’è estensione', () => {
    expect(estensioneDi('rilievo')).toBe('')
  })
})

describe('mimeDocumento', () => {
  it('si fida del tipo dichiarato dal browser quando c’è', () => {
    expect(mimeDocumento('x.pdf', 'application/pdf')).toBe('application/pdf')
  })

  it('ricava il tipo dall’estensione quando il browser dice octet-stream', () => {
    expect(mimeDocumento('rilievo.pdf', 'application/octet-stream')).toBe('application/pdf')
    expect(mimeDocumento('foto.JPG', '')).toBe('image/jpeg')
    expect(mimeDocumento('foto.png', '')).toBe('image/png')
  })

  it('ripiega su octet-stream per estensioni che non conosce', () => {
    expect(mimeDocumento('disegno.dxf', '')).toBe('application/octet-stream')
  })
})

describe('percorsoStorage', () => {
  it('mette org e commessa nel percorso, e l’estensione nel nome', () => {
    expect(percorsoStorage('org1', 'comm1', 'Rilievo.pdf', 1700000000000))
      .toBe('org1/comm1/1700000000000.pdf')
  })

  it('usa .bin quando il nome non ha estensione', () => {
    expect(percorsoStorage('org1', 'comm1', 'rilievo', 1700000000000))
      .toBe('org1/comm1/1700000000000.bin')
  })
})

describe('LIMITE_BYTE_DOCUMENTO', () => {
  it('è 20 MB, come il controllo che esisteva in DialogDocumenti', () => {
    expect(LIMITE_BYTE_DOCUMENTO).toBe(20 * 1024 * 1024)
  })
})
