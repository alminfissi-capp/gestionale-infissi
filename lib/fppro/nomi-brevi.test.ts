import { describe, expect, it } from 'vitest'
import { chiaveNomeKit, elencoNomiBrevi, nomiBreviGruppo } from './nomi-brevi'

describe('nomiBreviGruppo', () => {
  it('parole comuni tolte, "Kit" davanti', () => {
    expect(nomiBreviGruppo([
      { codice: 'PLANET  CREMONESE A/R-DS', descrizione: 'Kit Cremonese anta ribalta' },
      { codice: 'PLANET  EXENS A/R-DS', descrizione: 'Kit Exens anta ribalta' },
    ])).toEqual(['Kit Cremonese', 'Kit Exens'])
  })
})

describe('elencoNomiBrevi: pagina dei nomi brevi', () => {
  const kit = [
    { nome: 'PLANET  CREMONESE A/R-DS', descrizione: 'Kit Cremonese anta ribalta', gruppo: 3, gruppoNome: '2A - SCELTA MANIGLIA PER RIBALTA' },
    { nome: 'PLANET  EXENS A/R-DS', descrizione: 'Kit Exens anta ribalta', gruppo: 3, gruppoNome: '2A - SCELTA MANIGLIA PER RIBALTA' },
    { nome: 'PLANET TEL01- L', descrizione: 'Telaio generico a L per finestra', gruppo: 5, gruppoNome: '1A - SCELTA TELAIO' },
    { nome: 'PLANET TEL01- Z/T', descrizione: 'Telaio generico a Z/T per finestra', gruppo: 5, gruppoNome: '1A - SCELTA TELAIO' },
  ]
  const corretti = new Map([[chiaveNomeKit('PLANET  EXENS A/R-DS'), 'Exens nera']])
  const e = elencoNomiBrevi(kit, corretti)
  it('gruppi in ordine di sigla con titolo pulito', () => expect(e.map(g => g.titolo)).toEqual(['Telaio', 'Maniglia per ribalta']))
  it('nome automatico e nome corretto', () => {
    expect(e[1].kit.map(k => [k.codice, k.automatico, k.corretto])).toEqual([
      ['PLANET  CREMONESE A/R-DS', 'Kit Cremonese', null],
      ['PLANET  EXENS A/R-DS', 'Kit Exens', 'Exens nera'],
    ])
    expect(e[1].kit[1].chiave).toBe('kit:planet exens a/r-ds')
  })
})

describe('elencoNomiBrevi: gruppo con piu serie', () => {
  const e = elencoNomiBrevi([
    { nome: 'CIELO TEL01 - L', descrizione: 'Telaio generico a L per finestra', gruppo: 5, gruppoNome: '1A - SCELTA TELAIO' },
    { nome: 'CIELO TEL01 - Z/T', descrizione: 'Telaio generico a Z/T per finestra', gruppo: 5, gruppoNome: '1A - SCELTA TELAIO' },
    { nome: 'PLANET TEL01- L', descrizione: 'Telaio generico a L per finestra', gruppo: 5, gruppoNome: '1A - SCELTA TELAIO' },
    { nome: 'PLANET TEL01- Z/T', descrizione: 'Telaio generico a Z/T per finestra', gruppo: 5, gruppoNome: '1A - SCELTA TELAIO' },
  ], new Map())
  it('un blocco per serie, con gli stessi nomi che si vedono nella voce', () => {
    expect(e.map(g => [g.titolo, g.kit.map(k => k.automatico)])).toEqual([
      ['Telaio · CIELO', ['Telaio L', 'Telaio Z/T']],
      ['Telaio · PLANET', ['Telaio L', 'Telaio Z/T']],
    ])
  })
})
