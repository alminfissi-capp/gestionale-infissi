import { describe, it, expect } from 'vitest'
import { statoPagamento, oggiRoma } from '@/lib/fic/stato-pagamento'

const OGGI = '2026-09-28'
const r = (stato: 'pagata' | 'da_pagare', scadenza: string | null) => ({ stato, scadenza })

describe('statoPagamento', () => {
  it('tutte pagate → pagata', () => {
    expect(statoPagamento([r('pagata', '2026-01-01'), r('pagata', '2026-02-01')], OGGI)).toBe('pagata')
  })
  it('nessuna pagata, nessuna scaduta → da_pagare', () => {
    expect(statoPagamento([r('da_pagare', '2026-10-31')], OGGI)).toBe('da_pagare')
  })
  it('alcune pagate, le altre non scadute → parziale', () => {
    expect(statoPagamento([r('pagata', '2026-08-31'), r('da_pagare', '2026-10-31')], OGGI)).toBe('parziale')
  })
  it('una non pagata con scadenza passata → scaduta, anche se altre sono pagate', () => {
    expect(statoPagamento([r('pagata', '2026-07-31'), r('da_pagare', '2026-08-31')], OGGI)).toBe('scaduta')
  })
  it('scadenza oggi non è ancora scaduta', () => {
    expect(statoPagamento([r('da_pagare', OGGI)], OGGI)).toBe('da_pagare')
  })
  it('rata non pagata senza scadenza → da_pagare', () => {
    expect(statoPagamento([r('da_pagare', null)], OGGI)).toBe('da_pagare')
  })
  it('nessuna rata → da_pagare', () => {
    expect(statoPagamento([], OGGI)).toBe('da_pagare')
  })
})

describe('oggiRoma', () => {
  it('usa il fuso di Roma: le 23:30 UTC del 28 sono già il 29', () => {
    expect(oggiRoma(new Date('2026-09-28T23:30:00Z'))).toBe('2026-09-29')
  })
})
