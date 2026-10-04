import { describe, it, expect } from 'vitest'
import { sincronizza, messaggioParziale, fonteEmesse, type ArchivioFatture } from '@/lib/fic/sincronizza'
import { FicErrore, FicTroppeRichieste, type FicClient } from '@/lib/fic/client'
import type { DocumentoFic, TipoEmessoFic, TipoSpesaFic } from '@/lib/fic/tipi'
import type { DocumentoMappato, EmessoMappato } from '@/lib/fic/mappa'
import type { VoceLocale } from '@/lib/fic/confronto'

const rata = { id: 1, amount: 10, due_date: '2026-01-31', status: 'not_paid' }
const d = (id: number, updated_at = 'u1', conRate = true, date = '2026-01-10'): DocumentoFic => ({
  id,
  date,
  updated_at,
  entity: { name: `Fornitore ${id}` },
  amount_net: 10,
  amount_gross: 12.2,
  ...(conRate ? { payments_list: [rata] } : {}),
})

function clientFinto(
  elenco: Partial<Record<TipoSpesaFic | TipoEmessoFic, DocumentoFic[] | Error>>,
  opz: { dettaglio?: (id: number) => DocumentoFic | Error } = {},
): FicClient & { richiesteDettaglio: number[] } {
  let n = 0
  const richiesteDettaglio: number[] = []
  return {
    richiesteDettaglio,
    chiamate: () => n,
    aziende: async () => [],
    aggiornaRate: async () => { throw new Error('non usato') },
    metodiPagamento: async () => [],
    aggiornaRateEmesso: async () => { throw new Error('non usato') },
    elencoSpese: async (_c, tipo) => {
      n++
      const r = elenco[tipo] ?? []
      if (r instanceof Error) throw r
      return r
    },
    elencoEmessi: async (_c, tipo) => {
      n++
      const r = elenco[tipo] ?? []
      if (r instanceof Error) throw r
      return r
    },
    emesso: async (_c, id) => {
      n++
      richiesteDettaglio.push(id)
      return { ...d(id), payments_list: [rata] }
    },
    spesa: async (_c, id) => {
      n++
      richiesteDettaglio.push(id)
      // Come FiC: il dettaglio e' lo stesso documento dell'elenco (stesso updated_at), con le rate.
      const dalElenco = Object.values(elenco)
        .flatMap((x) => (Array.isArray(x) ? x : []))
        .find((x) => x.id === id)
      const r = opz.dettaglio
        ? opz.dettaglio(id)
        : dalElenco
          ? { ...dalElenco, payments_list: [rata] }
          : d(id)
      if (r instanceof Error) throw r
      return r
    },
  }
}

function archivioFinto(locali: VoceLocale[] = []) {
  const salvati: DocumentoMappato[] = []
  const lotti: number[] = []
  const eliminati: number[] = []
  const archivio: ArchivioFatture = {
    vociLocali: async () => locali,
    salva: async (docs) => {
      lotti.push(docs.length)
      salvati.push(...docs)
    },
    elimina: async (ids) => {
      eliminati.push(...ids)
    },
  }
  return { archivio, salvati, lotti, eliminati }
}

const base = { companyId: 42, dal: '2025-01-01', budgetChiamate: 250, limiteMs: 240_000 }

