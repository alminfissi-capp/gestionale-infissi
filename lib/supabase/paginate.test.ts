import { describe, it, expect, vi } from 'vitest'
import { selectAll } from './paginate'

/**
 * Finto PostgREST: restituisce le righe richieste dal range, ma mai piu' di
 * `maxRows` per risposta — esattamente il comportamento che tronca in silenzio.
 */
function fintoServer(righeTotali: number, maxRows = 1000) {
  const tabella = Array.from({ length: righeTotali }, (_, i) => ({ id: i }))
  const chiamate: [number, number][] = []
  const pagina = (da: number, a: number) => {
    chiamate.push([da, a])
    return Promise.resolve({
      data: tabella.slice(da, Math.min(a + 1, da + maxRows)),
      error: null,
    })
  }
  return { pagina, chiamate }
}

describe('selectAll', () => {
  it("legge in una sola richiesta una tabella piu' piccola della pagina", async () => {
    const { pagina, chiamate } = fintoServer(206)
    const righe = await selectAll<{ id: number }>(pagina)
    expect(righe).toHaveLength(206)
    expect(chiamate).toHaveLength(1)
    expect(chiamate[0]).toEqual([0, 999])
  })

  it('recupera tutte le righe oltre il tetto, senza buchi ne duplicati', async () => {
    const { pagina, chiamate } = fintoServer(2350)
    const righe = await selectAll<{ id: number }>(pagina)
    expect(righe).toHaveLength(2350)
    expect(righe.map((r) => r.id)).toEqual(Array.from({ length: 2350 }, (_, i) => i))
    expect(chiamate).toHaveLength(3)
  })

  it('con la tabella multipla esatta della pagina paga un giro a vuoto ma non perde righe', async () => {
    const { pagina, chiamate } = fintoServer(2000)
    const righe = await selectAll<{ id: number }>(pagina)
    expect(righe).toHaveLength(2000)
    expect(chiamate).toHaveLength(3) // la terza torna vuota e chiude il ciclo
  })

  it('restituisce un array vuoto sulla tabella vuota', async () => {
    const { pagina } = fintoServer(0)
    await expect(selectAll<{ id: number }>(pagina)).resolves.toEqual([])
  })

  it("propaga l'errore della query invece di restituire righe parziali", async () => {
    const pagina = vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    await expect(selectAll(pagina)).rejects.toThrow('permission denied')
  })

  it('si ferma se il server continua a restituire pagine piene senza fine', async () => {
    // Ogni pagina torna piena: senza rete di sicurezza sarebbe un ciclo infinito
    const pagina = () => Promise.resolve({ data: Array.from({ length: 10 }, (_, i) => ({ id: i })), error: null })
    await expect(selectAll(pagina, 10)).rejects.toThrow(/superate 200 pagine/)
  })
})
