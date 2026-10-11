import { describe, expect, it } from 'vitest'
import { inviateConfermate, remotiDaApplicare } from './sync-rilievi'

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
