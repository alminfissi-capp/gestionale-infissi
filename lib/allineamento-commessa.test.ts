import { describe, it, expect } from 'vitest'
import { statoAllineamento } from './allineamento-commessa'
import type {
  CommessaCompleta,
  PreventivoCommessa,
  PreventivoPerCommessa,
} from '@/types/commessa'

// I tipi veri hanno decine di campi che alla funzione non servono: le fabbriche
// tengono i test leggibili e il cast confinato qui dentro.
function commessa(over: Partial<CommessaCompleta> = {}): CommessaCompleta {
  return {
    id: 'c1',
    totale: 2400,
    anonima: false,
    preventivo_id: null,
    preventivi_collegati: [],
    ...over,
  } as CommessaCompleta
}

function link(preventivoId: string | null): PreventivoCommessa {
  return { id: `pc-${preventivoId ?? 'manuale'}`, preventivo_id: preventivoId } as PreventivoCommessa
}

function prev(id: string, totale: number, iva = 0): PreventivoPerCommessa {
  return { id, numero: id, cliente_nome: '', imponibile: totale - iva, iva_totale: iva, totale }
}

function mappa(...ps: PreventivoPerCommessa[]): Map<string, PreventivoPerCommessa> {
  return new Map(ps.map((p) => [p.id, p]))
}

describe('statoAllineamento', () => {
  it('dice allineata quando i totali coincidono', () => {
    const c = commessa({ totale: 2400, preventivi_collegati: [link('p1')] })
    expect(statoAllineamento(c, mappa(prev('p1', 2400)))).toEqual({ tipo: 'allineata' })
  })

  it('segnala la differenza quando il preventivo è stato ritoccato', () => {
    // Il caso Guarracino: preventivo portato da 2400 a 2450, commessa ferma.
    const c = commessa({ totale: 2400, preventivi_collegati: [link('p1')] })
    expect(statoAllineamento(c, mappa(prev('p1', 2450)))).toEqual({
      tipo: 'disallineata',
      totaleCommessa: 2400,
      totalePreventivi: 2450,
      ivaPreventivi: 0,
      differenza: 50,
    })
  })

  it('tratta come allineata una differenza da arrotondamento', () => {
    const c = commessa({ totale: 2400, preventivi_collegati: [link('p1')] })
    expect(statoAllineamento(c, mappa(prev('p1', 2400.004)))).toEqual({ tipo: 'allineata' })
  })

  it('somma totale e IVA di più preventivi collegati', () => {
    const c = commessa({ totale: 1000, preventivi_collegati: [link('p1'), link('p2')] })
    expect(statoAllineamento(c, mappa(prev('p1', 1220, 220), prev('p2', 610, 110)))).toEqual({
      tipo: 'disallineata',
      totaleCommessa: 1000,
      totalePreventivi: 1830,
      ivaPreventivi: 330,
      differenza: 830,
    })
  })

  it('tace quando c’è anche un solo preventivo allegato a mano', () => {
    const c = commessa({ totale: 2400, preventivi_collegati: [link('p1'), link(null)] })
    expect(statoAllineamento(c, mappa(prev('p1', 2450)))).toEqual({
      tipo: 'non_confrontabile',
      motivo: 'preventivi_manuali',
    })
  })

  it('tace quando un preventivo collegato non è più leggibile', () => {
    // Succede se il preventivo è stato cancellato o non è più in stato 'accettato':
    // getPreventiviPerCommessa filtra .eq('stato', 'accettato').
    const c = commessa({ totale: 2400, preventivi_collegati: [link('p1')] })
    expect(statoAllineamento(c, mappa())).toEqual({
      tipo: 'non_confrontabile',
      motivo: 'preventivo_mancante',
    })
  })

  it('tace quando non c’è nessun preventivo collegato', () => {
    expect(statoAllineamento(commessa(), mappa())).toEqual({
      tipo: 'non_confrontabile',
      motivo: 'nessun_preventivo',
    })
  })

  it('usa la vecchia colonna preventivo_id quando la junction è vuota', () => {
    const c = commessa({ totale: 2400, preventivo_id: 'p1', preventivi_collegati: [] })
    expect(statoAllineamento(c, mappa(prev('p1', 2450)))).toMatchObject({
      tipo: 'disallineata',
      differenza: 50,
    })
  })

  it('non confronta le vendite anonime', () => {
    const c = commessa({ totale: 100, anonima: true, preventivi_collegati: [link('p1')] })
    expect(statoAllineamento(c, mappa(prev('p1', 200)))).toEqual({
      tipo: 'non_confrontabile',
      motivo: 'nessun_preventivo',
    })
  })
})
