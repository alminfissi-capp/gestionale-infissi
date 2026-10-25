import { describe, expect, it } from 'vitest'
import type { KitStruttura, NodoStruttura } from './strutture-xml'
import {
  accessoriScoperti, codiciAColore, coperturaColori, domandeAccessori, domandeDoppie, famigliaDaNome, riallineaMano,
  scegliAccessorio, scegliFamiglia, scegliKit, schemaOpzioni, sceltoIn, titoloGruppo, varianteFamiglia, type AccessorioAColore,
} from './opzioni-voce'
import type { GruppoAccessoriOpzionali } from './rilievo-fp'

const kit = (codice: string, gruppo: number | null, confermato = false, extra: Partial<KitStruttura> = {}): KitStruttura => ({
  codice, descrizione: extra.descrizione ?? codice, serie: '', opzionale: true, confermato, accessori: [], gruppo,
  gruppoTipo: gruppo ? 0 : null, gruppoNome: gruppo === 74 ? '1B -SCELTA CERNIERA 2 A/R' : gruppo === 3 ? '2A - SCELTA MANIGLIA PER RIBALTA'
    : gruppo === 5 ? '1A - SCELTA TELAIO' : gruppo === 59 ? '1B SCELTA FERRAMENTA PER 2 ANTE' : null,
  ...extra,
})
const nodo = (codice: number, tipo: number, k: KitStruttura[], figli: NodoStruttura[] = []): NodoStruttura => ({
  tipo, codice, elementi: 1, x: null, y: null, prm: [], macro: null, ante: [], ird: [], pezzi: [], accessori: [], kit: k, figli,
})

// PLANET 62 2 ante a ribalta, come la voce del caso Agrusa.
const planet = [nodo(1, 8600, [kit('PLANET TEL01- L', 5), kit('PLANET TEL01- Z/T', 5, true)], [
  nodo(2, 8610, [
    kit('PLANET 2AR COMPLANARE-DS', 74, true), kit('PLANET 2AR-SCOMPARSA-DS', 74), kit('PLANET 2AR-SCOMPARSA-RISTRUTT', 74),
    kit('PLANET 2AR-SORMONTO-DS', 74), kit('PLANET 2AR-SORMONTO-RISTRUTT', 74),
    kit('PLANET  CREMONESE A/R-DS', 3), kit('PLANET  EXENS A/R-DS', 3, true), kit('PLANET  MARTELLINA A/R-DS', 3),
  ]),
])]

describe('schemaOpzioni', () => {
  const s = schemaOpzioni(planet)

  it('PLANET 2 ante: tre domande, cerniere per prime con A vista / A scomparsa', () => {
    expect(s.domande.map(d => [d.titolo, d.tipo, d.kit.length])).toEqual([
      ['Cerniere', 'cerniere', 5], ['Telaio', 'unica', 2], ['Maniglia per ribalta', 'unica', 3],
    ])
    expect(s.domande[0].kit.filter(k => k.famiglia === 'scomparsa').map(k => k.codice)).toEqual(['PLANET 2AR-SCOMPARSA-DS', 'PLANET 2AR-SCOMPARSA-RISTRUTT'])
    expect(s.altre).toEqual([])
    expect(s.base).toEqual([])
  })

  it('caso Agrusa: sormonto + scomparsa spuntati insieme = doppione', () => {
    expect(domandeDoppie(s, { '2:0': false, '2:2': true, '2:3': true }).map(d => d.titolo)).toEqual(['Cerniere'])
  })

  it('A scomparsa: la variante piu\' simile al kit confermato (complanare -DS -> scomparsa -DS), le altre spente', () => {
    const cerniere = s.domande[0]
    const scelte = scegliFamiglia(cerniere, 'scomparsa', null, {})
    expect(sceltoIn(cerniere, scelte)?.codice).toBe('PLANET 2AR-SCOMPARSA-DS')
    expect(Object.values(scelte).filter(Boolean)).toHaveLength(1)
    expect(sceltoIn(cerniere, scegliFamiglia(cerniere, 'vista', null, scelte))?.codice).toBe('PLANET 2AR COMPLANARE-DS')
  })

  it('kit con nome storpiato senza gruppo ("RISTUTT") entra nel gruppo delle cerniere, non resta acceso da solo', () => {
    const s2 = schemaOpzioni([nodo(2, 8610, [kit('PLANET 2AR-SORMONTO-RISTUTT', null, true), kit('PLANET 2AR COMPLANARE-DS', 74), kit('PLANET 2AR-SCOMPARSA-DS', 74)])])
    expect(s2.domande[0].kit.map(k => k.codice)).toContain('PLANET 2AR-SORMONTO-RISTUTT')
    expect(s2.base).toEqual([])
  })
})

