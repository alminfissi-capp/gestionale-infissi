import { describe, it, expect } from 'vitest'
import { preservaSpazi } from '@/lib/testo-pdf'

describe('preservaSpazi', () => {
  const NBSP = String.fromCharCode(160)
  const TAB = String.fromCharCode(9)

  it('tiene gli spazi ripetuti in mezzo al testo', () => {
    // Il primo resta spazio vero, cosi' la riga puo' ancora andare a capo li'.
    expect(preservaSpazi('SPAZI    IN')).toBe(`SPAZI ${NBSP.repeat(3)}IN`)
  })

  it('tiene gli spazi a inizio riga, che il PDF butterebbe via', () => {
    expect(preservaSpazi('   rientro')).toBe(`${NBSP.repeat(3)}rientro`)
    expect(preservaSpazi(`prima\n   dopo`)).toBe(`prima\n${NBSP.repeat(3)}dopo`)
  })

  it('trasforma la tabulazione in quattro spazi veri', () => {
    expect(preservaSpazi(`TAB${TAB}DOPO`)).toBe(`TAB${NBSP.repeat(4)}DOPO`)
  })

  it('non tocca il testo normale ne gli a capo', () => {
    expect(preservaSpazi('Tubo quadro 100x100x2 Zincato')).toBe('Tubo quadro 100x100x2 Zincato')
    expect(preservaSpazi('riga uno\nriga due')).toBe('riga uno\nriga due')
    expect(preservaSpazi('a\n\n\nb')).toBe('a\n\n\nb')
  })

  it('regge stringa vuota e soli spazi', () => {
    expect(preservaSpazi('')).toBe('')
    expect(preservaSpazi('  ')).toBe(NBSP.repeat(2))
  })
})
