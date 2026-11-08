import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Le voci disegnate stanno tra le "saltate" del calcolo: chi controlla se il calcolo e'
// superato deve leggerle, altrimenti sembrano eliminate e chiede sempre di ricalcolare.
describe('controllo "calcolo superato": legge anche le voci disegnate', () => {
  const sorgente = readFileSync(join(process.cwd(), 'actions/calcolo-fp.ts'), 'utf8')
  const funzioni = sorgente.split(/\nexport async function /).slice(1)
  const conControllo = funzioni.filter(f => f.includes('motivoCalcoloSuperato('))
  it('ci sono i punti da controllare', () => expect(conControllo.length).toBeGreaterThanOrEqual(2))
  for (const f of conControllo) {
    const nome = f.slice(0, f.indexOf('('))
    it(nome, () => {
      const query = f.slice(0, f.indexOf('motivoCalcoloSuperato(')).split("from('rilievo_veloce_voci')").pop() ?? ''
      expect(query).toContain('grafico.not.is.null')
    })
  }
})
