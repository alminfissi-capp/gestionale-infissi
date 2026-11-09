import { describe, expect, it } from 'vitest'
import { assegnazioniDaApplicare, conAssegnazioniPiuRecenti, inviateConfermate, posizioneSicura, remotiDaApplicare } from './sync-rilievi'

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

describe('assegnazioniDaApplicare: profili assegnati in ufficio arrivano anche se la voce non e cambiata', () => {
  const a = { profili: { T0: { fpId: 1, codice: 'UP61833', descrizione: null } }, riempimenti: {} }
  const loc = (at?: string | null) => new Map([['v', { assegnazioniAt: at }]])
  it('remota piu recente: si applica', () =>
    expect(assegnazioniDaApplicare(loc('2026-11-08T10:00:00Z'), [{ id: 'v', assegnazioni: a, assegnazioniAt: '2026-11-08T11:00:00+00:00' }]))
      .toEqual([{ id: 'v', assegnazioni: a, assegnazioniAt: '2026-11-08T11:00:00+00:00' }]))
  it('remota uguale o piu vecchia: niente', () => {
    expect(assegnazioniDaApplicare(loc('2026-11-08T11:00:00Z'), [{ id: 'v', assegnazioni: a, assegnazioniAt: '2026-11-08T11:00:00+00:00' }])).toEqual([])
    expect(assegnazioniDaApplicare(loc('2026-11-08T12:00:00Z'), [{ id: 'v', assegnazioni: a, assegnazioniAt: '2026-11-08T11:00:00Z' }])).toEqual([])
  })
  it('locale senza istante: si applica', () =>
    expect(assegnazioniDaApplicare(loc(null), [{ id: 'v', assegnazioni: a, assegnazioniAt: '2026-11-08T11:00:00Z' }])).toHaveLength(1))
  it('remota senza istante: mai', () =>
    expect(assegnazioniDaApplicare(loc(null), [{ id: 'v', assegnazioni: a, assegnazioniAt: null }])).toEqual([]))
  it('voce che nel telefono non c e: niente (ci pensa il bulkPut)', () =>
    expect(assegnazioniDaApplicare(new Map(), [{ id: 'v', assegnazioni: a, assegnazioniAt: '2026-11-08T11:00:00Z' }])).toEqual([]))
})

describe('voce ricevuta: le assegnazioni piu recenti del telefono restano', () => {
  const vecchie = { profili: {}, riempimenti: {} }
  const nuove = { profili: { T0: { fpId: 1, codice: 'UP1', descrizione: null } }, riempimenti: {} }
  const remota = { id: 'v', aggiornatoAt: '2026-11-09T12:00:00Z', assegnazioni: vecchie, assegnazioniAt: '2026-11-09T10:00:00+00:00' }
  it('nel telefono ce ne sono di piu recenti (salvate durante la ricezione): si tengono', () =>
    expect(conAssegnazioniPiuRecenti(remota, { assegnazioni: nuove, assegnazioniAt: '2026-11-09T11:00:00Z' }))
      .toEqual({ ...remota, assegnazioni: nuove, assegnazioniAt: '2026-11-09T11:00:00Z' }))
  it('quelle del server sono piu recenti, o il telefono non ne ha: vince il server', () => {
    expect(conAssegnazioniPiuRecenti(remota, { assegnazioni: nuove, assegnazioniAt: '2026-11-09T09:00:00Z' })).toEqual(remota)
    expect(conAssegnazioniPiuRecenti(remota, undefined)).toEqual(remota)
  })
})
