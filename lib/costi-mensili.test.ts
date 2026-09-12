import { describe, it, expect } from 'vitest'
import {
  VOCI, FAMIGLIE, FAMIGLIA_DI, VOCE_LABEL, FAMIGLIA_LABEL, MESI_ESTESI,
  voceDiCategoria,
} from '@/lib/costi-mensili'

describe('mappe delle voci di spesa', () => {
  it('ogni categoria di scadenza finisce nella voce giusta', () => {
    expect(voceDiCategoria('utenza')).toBe('utenze')
    expect(voceDiCategoria('finanziamento')).toBe('finanziamenti')
    expect(voceDiCategoria('assegno')).toBe('materiali')
    expect(voceDiCategoria('tassa')).toBe('tasse')
    expect(voceDiCategoria('altro')).toBe('altro')
  })

  it('una categoria sconosciuta finisce fra le altre spese, non si perde', () => {
    expect(voceDiCategoria('leasing_auto')).toBe('altro')
    expect(voceDiCategoria('')).toBe('altro')
  })

  it('utenze, finanziamenti e stipendi sono costi fissi', () => {
    expect(FAMIGLIA_DI.utenze).toBe('fissi')
    expect(FAMIGLIA_DI.finanziamenti).toBe('fissi')
    expect(FAMIGLIA_DI.stipendi).toBe('fissi')
  })

  it('materiali e altre spese sono costi variabili, le tasse stanno a parte', () => {
    expect(FAMIGLIA_DI.materiali).toBe('variabili')
    expect(FAMIGLIA_DI.altro).toBe('variabili')
    expect(FAMIGLIA_DI.tasse).toBe('tasse')
  })

  it('ogni voce ha un etichetta e appartiene a una famiglia nota', () => {
    expect(VOCI).toHaveLength(6)
    for (const v of VOCI) {
      expect(VOCE_LABEL[v]).toBeTruthy()
      expect(FAMIGLIE).toContain(FAMIGLIA_DI[v])
    }
    expect(FAMIGLIE.map((f) => FAMIGLIA_LABEL[f]))
      .toEqual(['Costi fissi', 'Costi variabili', 'Tasse'])
  })

  it('le voci sono ordinate per famiglia: prima i fissi, poi i variabili, poi le tasse', () => {
    expect(VOCI.map((v) => FAMIGLIA_DI[v]))
      .toEqual(['fissi', 'fissi', 'fissi', 'variabili', 'variabili', 'tasse'])
  })

  it('i nomi estesi dei mesi servono agli avvisi', () => {
    expect(MESI_ESTESI).toHaveLength(12)
    expect(MESI_ESTESI[0]).toBe('gennaio')
    expect(MESI_ESTESI[11]).toBe('dicembre')
  })
})

import { aggregaCostiMensili, type DatiCostiMensili } from '@/lib/costi-mensili'

// Base vuota: ogni test riempie solo quello che gli serve.
function dati(p: Partial<DatiCostiMensili> = {}): DatiCostiMensili {
  return { scadenze: [], buste: [], movimentiAltri: [], ...p }
}

const scadenza = (
  data: string, importo: number, categoria: string,
  extra: { annullata?: boolean } = {},
) => ({ data_scadenza: data, importo, categoria, annullata: false, ...extra })

