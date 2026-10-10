import { describe, expect, it } from 'vitest'
import {
  TABELLE_SYNC, aBlocchi, compatta, confrontaRighe, flag, impronta, numero, testo, verificaSorgente,
  type TabellaSync,
} from './sync-tabelle'

const tabella = (nome: string): TabellaSync => {
  const t = TABELLE_SYNC.find(x => x.supabase === nome)
  if (!t) throw new Error(`tabella ${nome} non trovata`)
  return t
}

describe('conversioni', () => {
  it('numero legge i decimali di mysql2 (stringhe) e scarta il vuoto', () => {
    expect(numero('374.4250')).toBe(374.425)
    expect(numero(2.148)).toBe(2.148)
    expect(numero('0.0000')).toBe(0)
    expect(numero(null)).toBeNull()
    expect(numero('')).toBeNull()
    expect(numero('abc')).toBeNull()
  })
  it('testo toglie gli spazi e trasforma il vuoto in null', () => {
    expect(testo('  TT8002 ')).toBe('TT8002')
    expect(testo('')).toBeNull()
    expect(testo(null)).toBeNull()
  })
  it('flag: in FP PRO "vero" puo\' essere 1 o -1', () => {
    expect(flag(1)).toBe(true)
    expect(flag(-1)).toBe(true)
    expect(flag(0)).toBe(false)
    expect(flag(null)).toBe(false)
  })
  it('compatta toglie null e stringhe vuote, converte le date, scarta i binari', () => {
    const d = new Date('2025-08-06T17:43:08.000Z')
    expect(compatta({ a: 1, b: null, c: '', d, e: Buffer.from('x'), f: 0 }))
      .toEqual({ a: 1, d: '2025-08-06T17:43:08.000Z', f: 0 })
  })
})

describe('mappature', () => {
  it('ci sono le 9 tabelle, nell\'ordine giusto', () => {
    expect(TABELLE_SYNC.map(t => t.supabase)).toEqual([
      'fp_serie', 'fp_profili', 'fp_profili_costi', 'fp_colori', 'fp_accessori',
      'fp_accessori_costi', 'fp_vetri', 'fp_kit', 'fp_kit_righe',
    ])
  })

  it('profilo TT8002', () => {
    const r = tabella('fp_profili').mappa({
      pkid: 1201, serieid: 12, codice: 'TT8002', descr: 'Telaio 2 binari', kg_ml: 2.148,
      larghezza: 46.7, costo_kg: '0.0000', costo_ml: '0.0000', varlistino: '0.0000',
      tolleranza_estrusione: '0.0000', nome_file_dxf: 'AL_SLIDE\\TT8002B.DXF', perimetro: null,
    })
    expect(r).toMatchObject({
      fp_id: 1201, serie_fp_id: 12, codice: 'TT8002', descrizione: 'Telaio 2 binari',
      kg_ml: 2.148, larghezza: 46.7, costo_kg: 0, file_dxf: 'AL_SLIDE\\TT8002B.DXF',
    })
    expect(r.dati).not.toHaveProperty('perimetro')
  })

  it('costo profilo per colore', () => {
    expect(tabella('fp_profili_costi').mappa({
      pkid: 9, profiloid: 1201, trattsupid: 41, codiceproftrattato: '',
      costo_kg: '9.4400', costo_ml: '0.0000', varlistino: '0.0000',
    })).toMatchObject({ fp_id: 9, profilo_fp_id: 1201, colore_fp_id: 41, codice_trattato: null, costo_kg: 9.44, costo_ml: 0 })
  })

  it('colore: trattamento superficiale', () => {
    expect(tabella('fp_colori').mappa({
      pkid: 56, descr: '19 - RAL 9010C2 CLAS', tipo: 1, costo_kg: '1.2200', costo_ml: '0.0000',
      costomq: '0.0000', isforprof: 1, isforfit: 0, isforglass: 0, rgbortexture: null,
    })).toMatchObject({
      fp_id: 56, descrizione: '19 - RAL 9010C2 CLAS', costo_kg: 1.22,
      per_profili: true, per_accessori: false, per_vetri: false, rgb: null,
    })
  })

  it('accessorio ACP 8012 con il nome della sua serie', () => {
    expect(tabella('fp_accessori').mappa({
      pkid: 79, serieid: 5, codice: 'ACP 8012', descr: 'KIT CHIUSURA UNIVERSALE',
      costo_grezzo: '374.4250', un_vend: 50, confezione: 1, min_fatt: 0, varlistino: '0.0000',
      serie_nome: 'ALSISTEM SLIDE 80/106',
    })).toMatchObject({
      fp_id: 79, serie: 'ALSISTEM SLIDE 80/106', codice: 'ACP 8012',
      prezzo: 374.425, unita_vendita: 50, confezione: 1,
    })
  })

  it('vetro senza prezzo resta con prezzo 0 (la pagina lo segnala)', () => {
    expect(tabella('fp_vetri').mappa({
      pkid: 345, codice: '33.1SAT_15_4', descr: null, costo_grezzo: '0.0000', min_fatt: 0.5,
      spessore: 26, kg_mq: 27.5, varlistino: '0.0000', vetroisolante: 1,
    })).toMatchObject({ fp_id: 345, codice: '33.1SAT_15_4', descrizione: null, prezzo_mq: 0, min_fatt: 0.5, isolante: true })
  })

  it('riga di kit con regola a fasce', () => {
    expect(tabella('fp_kit_righe').mappa({
      iditem: 49550, kitid: 1, tipo: 1, codice: 'MA5605', descr: 'Cerniera a pettine',
      num_base: 2, opzionale: 0, dim_rif: 1, lim_inf_range: 1501, lim_sup_range: 4000,
      step: 0, formulal: '', formulah: '', formular: 'w/2', formuladist: null,
    })).toMatchObject({
      fp_id: 49550, kit_fp_id: 1, codice: 'MA5605', quantita: 2, opzionale: false,
      dim_rif: 1, lim_inf: 1501, lim_sup: 4000, passo: 0, formula_l: null, formula_r: 'w/2',
    })
  })

  it('una riga senza chiave fa fallire (non si inventano id)', () => {
    expect(() => tabella('fp_serie').mappa({ pkid: null, serie: 'X' })).toThrow(/id non valido/)
  })
})