describe('ferramenta GU (PVC): a vista / a scomparsa e mano DX/SX', () => {
  const gu = [nodo(3, 8610, [
    kit('F2-DK-DX', 59, true), kit('F2-DK-SX', 59), kit('F2-DK-SCF-DX', 59), kit('F2-DK-SCF-SX', 59), kit('F2-DK-7.5-DX', 59), kit('F2-DK-7.5-SX', 59),
  ])]
  const d = schemaOpzioni(gu).domande[0]

  it('una domanda Cerniere', () => expect([d.titolo, d.tipo]).toEqual(['Cerniere', 'cerniere']))
  it('variante dalla mano della voce', () => {
    expect(varianteFamiglia(d, 'vista', 'sx')?.codice).toBe('F2-DK-SX')
    expect(varianteFamiglia(d, 'scomparsa', 'sx')?.codice).toBe('F2-DK-SCF-SX')
    expect(varianteFamiglia(d, 'scomparsa', null)?.codice).toBe('F2-DK-SCF-DX')
  })
  it('cambiando la mano si riallinea, restando nella stessa famiglia', () => {
    const s = schemaOpzioni(gu)
    const scomparsaDx = scegliFamiglia(d, 'scomparsa', 'dx', {})
    expect(sceltoIn(d, riallineaMano(s, scomparsaDx, 'sx'))?.codice).toBe('F2-DK-SCF-SX')
  })
})

describe('Easy Door: kit senza gruppo raggruppati dal nome', () => {
  const s = schemaOpzioni([nodo(4, 8610, [
    kit('EASYDOOR 1 ANTA RETTA', null, true, { descrizione: '1 ANTA RETTA' }), kit('EASYDOOR 1 ANTA RAGGIATA', null, false, { descrizione: '1 ANTA RAGGIATA' }),
    kit('EASYDOOR CER', null, true, { descrizione: 'Cerniere per porta Easy Door' }), kit('EASYDOOR PIVOT', null, false, { descrizione: 'Cerniere pivot per porta Easy Door' }),
    kit('EASYDOOR SERR PATENT E60', null, true), kit('EASYDOOR SERR C/CILINDR E60', null), kit('EASYDOOR SERR LIB/OCC E60', null),
    kit('ASTA DI CHIUSURA', null), kit('FIX_TEL', null, true, { descrizione: 'KIT FISSAGGIO TELAIO' }),
  ])])

  it('tipo anta, cerniere e serratura sono domande a scelta unica', () => {
    expect(s.domande.map(d => [d.titolo, d.tipo, d.kit.length]).sort()).toEqual([
      ['Cerniere', 'unica', 2], ['Serratura', 'unica', 3], ['Tipo anta', 'unica', 2],
    ])
  })
  it('aggiunte senza alternative in "Altre opzioni", kit base sempre attivi a parte', () => {
    expect(s.altre.map(k => k.codice)).toEqual(['ASTA DI CHIUSURA'])
    expect(s.base.map(k => k.codice)).toEqual(['FIX_TEL'])
  })
  it('scegliere una serratura spegne le altre', () => {
    const serr = s.domande.find(d => d.titolo === 'Serratura')!
    const scelte = scegliKit(serr, serr.kit[2].chiave, {})
    expect(serr.kit.map(k => scelte[k.chiave])).toEqual([false, false, true])
  })
})

describe('nomi', () => {
  it('titoli puliti dei gruppi di FP PRO', () => {
    expect(titoloGruppo('1B -SCELTA CERNIERA 2 A/R')).toBe('Cerniera 2 a/r')
    expect(titoloGruppo('2A - SCELTA MANIGLIA PER RIBALTA')).toBe('Maniglia per ribalta')
    expect(titoloGruppo('SCELTA TIPO SERRATURA')).toBe('Serratura')
    expect(titoloGruppo(null)).toBe('Scelta')
  })
  it('famiglie dal nome', () => {
    expect(famigliaDaNome({ codice: 'PLANET MARTELLINA A/R', descrizione: '' })).toBe('Maniglia')
    expect(famigliaDaNome({ codice: 'FIX_TEL', descrizione: 'KIT FISSAGGIO TELAIO' })).toBeNull()
  })
})

