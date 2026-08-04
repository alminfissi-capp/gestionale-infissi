import { describe, it, expect, vi } from 'vitest'
import { conRiprova } from '@/lib/riprova'

describe('conRiprova', () => {
  it('non riprova quando va bene al primo colpo', async () => {
    const op = vi.fn().mockResolvedValue('ok')
    await expect(conRiprova(op)).resolves.toBe('ok')
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('riprova e restituisce il risultato del tentativo riuscito', async () => {
    const op = vi.fn()
      .mockRejectedValueOnce(new Error('rete assente'))
      .mockResolvedValue('ok')
    await expect(conRiprova(op, { attesaMs: 1 })).resolves.toBe('ok')
    expect(op).toHaveBeenCalledTimes(2)
  })

  it('insiste fino al numero di tentativi previsto', async () => {
    const op = vi.fn()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockResolvedValue('ok')
    await expect(conRiprova(op, { attesaMs: 1 })).resolves.toBe('ok')
    expect(op).toHaveBeenCalledTimes(3)
  })

  it('rilancia l ultimo errore quando falliscono tutti', async () => {
    const op = vi.fn()
      .mockRejectedValueOnce(new Error('primo'))
      .mockRejectedValueOnce(new Error('secondo'))
      .mockRejectedValueOnce(new Error('ultimo'))
    // Chi chiama deve poter distinguere il fallimento definitivo: senza questo
    // un caricamento perso passerebbe per riuscito
    await expect(conRiprova(op, { attesaMs: 1 })).rejects.toThrow('ultimo')
    expect(op).toHaveBeenCalledTimes(3)
  })

  it('rispetta un numero di tentativi diverso', async () => {
    const op = vi.fn().mockRejectedValue(new Error('sempre giu'))
    await expect(conRiprova(op, { tentativi: 5, attesaMs: 1 })).rejects.toThrow('sempre giu')
    expect(op).toHaveBeenCalledTimes(5)
  })

  it('aspetta di piu a ogni tentativo invece di martellare la rete', async () => {
    vi.useFakeTimers()
    try {
      const op = vi.fn()
        .mockRejectedValueOnce(new Error('1'))
        .mockRejectedValueOnce(new Error('2'))
        .mockResolvedValue('ok')

      const promessa = conRiprova(op, { attesaMs: 400 })
      // primo tentativo subito
      await vi.advanceTimersByTimeAsync(0)
      expect(op).toHaveBeenCalledTimes(1)
      // secondo dopo 400ms
      await vi.advanceTimersByTimeAsync(400)
      expect(op).toHaveBeenCalledTimes(2)
      // terzo dopo altri 800ms, non 400
      await vi.advanceTimersByTimeAsync(400)
      expect(op).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(400)
      expect(op).toHaveBeenCalledTimes(3)

      await expect(promessa).resolves.toBe('ok')
    } finally {
      vi.useRealTimers()
    }
  })
})
