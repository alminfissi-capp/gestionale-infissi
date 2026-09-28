import { describe, it, expect } from 'vitest'
import {
  creaClientFic,
  FicNonAutorizzato,
  FicTroppeRichieste,
  FicErrore,
  FIC_BASE_URL,
} from '@/lib/fic/client'

type Chiamata = { url: string; auth: string | null }

function fetchFinto(risposte: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>) {
  const chiamate: Chiamata[] = []
  let i = 0
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    chiamate.push({ url: String(input), auth: headers.get('Authorization') })
    const r = risposte[Math.min(i++, risposte.length - 1)]
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status,
      headers: { 'Content-Type': 'application/json', ...(r.headers ?? {}) },
    })
  }) as typeof fetch
  return { impl, chiamate }
}

describe('creaClientFic', () => {
  it('manda il token come Bearer e legge le aziende', async () => {
    const f = fetchFinto([{ status: 200, body: { data: { companies: [{ id: 42, name: 'ALM Infissi srl' }] } } }])
    const c = creaClientFic('tok123', f.impl)
    expect(await c.aziende()).toEqual([{ id: 42, nome: 'ALM Infissi srl' }])
    expect(f.chiamate[0].url).toBe(`${FIC_BASE_URL}/user/companies`)
    expect(f.chiamate[0].auth).toBe('Bearer tok123')
    expect(c.chiamate()).toBe(1)
  })

  it('nessuna azienda → elenco vuoto', async () => {
    const f = fetchFinto([{ status: 200, body: { data: null } }])
    expect(await creaClientFic('t', f.impl).aziende()).toEqual([])
  })

  it('segue la paginazione fino a last_page e codifica il filtro sulla data', async () => {
    const f = fetchFinto([
      { status: 200, body: { current_page: 1, last_page: 2, data: [{ id: 1, date: '2025-02-01', updated_at: 'a' }] } },
      { status: 200, body: { current_page: 2, last_page: 2, data: [{ id: 2, date: '2025-03-01', updated_at: 'b' }] } },
    ])
    const c = creaClientFic('t', f.impl)
    const docs = await c.elencoSpese(42, 'expense', '2025-01-01')
    expect(docs.map((d) => d.id)).toEqual([1, 2])
    expect(c.chiamate()).toBe(2)
    const u = f.chiamate[0].url
    expect(u.startsWith(`${FIC_BASE_URL}/c/42/received_documents?`)).toBe(true)
    expect(u).toContain('type=expense')
    expect(u).toContain('fieldset=detailed')
    expect(u).toContain('per_page=100')
    expect(u).toContain('page=1')
    expect(u).toContain(`q=${encodeURIComponent("date >= '2025-01-01'")}`)
    expect(f.chiamate[1].url).toContain('page=2')
  })

  it('elenco vuoto senza last_page → una sola chiamata', async () => {
    const f = fetchFinto([{ status: 200, body: { data: [] } }])
    const c = creaClientFic('t', f.impl)
    expect(await c.elencoSpese(42, 'passive_credit_note', '2025-01-01')).toEqual([])
    expect(c.chiamate()).toBe(1)
  })

  it('legge il dettaglio di una spesa', async () => {
    const f = fetchFinto([{ status: 200, body: { data: { id: 7, date: '2025-01-05', updated_at: 'x', payments_list: [] } } }])
    const d = await creaClientFic('t', f.impl).spesa(42, 7)
    expect(d.id).toBe(7)
    expect(f.chiamate[0].url).toBe(`${FIC_BASE_URL}/c/42/received_documents/7?fieldset=detailed`)
  })

  it('401 → FicNonAutorizzato', async () => {
    const f = fetchFinto([{ status: 401, body: { error: { message: 'Unauthorized' } } }])
    await expect(creaClientFic('t', f.impl).aziende()).rejects.toBeInstanceOf(FicNonAutorizzato)
  })

  it('429 → FicTroppeRichieste con Retry-After', async () => {
    const f = fetchFinto([{ status: 429, headers: { 'Retry-After': '120' } }])
    const err = await creaClientFic('t', f.impl).aziende().catch((e) => e)
    expect(err).toBeInstanceOf(FicTroppeRichieste)
    expect((err as FicTroppeRichieste).retryAfter).toBe(120)
  })

  it('429 senza Retry-After → retryAfter null', async () => {
    const f = fetchFinto([{ status: 429 }])
    const err = await creaClientFic('t', f.impl).aziende().catch((e) => e)
    expect((err as FicTroppeRichieste).retryAfter).toBeNull()
  })

  it('altri errori → FicErrore col messaggio di FiC', async () => {
    const f = fetchFinto([{ status: 403, body: { error: { message: 'Scope mancante' } } }])
    const err = await creaClientFic('t', f.impl).aziende().catch((e) => e)
    expect(err).toBeInstanceOf(FicErrore)
    expect((err as FicErrore).status).toBe(403)
    expect((err as Error).message).toContain('Scope mancante')
  })
})
