import { describe, expect, it } from 'vitest'
import { listinoDaRighe, type RigheListino } from './listino'

const righe: RigheListino = {
  profili: [
    { fp_id: 1737, codice: 'TT8002', kg_ml: 2.148, costo_kg: 0, costo_ml: 0 },
    { fp_id: 1739, codice: 'TT8002B', kg_ml: 0, costo_kg: 0, costo_ml: 0 },
    { fp_id: 1661, codice: 'TAC807', kg_ml: 0, costo_kg: 0, costo_ml: 0 },
    { fp_id: 9, codice: 'SENZAPREZZO', kg_ml: 1, costo_kg: 0, costo_ml: 0 },
  ],
  costi: [
    { profilo_fp_id: 1737, colore_fp_id: 56, costo_kg: 9.64, costo_ml: 0 },
    { profilo_fp_id: 1737, colore_fp_id: 50, costo_kg: 11.65, costo_ml: 0 },
    { profilo_fp_id: 1661, colore_fp_id: 51, costo_kg: 0, costo_ml: 2.9024 },
    { profilo_fp_id: 9, colore_fp_id: 41, costo_kg: 5, costo_ml: 0 },
    { profilo_fp_id: 9, colore_fp_id: 42, costo_kg: 6, costo_ml: 0 },
  ],
  barre: [{ profilo_fp_id: 1737, lunghezza: 6500 }, { profilo_fp_id: 1661, lunghezza: 3000 }],
  scarti: [{ codice: 'TT8002', testa: 30, coda: 40 }],
  componenti: [
    { composto_fp_id: 1739, componente_fp_id: 1737, principale: true, offset_mm: 0 },
    { composto_fp_id: 1739, componente_fp_id: 1661, principale: false, offset_mm: 42 },
  ],
  sezioni: [{ codice: 'TT8002B', vista: 46.7, aletta: 22 }],
  accessori: [
    { codice: 'AGP 4000', serie: 'ALSISTEM GUARNIZ.TUTTE + ROT', prezzo: 114.32, unita_vendita: 400 },
    { codice: 'AGP 4000', serie: 'ALTRA', prezzo: 182.08, unita_vendita: 400 },
  ],
  vetri: [{ codice: '33.1_10_33.1S', prezzo_mq: 68, min_fatt: 0, kg_mq: 34 }],
  pannelli: [{ codice: 'SANDWICH_28', prezzo_mq: 161, min_fatt: 0 }],
}

describe('listinoDaRighe', () => {
  const l = listinoDaRighe(righe, { fpId: 56, tolleranzaPeso: 0.03 })
  it('prezzo al kg del colore della voce e tolleranza di peso del colore', () => {
    expect(l.profilo('TT8002')).toMatchObject({ kgMl: 2.148, euroKg: 9.64, fattorePeso: 1.03, barra: 6500, testa: 30, coda: 40 })
  })
  it('profilo con un solo trattamento fisso (guarnizione): quel prezzo al metro', () => {
    expect(l.profilo('TAC807')).toMatchObject({ euroMl: 2.9024, barra: 3000, testa: 30, coda: 30 })
  })
  it('profilo senza il colore della voce e con piu\' colori: nessun prezzo', () => {
    expect(l.profilo('SENZAPREZZO')).toMatchObject({ euroKg: null, euroMl: null })
  })
  it('composto con i componenti per codice', () => {
    expect(l.profilo('TT8002B')!.componenti).toEqual([
      { codice: 'TT8002', principale: true, offset: 0 }, { codice: 'TAC807', principale: false, offset: 42 },
    ])
  })
  it('profilo assente: null; maiuscole/minuscole indifferenti', () => {
    expect(l.profilo('NESSUNO')).toBeNull()
    expect(l.profilo('tt8002')).not.toBeNull()
  })
  it('accessorio della stessa serie, altrimenti il primo', () => {
    expect(l.accessorio('AGP 4000', 'ALTRA')).toEqual({ prezzo: 182.08, unitaVendita: 400 })
    expect(l.accessorio('AGP 4000', 'SCONOSCIUTA')).toEqual({ prezzo: 114.32, unitaVendita: 400 })
    expect(l.accessorio('X', '')).toBeNull()
  })
  it('vetri, pannelli e sezioni', () => {
    expect(l.vetro('33.1_10_33.1S')).toEqual({ euroMq: 68, minFatt: 0, kgMq: 34 })
    expect(l.pannello('SANDWICH_28')).toEqual({ euroMq: 161, minFatt: 0 })
    expect(l.sezione('TT8002B')).toEqual({ vista: 46.7, aletta: 22 })
    expect(l.sezione('TT8002')).toBeNull()
  })
  it('senza colore: si usa il prezzo del profilo se c\'e\', altrimenti l\'unico trattamento', () => {
    const s = listinoDaRighe(righe, null)
    expect(s.profilo('TAC807')).toMatchObject({ euroMl: 2.9024, fattorePeso: 1 })
    expect(s.profilo('TT8002')).toMatchObject({ euroKg: null })
  })
})