describe('sincronizza', () => {
  it('primo giro completo: salva fatture e note di credito, conta le nuove', async () => {
    const client = clientFinto({ expense: [d(1), d(2)], passive_credit_note: [d(3)] })
    const a = archivioFinto()
    const r = await sincronizza({ ...base, client, archivio: a.archivio })
    expect(r.completa).toBe(true)
    expect(r.motivoStop).toBeNull()
    expect(r.conteggi).toEqual({ nuove: 3, aggiornate: 0, eliminate: 0 })
    expect(a.salvati.map((s) => [s.fattura.fic_id, s.fattura.tipo])).toEqual(
      expect.arrayContaining([[1, 'fattura'], [2, 'fattura'], [3, 'nota_credito']]),
    )
    expect(client.richiesteDettaglio).toEqual([]) // payments_list gia' nell'elenco
  })

  it('giro successivo: tocca solo modificate, elimina le sparite', async () => {
    const client = clientFinto({ expense: [d(1, 'u1'), d(2, 'u2')] })
    const a = archivioFinto([
      { fic_id: 1, fic_updated_at: 'u1' },
      { fic_id: 2, fic_updated_at: 'vecchio' },
      { fic_id: 9, fic_updated_at: 'u1' },
    ])
    const r = await sincronizza({ ...base, client, archivio: a.archivio })
    expect(r.conteggi).toEqual({ nuove: 0, aggiornate: 1, eliminate: 1 })
    expect(a.salvati.map((s) => s.fattura.fic_id)).toEqual([2])
    expect(a.eliminati).toEqual([9])
  })

  it('elenco interrotto da un errore: non elimina e non salva niente', async () => {
    const client = clientFinto({ expense: [d(1)], passive_credit_note: new FicErrore('rete', 502) })
    const a = archivioFinto([{ fic_id: 9, fic_updated_at: 'u1' }])
    await expect(sincronizza({ ...base, client, archivio: a.archivio })).rejects.toBeInstanceOf(FicErrore)
    expect(a.eliminati).toEqual([])
    expect(a.salvati).toEqual([])
  })

  it('senza rate nell\'elenco chiede il dettaglio delle sole nuove/modificate', async () => {
    const client = clientFinto({ expense: [d(1, 'u1', false), d(2, 'u2', false)] })
    const a = archivioFinto([{ fic_id: 1, fic_updated_at: 'u1' }])
    const r = await sincronizza({ ...base, client, archivio: a.archivio })
    expect(client.richiesteDettaglio).toEqual([2])
    expect(r.completa).toBe(true)
    expect(a.salvati[0].rate).toHaveLength(1)
  })

  it('budget esaurito: giro parziale che salva il gia\' scaricato, il giro dopo riprende', async () => {
    const docs = [d(1, 'u', false), d(2, 'u', false), d(3, 'u', false), d(4, 'u', false)]
    const primo = archivioFinto()
    // 2 chiamate di elenco + 2 dettagli = 4
    const r1 = await sincronizza({ ...base, budgetChiamate: 4, client: clientFinto({ expense: docs }), archivio: primo.archivio })
    expect(r1.completa).toBe(false)
    expect(r1.motivoStop).toBe('budget')
    expect(r1.scaricate).toBe(2)
    expect(r1.daScaricare).toBe(4)
    expect(primo.salvati).toHaveLength(2)

    const giaSalvate = primo.salvati.map((s) => ({ fic_id: s.fattura.fic_id, fic_updated_at: s.fattura.fic_updated_at }))
    const secondoClient = clientFinto({ expense: docs })
    const secondo = archivioFinto(giaSalvate)
    const r2 = await sincronizza({ ...base, client: secondoClient, archivio: secondo.archivio })
    expect(r2.completa).toBe(true)
    expect(secondoClient.richiesteDettaglio.sort()).toEqual(
      docs.map((x) => x.id).filter((id) => !giaSalvate.some((g) => g.fic_id === id)).sort(),
    )
  })

  it('salva la data di modifica dell\'elenco anche se il dettaglio ne riporta un\'altra', async () => {
    const docs = [d(1, '2026-01-10 10:00:00', false)]
    const client = clientFinto({ expense: docs }, {
      dettaglio: (id) => ({ ...d(id), updated_at: '2026-01-10T10:00:00+01:00' }),
    })
    const primo = archivioFinto()
    await sincronizza({ ...base, client, archivio: primo.archivio })
    expect(primo.salvati[0].fattura.fic_updated_at).toBe('2026-01-10 10:00:00')

    // Il giro dopo non la rivede come modificata.
    const secondoClient = clientFinto({ expense: docs })
    const secondo = archivioFinto([{ fic_id: 1, fic_updated_at: primo.salvati[0].fattura.fic_updated_at }])
    const r = await sincronizza({ ...base, client: secondoClient, archivio: secondo.archivio })
    expect(r.conteggi).toEqual({ nuove: 0, aggiornate: 0, eliminate: 0 })
    expect(secondoClient.richiesteDettaglio).toEqual([])
  })

  it('tempo esaurito → parziale per tempo', async () => {
    let t = 0
    const client = clientFinto({ expense: [d(1, 'u', false), d(2, 'u', false)] }, {
      dettaglio: (id) => {
        t += 250_000
        return d(id)
      },
    })
    const a = archivioFinto()
    const r = await sincronizza({ ...base, client, archivio: a.archivio, adesso: () => t })
    expect(r.motivoStop).toBe('tempo')
    expect(r.scaricate).toBe(1)
  })

  it('429 durante i dettagli → parziale, salva quelle gia\' scaricate', async () => {
    const client = clientFinto({ expense: [d(1, 'u', false), d(2, 'u', false)] }, {
      dettaglio: (id) => (id === 1 ? d(1) : new FicTroppeRichieste(60)),
    })
    const a = archivioFinto()
    const r = await sincronizza({ ...base, client, archivio: a.archivio })
    expect(r.motivoStop).toBe('troppe_richieste')
    expect(a.salvati).toHaveLength(1)
  })

  it('scarica prima le fatture piu\' recenti', async () => {
    const client = clientFinto({ expense: [d(1, 'u', true, '2025-01-01'), d(2, 'u', true, '2026-06-01')] })
    const a = archivioFinto()
    await sincronizza({ ...base, client, archivio: a.archivio })
    expect(a.salvati.map((s) => s.fattura.fic_id)).toEqual([2, 1])
  })

  it('salva a lotti di 50', async () => {
    const docs = Array.from({ length: 120 }, (_, i) => d(i + 1))
    const a = archivioFinto()
    await sincronizza({ ...base, client: clientFinto({ expense: docs }), archivio: a.archivio })
    expect(a.lotti).toEqual([50, 50, 20])
  })
})

