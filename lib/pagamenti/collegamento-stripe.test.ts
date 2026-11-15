import { describe, expect, it } from 'vitest'
import { EVENTI_WEBHOOK, modalitaChiave, ricreaWebhook, type StripeLike } from './collegamento-stripe'

function stripeFinto(iniziali: { id: string; url: string; metadata: Record<string, string> }[]) {
  const endpoint = [...iniziali]
  const eliminati: string[] = []
  const s: StripeLike = {
    webhookEndpoints: {
      list: async () => ({ data: [...endpoint] }),
      del: async (id: string) => { eliminati.push(id); endpoint.splice(endpoint.findIndex(e => e.id === id), 1); return {} },
      create: async (p) => {
        const e = { id: `we_${endpoint.length + 10}`, url: p.url, metadata: p.metadata ?? {}, enabled_events: p.enabled_events, secret: 'whsec_nuovo' }
        endpoint.push(e)
        return e
      },
    },
  }
  return { s, endpoint, eliminati }
}

describe('collegamento Stripe', () => {
  it('ricollegando resta un solo webhook di WinStudio, quello delle altre app non si tocca', async () => {
    const { s, endpoint, eliminati } = stripeFinto([
      { id: 'we_1', url: 'https://winstudio/api/stripe/webhook/org1', metadata: { winstudio_org: 'org1' } },
      { id: 'we_2', url: 'https://altra-app/webhook', metadata: {} },
    ])
    const r = await ricreaWebhook(s, 'https://winstudio/api/stripe/webhook/org1', 'org1')
    expect(r).toEqual({ id: 'we_11', segreto: 'whsec_nuovo' })
    expect(eliminati).toEqual(['we_1'])
    expect(endpoint.map(e => e.id)).toEqual(['we_2', 'we_11'])
    expect((endpoint[1] as unknown as { enabled_events: string[] }).enabled_events).toEqual(EVENTI_WEBHOOK)
  })

  it('modalita dalla chiave: solo chiavi segrete', () => {
    expect(modalitaChiave('sk_test_abc')).toBe('prova')
    expect(modalitaChiave('rk_test_abc')).toBe('prova')
    expect(modalitaChiave('sk_live_abc')).toBe('reale')
    expect(modalitaChiave('pk_test_abc')).toBeNull()
    expect(modalitaChiave('qualcosa')).toBeNull()
  })
})