describe('aggregaCostiMensili — scadenze', () => {
  it('mette ogni scadenza nel mese della sua data e nella voce della sua categoria', () => {
    const r = aggregaCostiMensili(dati({
      scadenze: [
        scadenza('2026-01-15', 100, 'utenza'),
        scadenza('2026-01-20', 300, 'finanziamento'),
        scadenza('2026-03-10', 500, 'assegno'),
        scadenza('2026-03-11', 50, 'altro'),
        scadenza('2026-06-30', 900, 'tassa'),
      ],
    }), '2026', '2026-12-31')

    expect(r.mesi[0].voci.utenze).toBe(100)
    expect(r.mesi[0].voci.finanziamenti).toBe(300)
    expect(r.mesi[0].fissi).toBe(400)
    expect(r.mesi[2].variabili).toBe(550)
    expect(r.mesi[5].tasse).toBe(900)
    expect(r.totaleAnno).toBe(1850)
  })

  it('conta le scadenze NON pagate: è competenza, non cassa', () => {
    const r = aggregaCostiMensili(dati({
      scadenze: [scadenza('2026-11-30', 1200, 'finanziamento')],
    }), '2026', '2026-09-12')

    expect(r.mesi[10].fissi).toBe(1200)
    expect(r.totaleAnno).toBe(1200)
  })

  it('esclude le scadenze annullate', () => {
    const r = aggregaCostiMensili(dati({
      scadenze: [
        scadenza('2026-02-01', 400, 'utenza'),
        scadenza('2026-02-02', 999, 'utenza', { annullata: true }),
      ],
    }), '2026', '2026-12-31')

    expect(r.mesi[1].voci.utenze).toBe(400)
  })

  it('ignora le scadenze di un altro anno e le date non valide', () => {
    const r = aggregaCostiMensili(dati({
      scadenze: [
        scadenza('2025-04-01', 700, 'assegno'),
        scadenza('2027-04-01', 700, 'assegno'),
        { data_scadenza: null, importo: 700, categoria: 'assegno', annullata: false },
      ],
    }), '2026', '2026-12-31')

    expect(r.totaleAnno).toBe(0)
    expect(r.haCosti).toBe(false)
  })

  it('restituisce sempre dodici mesi, anche quelli senza costi', () => {
    const r = aggregaCostiMensili(dati({
      scadenze: [scadenza('2026-05-05', 10, 'utenza')],
    }), '2026', '2026-12-31')

    expect(r.mesi).toHaveLength(12)
    expect(r.mesi.map((m) => m.mese)[0]).toBe('Gen')
    expect(r.mesi[0].totale).toBe(0)
    expect(r.mesi[4].totale).toBe(10)
  })

  it('una categoria sconosciuta entra fra i costi variabili', () => {
    const r = aggregaCostiMensili(dati({
      scadenze: [scadenza('2026-07-07', 250, 'leasing_auto')],
    }), '2026', '2026-12-31')

    expect(r.mesi[6].voci.altro).toBe(250)
    expect(r.mesi[6].variabili).toBe(250)
  })
})

describe('aggregaCostiMensili — stipendi', () => {
  it('una busta paga conta nel mese del suo periodo, non in quello del bonifico', () => {
    // Busta di settembre: il costo è di settembre anche se il bonifico parte a ottobre.
    const r = aggregaCostiMensili(dati({
      buste: [{ periodo: '2026-09-01', netto: 1800 }],
    }), '2026', '2026-12-31')

    expect(r.mesi[8].voci.stipendi).toBe(1800)
    expect(r.mesi[9].voci.stipendi).toBe(0)
    expect(r.mesi[8].fissi).toBe(1800)
  })

  it('somma più buste dello stesso mese', () => {
    const r = aggregaCostiMensili(dati({
      buste: [
        { periodo: '2026-04-01', netto: 1500 },
        { periodo: '2026-04-01', netto: 1650.5 },
      ],
    }), '2026', '2026-12-31')

    expect(r.mesi[3].voci.stipendi).toBe(3150.5)
  })

  it('ignora le buste di un altro anno', () => {
    const r = aggregaCostiMensili(dati({
      buste: [{ periodo: '2025-09-01', netto: 1800 }],
    }), '2026', '2026-12-31')

    expect(r.totaleAnno).toBe(0)
  })

  it('degli altri dipendenti conta lo stipendio maturato, non il pagamento', () => {
    const r = aggregaCostiMensili(dati({
      movimentiAltri: [
        { periodo: '2026-02-01', tipo: 'stipendio', importo: 900 },
        { periodo: '2026-02-01', tipo: 'pagamento', importo: 900 },
      ],
    }), '2026', '2026-12-31')

    expect(r.mesi[1].voci.stipendi).toBe(900)
  })

  it('un movimento settimanale finisce nel mese che contiene il suo lunedì', () => {
    // 2026-03-30 è un lunedì: la settimana sconfina in aprile, il costo resta a marzo.
    const r = aggregaCostiMensili(dati({
      movimentiAltri: [{ periodo: '2026-03-30', tipo: 'stipendio', importo: 400 }],
    }), '2026', '2026-12-31')

    expect(r.mesi[2].voci.stipendi).toBe(400)
    expect(r.mesi[3].voci.stipendi).toBe(0)
  })

  it('buste e altri dipendenti si sommano nella stessa voce', () => {
    const r = aggregaCostiMensili(dati({
      buste: [{ periodo: '2026-05-01', netto: 2000 }],
      movimentiAltri: [{ periodo: '2026-05-01', tipo: 'stipendio', importo: 750 }],
    }), '2026', '2026-12-31')

    expect(r.mesi[4].voci.stipendi).toBe(2750)
    expect(r.famiglie[0].totale).toBe(2750)
  })
})