describe('accessori facoltativi dentro un kit (scorrevole SLIDE 80, MARTELLINA + MARTELLINA)', () => {
  const g: GruppoAccessoriOpzionali = {
    titolo: 'MARTELLINA + MARTELLINA', kit: '10:4', accessori: [
      { chiave: '10:4:ACP 50552', codice: 'ACP 50552', descrizione: 'MARTELLINA AURORA', predefinito: false, gruppo: 72, gruppoTipo: 0, gruppoNome: 'SCELTA TIPO MANIGLIONE' },
      { chiave: '10:4:ACP 80201', codice: 'ACP 80201', descrizione: 'MARTELLINA + VASCHETTA', predefinito: false, gruppo: 72, gruppoTipo: 0, gruppoNome: 'SCELTA TIPO MANIGLIONE' },
      { chiave: '10:4:ACP 8020M', codice: 'ACP 8020M', descrizione: 'SERR.+BORCH.', predefinito: false, gruppo: 9, gruppoTipo: 2, gruppoNome: 'SCELTA SERRATURA' },
      { chiave: '10:4:ACP 8022', codice: 'ACP 8022', descrizione: 'BORCHIA SUPPLEM.', predefinito: false, gruppo: 9, gruppoTipo: 2, gruppoNome: 'SCELTA SERRATURA' },
      { chiave: '10:4:X', codice: 'X', descrizione: 'senza gruppo', predefinito: false },
    ],
  }
  const { domande, caselle } = domandeAccessori(g)

  it('martelline di marche diverse = scelta unica; serratura e borchia = piu\' di uno', () => {
    expect(domande.map(d => [d.titolo, d.tipo, d.accessori.length])).toEqual([['Maniglione', 'unica', 2], ['Serratura', 'multipla', 2]])
    expect(caselle.map(a => a.codice)).toEqual(['X'])
  })
  it('scegliendo una martellina l\'altra si spegne', () => {
    expect(scegliAccessorio(domande[0], '10:4:ACP 80201', { '10:4:ACP 50552': true }))
      .toEqual({ '10:4:ACP 50552': false, '10:4:ACP 80201': true })
  })
})

describe('colori accessori', () => {
  const albero = [nodo(2, 8610, [
    { ...kit('KIT A', 3, true), codiciColore: ['MAN1', 'CERN1'] },
    { ...kit('KIT B', 3), codiciColore: ['MAN2'] },
    { ...kit('BASE', null), opzionale: false, codiciColore: ['CERN1', 'SQ'] },
  ])]
  albero[0].codiciColore = ['TAPPO']
  const mappa = new Map<string, AccessorioAColore>([
    ['MAN1', { codice: 'MAN1', colori: [62, 63], generale: false }],
    ['CERN1', { codice: 'CERN1', colori: [62], generale: false }],
    ['SQ', { codice: 'SQ', colori: [62, 59], generale: true }],
    ['TAPPO', { codice: 'TAPPO', colori: [63], generale: false }],
  ])

  it('solo gli accessori a colore dei kit attivi (obbligatori e scelti) e dei nodi', () => {
    expect(codiciAColore(albero, {}).sort()).toEqual(['CERN1', 'MAN1', 'SQ', 'TAPPO'])
    expect(codiciAColore(albero, { '2:0': false, '2:1': true }).sort()).toEqual(['CERN1', 'MAN2', 'SQ', 'TAPPO'])
  })
  it('copertura per colore e accessori scoperti', () => {
    const codici = codiciAColore(albero, {})
    expect([...coperturaColori(codici, mappa)].sort()).toEqual([[59, 1], [62, 3], [63, 2]])
    expect(accessoriScoperti(codici, [62], mappa).map(a => a.codice)).toEqual(['TAPPO'])
    expect(accessoriScoperti(codici, [62, 63], mappa)).toEqual([])
  })
})
