import { describe, it, expect } from 'vitest'
import { applicaOrdine, spostaBlocco } from './ordine-blocchi'

const TUTTI = ['a', 'b', 'c', 'd']

describe('applicaOrdine', () => {
  it('senza ordine salvato lascia quello di partenza', () => {
    expect(applicaOrdine(TUTTI, undefined)).toEqual(['a', 'b', 'c', 'd'])
    expect(applicaOrdine(TUTTI, [])).toEqual(['a', 'b', 'c', 'd'])
  })

  it('rispetta l’ordine salvato', () => {
    expect(applicaOrdine(TUTTI, ['c', 'a', 'd', 'b'])).toEqual(['c', 'a', 'd', 'b'])
  })

  it('accoda i blocchi che l’ordine salvato non conosce, nel loro ordine originale', () => {
    expect(applicaOrdine(TUTTI, ['d', 'b'])).toEqual(['d', 'b', 'a', 'c'])
  })

  it('scarta gli identificativi che non esistono più', () => {
    expect(applicaOrdine(TUTTI, ['c', 'sparito', 'a'])).toEqual(['c', 'a', 'b', 'd'])
  })
})

describe('spostaBlocco', () => {
  it('sposta in su di una posizione', () => {
    expect(spostaBlocco(TUTTI, 'c', 'su')).toEqual(['a', 'c', 'b', 'd'])
  })

  it('sposta in giù di una posizione', () => {
    expect(spostaBlocco(TUTTI, 'b', 'giu')).toEqual(['a', 'c', 'b', 'd'])
  })

  it('in cima non si sale, in fondo non si scende', () => {
    expect(spostaBlocco(TUTTI, 'a', 'su')).toEqual(TUTTI)
    expect(spostaBlocco(TUTTI, 'd', 'giu')).toEqual(TUTTI)
  })

  it('un identificativo sconosciuto non cambia niente', () => {
    expect(spostaBlocco(TUTTI, 'zzz', 'su')).toEqual(TUTTI)
  })

  it('non modifica l’array ricevuto', () => {
    const originale = [...TUTTI]
    spostaBlocco(originale, 'c', 'su')
    expect(originale).toEqual(TUTTI)
  })
})