describe('verificaSorgente', () => {
  const t = tabella('fp_vetri')
  const tutte = t.colonne
  it('tutto a posto', () => {
    expect(verificaSorgente(t, [{ pkid: 1 }], tutte)).toBeNull()
  })
  it('tabella vuota: FP PRO chiuso o archivio sbagliato, non si scrive nulla', () => {
    expect(verificaSorgente(t, [], tutte)).toMatch(/vetri.*vuota/)
  })
  it('colonna sparita dopo un aggiornamento di FP PRO', () => {
    const msg = verificaSorgente(t, [{ pkid: 1 }], tutte.filter(c => c !== 'costo_grezzo'))
    expect(msg).toMatch(/vetri/)
    expect(msg).toMatch(/costo_grezzo/)
  })
  it('i nomi di colonna di MySQL possono arrivare in maiuscolo', () => {
    expect(verificaSorgente(t, [{ pkid: 1 }], tutte.map(c => c.toUpperCase()))).toBeNull()
  })
})

describe('aBlocchi', () => {
  it('spezza in blocchi della dimensione data', () => {
    expect(aBlocchi([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(aBlocchi([], 500)).toEqual([])
  })
})

describe('impronta', () => {
  it('non dipende dall\'ordine delle chiavi', () => {
    expect(impronta({ fp_id: 1, b: 2, a: { y: 1, x: [2, 1] }, dati: {} }))
      .toBe(impronta({ a: { x: [2, 1], y: 1 }, dati: {}, fp_id: 1, b: 2 }))
  })
  it('cambia se cambia un valore', () => {
    expect(impronta({ fp_id: 1, prezzo: 1, dati: {} })).not.toBe(impronta({ fp_id: 1, prezzo: 2, dati: {} }))
  })
})

describe('confrontaRighe', () => {
  const r = (fp_id: number, prezzo: number) => ({ fp_id, prezzo, dati: {} })
  const esistente = (fp_id: number, prezzo: number, presente = true) =>
    ({ fp_id, impronta: impronta(r(fp_id, prezzo)), presente })

  it('scrive solo righe nuove o cambiate, salta quelle uguali', () => {
    const { daScrivere, daSegnareAssenti } = confrontaRighe(
      [r(1, 10), r(2, 20), r(3, 30)],
      [esistente(1, 10), esistente(2, 99)],
    )
    expect(daScrivere.map(x => x.fp_id)).toEqual([2, 3])
    expect(daSegnareAssenti).toEqual([])
  })
  it('una riga sparita da FP PRO va segnata assente, una gia\' assente no', () => {
    const { daScrivere, daSegnareAssenti } = confrontaRighe(
      [r(1, 10)],
      [esistente(1, 10), esistente(2, 20), esistente(3, 30, false)],
    )
    expect(daScrivere).toEqual([])
    expect(daSegnareAssenti).toEqual([2])
  })
  it('una riga ricomparsa uguale a prima va riscritta per tornare presente', () => {
    const { daScrivere } = confrontaRighe([r(3, 30)], [esistente(3, 30, false)])
    expect(daScrivere.map(x => x.fp_id)).toEqual([3])
  })
})
