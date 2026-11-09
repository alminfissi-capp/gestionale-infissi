import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// In stampa globals.css mette `overflow: visible !important` su tutto: senza una regola
// propria le note lunghe e le righe lunghe dei Dettagli costruttivi uscirebbero dalla scheda.
describe('Dettagli costruttivi in stampa: niente esce dalla scheda', () => {
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
  const stampa = css.slice(css.indexOf('@media print'))
  it('regola di stampa che taglia dentro la scheda', () =>
    expect(stampa).toMatch(/\.scheda-dettagli,\s*\.scheda-dettagli \*\s*\{[^}]*overflow:\s*hidden !important/))
  it('la scheda usa quella classe', () =>
    expect(readFileSync(join(process.cwd(), 'components/rilievo-fp/SchedaDettagli.tsx'), 'utf8')).toContain('scheda-dettagli'))
})
