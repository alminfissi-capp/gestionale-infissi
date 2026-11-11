import { describe, it, expect } from 'vitest'
import { linkWhatsapp } from '@/lib/whatsapp'

describe('linkWhatsapp', () => {
  it('numero italiano senza prefisso: aggiunge 39', () => {
    expect(linkWhatsapp('327 445 9506', 'ciao')).toBe('https://wa.me/393274459506?text=ciao')
  })
  it('numero con prefisso internazionale: usato com e', () => {
    expect(linkWhatsapp('+39 338 593 6132', 'a b')).toBe('https://wa.me/393385936132?text=a%20b')
  })
  it('senza telefono: WhatsApp col messaggio pronto, il contatto lo sceglie l utente', () => {
    expect(linkWhatsapp(null, 'ciao')).toBe('https://wa.me/?text=ciao')
    expect(linkWhatsapp('', 'ciao')).toBe('https://wa.me/?text=ciao')
    expect(linkWhatsapp('  -  ', 'ciao')).toBe('https://wa.me/?text=ciao')
  })
})
