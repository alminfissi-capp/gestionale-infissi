/**
 * Il PDF del preventivo deve riportare il testo libero come è stato scritto:
 * a capo, righe lasciate vuote e spazi di incolonnamento compresi.
 */
import { describe, it, expect } from 'vitest'
import { renderToBuffer } from '@react-pdf/renderer'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import PreventivoPdf from '@/lib/pdf/preventivoPdf'
import type { PreventivoCompleto } from '@/types/preventivo'

const LF = String.fromCharCode(10)
const TAB = String.fromCharCode(9)

const articolo = {
  id: 'a1', preventivo_id: 'p1', organization_id: 'org',
  tipo: 'libera', listino_id: null, listino_libero_id: null, prodotto_id: null,
  accessori_selezionati: null, accessori_griglia: null,
  tipologia: `TITOLO ARTICOLO${LF}SECONDA RIGA TITOLO`,
  categoria_nome: null, larghezza_mm: null, altezza_mm: null,
  larghezza_listino_mm: null, altezza_listino_mm: null, misura_arrotondata: false,
  finitura_nome: null, finitura_aumento: 0, finitura_aumento_euro: 0,
  note: `NOTA UNO${LF}${LF}NOTA TRE DOPO VUOTA${LF}TAB${TAB}DOPOTAB${LF}   RIENTRO`,
  immagine_url: null, quantita: 1, prezzo_base: null, prezzo_unitario: 100,
  sconto_articolo: 0, prezzo_totale_riga: 100, costo_acquisto_unitario: null,
  costo_posa: 0, aliquota_iva: 10, ordine: 0, omaggio: false,
  quota_trasporto: 0, created_at: '2026-09-10T08:00:00Z',
}

const preventivo = {
  id: 'p1', numero: '001-2026', created_at: '2026-09-10T08:00:00Z',
  cliente_snapshot: { tipo: 'privato', nome: 'Mario', cognome: 'Rossi' },
  articoli: [articolo], sconto_globale: 0, sconto_importo_fisso: null,
  mostra_sconto_riga: false, note: `NOTA GENERALE${LF}${LF}DOPO UNA VUOTA`,
  subtotale: 100, importo_sconto: 0, totale_articoli: 100, spese_trasporto: 0,
  iva_totale: 10, riepilogo_iva: [], totale_finale: 110, totale_pezzi: 1,
} as unknown as PreventivoCompleto

async function pezzi() {
  const buffer = await renderToBuffer(
    <PreventivoPdf preventivo={preventivo} settings={null} logoUrl={null} />
  )
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise
  const tc = await pdf.getPage(1).then((p) => p.getTextContent())
  return (tc.items as { str: string; transform: number[]; width: number }[])
    .filter((i) => i.str?.trim())
    .map((i) => ({
      t: i.str.trim(), x: i.transform[4],
      fine: i.transform[4] + i.width, y: Math.round(i.transform[5]),
    }))
}

describe('testo libero nel PDF preventivo', () => {
  it('tiene le righe lasciate vuote dentro le note', async () => {
    const items = await pezzi()
    const uno = items.find((i) => i.t === 'NOTA UNO')!
    const tre = items.find((i) => i.t.startsWith('NOTA TRE'))!
    expect(uno, 'prima riga di nota assente').toBeDefined()
    expect(tre, 'riga dopo quella vuota assente').toBeDefined()
    // Fra le due c'è una riga vuota: il salto verticale deve valere due righe.
    const salto = uno.y - tre.y
    const unaRiga = 8 * 1.4
    expect(salto, `salto di ${salto.toFixed(1)}pt fra le due note`).toBeGreaterThan(unaRiga * 1.5)
  })

  it('tiene la tabulazione, che il motore ridurrebbe a un solo spazio', async () => {
    const items = await pezzi()
    const prima = items.find((i) => i.t === 'TAB')!
    const dopo = items.find((i) => i.t === 'DOPOTAB')!
    expect(prima, 'testo prima del tab assente').toBeDefined()
    expect(dopo, 'testo dopo il tab assente').toBeDefined()
    // Senza intervento il tab varrebbe un solo spazio, sotto i 2,5pt a corpo 8.
    expect(dopo.x - prima.fine).toBeGreaterThan(5)
  })

  it('tiene il rientro a inizio riga', async () => {
    const items = await pezzi()
    const nota = items.find((i) => i.t === 'NOTA UNO')!
    const rientro = items.find((i) => i.t === 'RIENTRO')!
    expect(rientro.x).toBeGreaterThan(nota.x + 3)
  })

  it('manda a capo il titolo articolo dove lo ha scritto chi compila', async () => {
    const items = await pezzi()
    const prima = items.find((i) => i.t === 'TITOLO ARTICOLO')!
    const seconda = items.find((i) => i.t === 'SECONDA RIGA TITOLO')!
    expect(prima).toBeDefined()
    expect(seconda).toBeDefined()
    expect(seconda.y).toBeLessThan(prima.y)
  })

  it('tiene la riga vuota anche nelle note generali del preventivo', async () => {
    const items = await pezzi()
    const gen = items.find((i) => i.t === 'NOTA GENERALE')!
    const dopo = items.find((i) => i.t.startsWith('DOPO UNA VUOTA'))!
    expect(gen).toBeDefined()
    expect(dopo).toBeDefined()
    expect(gen.y - dopo.y).toBeGreaterThan(8.5 * 1.4 * 1.5)
  })
})