describe('sincronizza con la fonte delle fatture emesse', () => {
  it('legge fatture e note di credito emesse e le mappa come emesse', async () => {
    const client = clientFinto({ invoice: [d(1)], credit_note: [d(2, 'u1', false)], expense: [d(9)] })
    const salvati: EmessoMappato[] = []
    const archivio: ArchivioFatture<EmessoMappato> = {
      vociLocali: async () => [],
      salva: async (docs) => { salvati.push(...docs) },
      elimina: async () => {},
    }
    const r = await sincronizza({ ...base, client, archivio, fonte: fonteEmesse(client, 42) })
    expect(r.conteggi.nuove).toBe(2)
    expect(salvati.map((s) => [s.fattura.fic_id, s.fattura.tipo, s.fattura.cliente_nome])).toEqual(
      expect.arrayContaining([[1, 'fattura', 'Fornitore 1'], [2, 'nota_credito', 'Fornitore 2']]),
    )
    expect(client.richiesteDettaglio).toEqual([2])
  })
})

describe('messaggioParziale', () => {
  const r = { completa: false, conteggi: { nuove: 250, aggiornate: 0, eliminate: 0 }, daScaricare: 1340, scaricate: 250 }
  it('budget o tempo → invito a premere di nuovo', () => {
    expect(messaggioParziale({ ...r, motivoStop: 'budget' })).toBe(
      'Sincronizzate 250 fatture su 1.340: premi di nuovo Sincronizza per continuare',
    )
    expect(messaggioParziale({ ...r, motivoStop: 'tempo' })).toBe(
      'Sincronizzate 250 fatture su 1.340: premi di nuovo Sincronizza per continuare',
    )
  })
  it('troppe richieste → invito ad aspettare', () => {
    expect(messaggioParziale({ ...r, motivoStop: 'troppe_richieste' })).toBe(
      'Sincronizzate 250 fatture su 1.340. Fatture in Cloud ha chiesto una pausa: riprova fra qualche minuto',
    )
  })
})
