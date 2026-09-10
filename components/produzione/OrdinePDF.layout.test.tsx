/**
 * Verifica di impaginazione del PDF d'ordine: renderizza davvero il documento e
 * misura dove finisce ogni colonna. Nasce da un difetto reale — descrizione e
 * finitura si toccavano e si leggevano come un'unica parola.
 */
import { describe, it, expect } from 'vitest'
import { renderToBuffer } from '@react-pdf/renderer'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import OrdinePDF from './OrdinePDF'
import type { OrdineCompleto, RigaOrdine } from '@/types/produzione'

const riga = (i: number, codice: string, descrizione: string, finitura: string, um: string): RigaOrdine => ({
  id: `r${i}`, ordine_id: 'o1', organization_id: 'org', descrizione,
  codice_articolo: codice, finitura, quantita: 5, unita_misura: um,
  prezzo_unitario: 1234.56, ordine: i, created_at: '2026-09-10T08:00:00Z',
})

// Righe ricalcate su un ordine vero (ORD 025-2026 a PROFILSIDER).
const righe: RigaOrdine[] = [
  riga(0, '100x100x2 Zincato', 'Tubo quadro 100x100x2 Zincato', 'Zincato', 'Barre'),
  riga(1, '100x50x2 Zincato', 'Tubo Rettangolare 100x50x2 Zincato', 'Zincato', 'Barre'),
  riga(2, null as unknown as string, 'Termo Copertura Finto Coppo Ral 7016 Grigio a 550 cm', 'Grigio', 'Fogli'),
  riga(3, null as unknown as string, 'U Laterali per Finto Coppo Ral 7016 Grigio', 'Grigio antracite', 'Pz'),
  riga(4, null as unknown as string, 'Coppia tappi per grondaia Ral 7016 Grigio', 'Grigio', 'Cp'),
]

const ordine = {
  id: 'o1', numero_ordine: '025-2026', data_ordine: '2026-09-10',
  data_consegna_prevista: '2026-09-14', stato: 'da_ordinare', note: null,
  righe, totale: 6172.8, fornitore_nome: 'PROFILSIDER SRL', in_ritardo: false,
} as unknown as OrdineCompleto

const intestazione = {
  denominazione: 'A.L.M. Infissi',
  indirizzo: 'Vicolo della Ferrovia 10 - 90147 Palermo (PA)',
  piva: '06365120820',
  logoUrl: null,
}

/** Frammenti di testo della prima pagina con inizio e fine sull'asse x. */
async function frammenti(): Promise<{ x: number; fine: number; y: number; t: string }[]> {
  const buffer = await renderToBuffer(
    <OrdinePDF
      ordine={ordine}
      intestazione={intestazione}
      fornitoreNome="PROFILSIDER SRL"
      numeroCommessa="39-2026"
      clienteNome="Graziano Massimiliano"
      tracking={undefined}
    />
  )
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise
  const tc = await pdf.getPage(1).then((p) => p.getTextContent())
  return tc.items
    .filter((i): i is typeof i & { str: string; transform: number[]; width: number } =>
      'str' in i && !!i.str.trim())
    .map((i) => ({ x: i.transform[4], fine: i.transform[4] + i.width, y: Math.round(i.transform[5]), t: i.str }))
}

