import { describe, it, expect } from 'vitest'
import { salvaDocumenti, type TabelleFatture } from '@/lib/fic/salvataggio'
import { mappaDocumento } from '@/lib/fic/mappa'

const ORA = '2026-09-28T12:00:00.000Z'
const documento = (id: number) =>
  mappaDocumento(
    {
      id,
      date: '2026-01-10',
      updated_at: `2026-01-10 10:00:0${id}`,
      entity: { name: `Fornitore ${id}` },
      payments_list: [{ id: id * 10, amount: 10, due_date: '2026-02-10', status: 'not_paid' }],
    },
    'expense',
    ORA,
  )

function tabelleFinte(opz: { rateFalliscono?: boolean } = {}) {
  const upsert: { fic_id: number; fic_updated_at: string; organization_id: string }[][] = []
  const rateInserite: { fattura_id: string; fic_id: number | null; organization_id: string }[] = []
  const rateEliminate: string[] = []
  const tabelle: TabelleFatture = {
    upsertFatture: async (righe) => {
      upsert.push(righe.map((r) => ({ fic_id: r.fic_id, fic_updated_at: r.fic_updated_at, organization_id: r.organization_id })))
      return righe.map((r) => ({ id: `uuid-${r.fic_id}`, fic_id: r.fic_id }))
    },
    eliminaRate: async (ids) => {
      rateEliminate.push(...ids)
    },
    inserisciRate: async (righe) => {
      if (opz.rateFalliscono) throw new Error('rete')
      rateInserite.push(...righe)
    },
  }
  return { tabelle, upsert, rateInserite, rateEliminate }
}

describe('salvaDocumenti', () => {
  it('salva fatture e rate, e mette la data di modifica vera solo alla fine', async () => {
    const t = tabelleFinte()
    await salvaDocumenti(t.tabelle, 'org1', [documento(1), documento(2)])
    expect(t.upsert).toHaveLength(2)
    expect(t.upsert[0].map((r) => r.fic_updated_at)).toEqual(['', ''])
    expect(t.upsert[1].map((r) => r.fic_updated_at)).toEqual(['2026-01-10 10:00:01', '2026-01-10 10:00:02'])
    expect(t.upsert.flat().every((r) => r.organization_id === 'org1')).toBe(true)
    expect(t.rateEliminate).toEqual(['uuid-1', 'uuid-2'])
    expect(t.rateInserite.map((r) => [r.fattura_id, r.fic_id, r.organization_id])).toEqual([
      ['uuid-1', 10, 'org1'],
      ['uuid-2', 20, 'org1'],
    ])
  })

  it('se le rate non si salvano, la fattura resta con la data vuota e il giro dopo la riscarica', async () => {
    const t = tabelleFinte({ rateFalliscono: true })
    await expect(salvaDocumenti(t.tabelle, 'org1', [documento(1)])).rejects.toThrow('rete')
    expect(t.upsert).toHaveLength(1)
    expect(t.upsert[0][0].fic_updated_at).toBe('')
  })

  it('nessun documento, nessuna scrittura', async () => {
    const t = tabelleFinte()
    await salvaDocumenti(t.tabelle, 'org1', [])
    expect(t.upsert).toEqual([])
  })
})
