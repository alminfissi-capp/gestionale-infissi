import { describe, expect, it } from 'vitest'
import {
  limitaPosizione,
  nomeFileSicuro,
  noteInHtml,
  posizioneProposta,
  posizioneSuPdf,
  riepilogaConferma,
  validaFileFornitore,
} from './conferme-ordine'
import type { FileFornitoreOrdine } from '@/types/produzione'

const file = (over: Partial<FileFornitoreOrdine>): FileFornitoreOrdine => ({
  id: 'f',
  organization_id: 'o',
  ordine_id: 'ord',
  tipo: 'conferma',
  storage_path: 'p',
  nome_file: 'conf.pdf',
  content_type: 'application/pdf',
  dimensione: 100,
  caricato_da: 'fornitore',
  created_at: '2026-10-04T09:00:00Z',
  stato: 'da_firmare',
  firmata_path: null,
  firmata_at: null,
  note_firma: null,
  inviata_a: null,
  inviata_at: null,
  letta_at: null,
  aperture: 0,
  ...over,
})

describe('validaFileFornitore', () => {
  it('accetta PDF e foto', () => {
    expect(validaFileFornitore('application/pdf', 1000)).toBeNull()
    expect(validaFileFornitore('image/jpeg', 1000)).toBeNull()
  })
  it('rifiuta altri formati, file vuoti e oltre 20 MB', () => {
    expect(validaFileFornitore('application/zip', 1000)).toMatch(/Formato/)
    expect(validaFileFornitore('application/pdf', 0)).toMatch(/vuoto/)
    expect(validaFileFornitore('application/pdf', 21 * 1024 * 1024)).toMatch(/20 MB/)
  })
})

describe('nomeFileSicuro', () => {
  it('toglie cartelle, accenti e caratteri strani', () => {
    expect(nomeFileSicuro('C:\\doc\\Conferma n° 44 è ok.pdf')).toBe('Conferma_n_44_e_ok.pdf')
    expect(nomeFileSicuro('../../segreto.pdf')).toBe('segreto.pdf')
  })
  it('non resta mai vuoto', () => {
    expect(nomeFileSicuro('///')).toBe('file')
  })
})

describe('riepilogaConferma', () => {
  it('senza file: in attesa se richiesta, altrimenti non richiesta', () => {
    expect(riepilogaConferma(true, []).stato).toBe('in_attesa')
    expect(riepilogaConferma(false, []).stato).toBe('non_richiesta')
  })
  it('ignora documenti e conferme sostituite', () => {
    const r = riepilogaConferma(true, [
      file({ tipo: 'documento', stato: null }),
      file({ stato: 'sostituita' }),
    ])
    expect(r.stato).toBe('in_attesa')
  })
  it('una conferma da firmare vince su una gia firmata', () => {
    const r = riepilogaConferma(true, [
      file({ id: 'vecchia', stato: 'firmata', created_at: '2026-10-01T00:00:00Z' }),
      file({ id: 'nuova', stato: 'da_firmare', created_at: '2026-10-05T00:00:00Z' }),
    ])
    expect(r.stato).toBe('da_firmare')
    expect(r.conferma?.id).toBe('nuova')
  })
  it('a parita di stato prende la piu recente', () => {
    const r = riepilogaConferma(false, [
      file({ id: 'a', stato: 'firmata', created_at: '2026-10-01T00:00:00Z' }),
      file({ id: 'b', stato: 'firmata_manuale', created_at: '2026-10-03T00:00:00Z' }),
    ])
    expect(r.conferma?.id).toBe('b')
  })
})

describe('posizioneSuPdf', () => {
  const a4 = { x: 0, y: 0, width: 600, height: 800 }
  const pos = { x: 0.5, y: 0.75, larghezza: 0.25, altezza: 0.125 }

  it('pagina dritta: origine in basso a sinistra', () => {
    expect(posizioneSuPdf(pos, a4, 0)).toEqual({ x: 300, y: 100, width: 150, height: 100, rotate: 0 })
  })
  it('tiene conto dello scostamento del crop box', () => {
    const r = posizioneSuPdf(pos, { x: 10, y: 20, width: 600, height: 800 }, 0)
    expect(r.x).toBe(310)
    expect(r.y).toBe(120)
  })
  it('pagina ruotata di 90: a video e larga 800 e alta 600', () => {
    // angolo a video in basso a sinistra del box: u=0.5, v=0.875
    expect(posizioneSuPdf(pos, a4, 90)).toEqual({ x: 525, y: 400, width: 200, height: 75, rotate: 90 })
  })
  it('pagina capovolta', () => {
    expect(posizioneSuPdf(pos, a4, 180)).toEqual({ x: 300, y: 700, width: 150, height: 100, rotate: 180 })
  })
  it('pagina ruotata di 270 e rotazioni negative', () => {
    const atteso = { x: 75, y: 400, width: 200, height: 75, rotate: 270 }
    expect(posizioneSuPdf(pos, a4, 270)).toEqual(atteso)
    expect(posizioneSuPdf(pos, a4, -90)).toEqual(atteso)
  })
})

describe('limitaPosizione e posizioneProposta', () => {
  it('non lascia uscire il timbro dalla pagina', () => {
    expect(limitaPosizione({ x: 0.9, y: -0.2, larghezza: 0.3, altezza: 0.1 })).toEqual({
      x: 0.7, y: 0, larghezza: 0.3, altezza: 0.1,
    })
  })
  it('propone il basso a destra, dentro i margini', () => {
    const p = posizioneProposta(0.5, 1.414)
    expect(p.x + p.larghezza).toBeCloseTo(0.94)
    expect(p.y + p.altezza).toBeCloseTo(0.95)
  })
})

describe('noteInHtml', () => {
  it('neutralizza HTML e conserva gli a capo', () => {
    expect(noteInHtml('<b>ok</b>\nseconda')).toBe('&lt;b&gt;ok&lt;/b&gt;<br>seconda')
  })
})