describe('impaginazione tabella righe ordine', () => {
  it('nessuna colonna tocca la successiva', async () => {
    const items = await frammenti()

    // Le intestazioni danno il punto di partenza di ogni colonna.
    const inizioDi = (etichetta: string): number => {
      const h = items.find((i) => i.t.trim() === etichetta)
      expect(h, `intestazione "${etichetta}" non trovata`).toBeDefined()
      return h!.x
    }
    const xDesc = inizioDi('Descrizione')
    const xFinitura = inizioDi('Finitura')

    // Il testo della colonna Descrizione non deve arrivare a ridosso di Finitura.
    const testiDesc = items.filter((i) => i.x >= xDesc - 1 && i.x < xFinitura - 1)
    expect(testiDesc.length).toBeGreaterThan(0)
    const piuLungo = Math.max(...testiDesc.map((i) => i.fine))
    const respiro = xFinitura - piuLungo

    expect(
      respiro,
      `la descrizione arriva a ${piuLungo.toFixed(1)}pt e la finitura parte da ${xFinitura.toFixed(1)}pt`
    ).toBeGreaterThanOrEqual(4)
  })

  it('la finitura resta accostata alla quantita, non alla descrizione', async () => {
    const items = await frammenti()
    const x = (etichetta: string) => items.find((i) => i.t.trim() === etichetta)!.x
    // La finitura deve stare nella seconda meta' della tabella: e' li' che
    // lascia respiro alla descrizione, che e' il campo lungo.
    expect(x('Finitura')).toBeGreaterThan(320)
    // e restare piu' vicina a Q.ta che a Descrizione
    const distanzaDaDesc = x('Finitura') - x('Descrizione')
    const distanzaDaQta = x('Q.tà') - x('Finitura')
    expect(distanzaDaQta).toBeLessThan(distanzaDaDesc)
  })

  it('il codice articolo non si spezza su piu righe', async () => {
    const items = await frammenti()
    const xDesc = items.find((i) => i.t.trim() === 'Descrizione')!.x
    // Righe della tabella: quelle sotto l'intestazione con testo nella prima colonna.
    const yIntestazione = items.find((i) => i.t.trim() === 'Cod. Articolo')!.y
    const nellaColonnaCodice = items.filter((i) => i.y < yIntestazione - 2 && i.fine < xDesc - 1)
    const righeOccupate = new Set(nellaColonnaCodice.map((i) => i.y))
    // Una riga di tabella per ogni articolo, non due: se il codice andasse a
    // capo comparirebbero piu' y di quante siano le righe dell'ordine.
    expect(righeOccupate.size).toBeLessThanOrEqual(righe.length)
  })

  it('rispetta a capo e spazi scritti a mano nella cella', async () => {
    const LF = String.fromCharCode(10)
    const TAB = String.fromCharCode(9)
    const conFormattazione: RigaOrdine[] = [
      riga(0, 'COD', `PRIMA RIGA${LF}TAB${TAB}DOPOTAB${LF}   RIENTRO`, 'Zincato', 'Pz'),
    ]
    const ord = { ...ordine, righe: conFormattazione } as unknown as OrdineCompleto
    const buffer = await renderToBuffer(
      <OrdinePDF ordine={ord} intestazione={intestazione} fornitoreNome="X"
        numeroCommessa="1" clienteNome="" tracking={undefined} />
    )
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise
    const tc = await pdf.getPage(1).then((p) => p.getTextContent())
    // Va guardata la geometria, non il testo: in fase di estrazione pdf.js
    // riporta gli NBSP come un singolo spazio, ma sulla pagina occupano il
    // loro posto. Sono le coordinate a dire se il testo è impaginato bene.
    const pezzi = (tc.items as { str: string; transform: number[]; width: number }[])
      .filter((i) => i.str?.trim())
      .map((i) => ({ t: i.str.trim(), x: i.transform[4], fine: i.transform[4] + i.width, y: Math.round(i.transform[5]) }))
    const trova = (t: string) => {
      const p = pezzi.find((i) => i.t === t)
      expect(p, `"${t}" non trovato nel PDF`).toBeDefined()
      return p!
    }

    const prima = trova('PRIMA RIGA')
    const tab = trova('TAB')
    const dopoTab = trova('DOPOTAB')
    const rientro = trova('RIENTRO')

    // Le tre righe scritte a mano restano su tre righe distinte.
    expect(new Set([prima.y, tab.y, rientro.y]).size).toBe(3)

    // La tabulazione vale quattro spazi, non uno: senza intervento il motore
    // la schiaccerebbe sotto i 3pt.
    expect(dopoTab.x - tab.fine).toBeGreaterThan(6)

    // Il rientro a inizio riga non viene buttato via.
    expect(rientro.x).toBeGreaterThan(prima.x + 4)
  })

  it('nessun importo va a capo nelle colonne dei prezzi', async () => {
    const items = await frammenti()
    // Se una cella prezzo fosse stretta, l'importo si spezzerebbe su due righe:
    // comparirebbero frammenti che non contengono la virgola dei centesimi.
    const importi = items.filter((i) => /^€?\s?[\d.]+,\d{2}$/.test(i.t.trim()))
    expect(importi.length).toBeGreaterThanOrEqual(righe.length)
  })
})
