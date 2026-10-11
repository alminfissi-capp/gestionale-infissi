import { describe, expect, it } from 'vitest'
import { inviateConfermate, posizioneSicura, remotiDaApplicare } from './sync-rilievi'

const m = (righe: { id: string; aggiornatoAt: string; daInviare?: number }[]) => new Map(righe.map(r => [r.id, r]))

describe('remotiDaApplicare', () => {
  it('nuove e piu\' recenti si applicano, vecchie no', () => {
    const locali = m([{ id: 'a', aggiornatoAt: '2026-10-11T10:00:00Z' }, { id: 'b', aggiornatoAt: '2026-10-11T10:00:00Z' }])
    const r = remotiDaApplicare(locali, [
      { id: 'a', aggiornatoAt: '2026-10-11T11:00:00Z' },
      { id: 'b', aggiornatoAt: '2026-10-11T09:00:00Z' },
      { id: 'c', aggiornatoAt: '2026-10-11T08:00:00Z' },
    ])
    expect(r.map(x => x.id)).toEqual(['a', 'c'])
  })
  it('una modifica locale non inviata e piu\' recente non viene mai sovrascritta', () => {
    const locali = m([{ id: 'a', aggiornatoAt: '2026-10-11T12:00:00Z', daInviare: 1 }])
    expect(remotiDaApplicare(locali, [{ id: 'a', aggiornatoAt: '2026-10-11T11:00:00Z' }])).toEqual([])
  })
})

describe('inviateConfermate', () => {
  it('se la voce e\' cambiata durante l\'invio resta da inviare', () => {
    const inviate = [{ id: 'a', aggiornatoAt: 't1' }, { id: 'b', aggiornatoAt: 't1' }]
    const attuali = m([{ id: 'a', aggiornatoAt: 't1' }, { id: 'b', aggiornatoAt: 't2' }])
    expect(inviateConfermate(inviate, attuali)).toEqual(['a'])
  })
})

describe('regole di unione: casi della revisione', () => {
  it('confronta gli istanti, non il testo (Z contro +00:00, millisecondi)', () => {
    const locali = m([{ id: 'a', aggiornatoAt: '2026-10-11T10:00:00.500Z' }])
    expect(remotiDaApplicare(locali, [{ id: 'a', aggiornatoAt: '2026-10-11T10:00:00.4+00:00' }])).toEqual([])
    expect(remotiDaApplicare(locali, [{ id: 'a', aggiornatoAt: '2026-10-11T10:00:00.6+00:00' }]).map(x => x.id)).toEqual(['a'])
  })
  it('una riga eliminata nel telefono e non ancora comunicata non torna dal server', () => {
    expect(remotiDaApplicare(new Map(), [{ id: 'x', aggiornatoAt: '2026-10-11T10:00:00Z' }], new Set(['x']))).toEqual([])
  })
})

describe('posizioneSicura', () => {
  const adesso = '2026-10-11T10:00:00.000Z'
  it('niente di nuovo: nessuna posizione', () => expect(posizioneSicura(null, adesso)).toBeNull())
  it('ultima riga vecchia: si riparte esattamente dopo di lei', () => {
    const ultima = { segno: '2026-10-11T08:00:00+00:00', chiave: '42' }
    expect(posizioneSicura(ultima, adesso)).toEqual(ultima)
  })
  it('ultima riga degli ultimi 30 secondi: si rilegge da 30 secondi fa (scritture forse non ancora confermate)', () => {
    expect(posizioneSicura({ segno: '2026-10-11T09:59:50+00:00', chiave: '42' }, adesso))
      .toEqual({ segno: '2026-10-11T09:59:30.000Z', chiave: null })
  })
})
