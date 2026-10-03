import { describe, it, expect } from 'vitest'
import {
  parseImporto,
  periodoIniziale,
  residuoDisponibile, ripartisci, controllaRipartizione, normalizzaFornitore, fornitoreCorrisponde,
  type DaRipartire,
} from '@/lib/fic/pagamenti'

const fatt = (fic_id: number, residuo: number, prima_scadenza: string | null, data = '2026-01-01'): DaRipartire =>
  ({ fic_id, tipo: 'fattura', residuo, prima_scadenza, data })
const nc = (fic_id: number, residuo: number): DaRipartire =>
  ({ fic_id, tipo: 'nota_credito', residuo, prima_scadenza: '2026-01-01', data: '2026-01-01' })

describe('residuoDisponibile', () => {
  it('toglie le quote promesse da altre scadenze non ancora scritte', () => {
    const altre = [
      { fic_documento_id: 1, importo: 100, stato_fic: 'non_scritto' as const },
      { fic_documento_id: 1, importo: 50, stato_fic: 'da_allineare' as const },
      { fic_documento_id: 1, importo: 70, stato_fic: 'scritto' as const }, // gia' nelle rate FiC
      { fic_documento_id: 2, importo: 999, stato_fic: 'non_scritto' as const },
    ]
    expect(residuoDisponibile(500, 1, altre, 0)).toBe(350)
  })
  it("restituisce alla scadenza corrente la quota che ha gia' scritto", () => {
    expect(residuoDisponibile(200, 1, [], 300)).toBe(500)
  })
  it('mai negativo', () => {
    expect(residuoDisponibile(100, 1, [{ fic_documento_id: 1, importo: 300, stato_fic: 'non_scritto' }], 0)).toBe(0)
  })
})

describe('ripartisci', () => {
  it("copre le fatture dalla prima scadenza, l'ultima in parte", () => {
    expect(ripartisci(5000, [fatt(3, 1000, '2026-03-01'), fatt(1, 2500, '2026-01-31'), fatt(2, 1700, '2026-02-28')]))
      .toEqual({ 1: 2500, 2: 1700, 3: 800 })
  })
  it('scala prima le note di credito: 4500 + NC 500 coprono 5000 di fatture', () => {
    expect(ripartisci(4500, [fatt(1, 3000, '2026-01-31'), fatt(2, 2000, '2026-02-28'), nc(9, 500)]))
      .toEqual({ 1: 3000, 2: 2000, 9: 500 })
  })
  it('importo oltre le fatture: ogni fattura al suo residuo, il resto avanza', () => {
    expect(ripartisci(5000, [fatt(1, 4700, '2026-01-31')])).toEqual({ 1: 4700 })
  })
  it('senza disponibile le fatture in coda ricevono 0', () => {
    expect(ripartisci(100, [fatt(1, 100, '2026-01-31'), fatt(2, 50, '2026-02-28')])).toEqual({ 1: 100, 2: 0 })
  })
  it('senza scadenza ordina per data fattura, poi per id', () => {
    expect(ripartisci(150, [fatt(2, 100, null, '2026-01-05'), fatt(1, 100, null, '2026-01-05')])).toEqual({ 1: 100, 2: 50 })
  })
  it('la nota di credito si usa solo fino a quanto servono le fatture', () => {
    // scadenza 100, fattura 300, nota 500: della nota servono 300, non 500
    expect(ripartisci(100, [fatt(1, 300, '2026-01-31'), nc(9, 500)])).toEqual({ 1: 300, 9: 300 })
  })
  it('arrotonda al centesimo', () => {
    expect(ripartisci(0.3, [fatt(1, 0.1, '2026-01-01'), fatt(2, 0.2, '2026-01-02')])).toEqual({ 1: 0.1, 2: 0.2 })
  })
})

describe('controllaRipartizione', () => {
  const riga = (fic_id: number, quota: number, residuo: number, tipo: 'fattura' | 'nota_credito' = 'fattura', numero = `FT ${fic_id}`) =>
    ({ fic_id, tipo, numero, residuo, quota })

  it('differenza zero → ok', () => {
    const e = controllaRipartizione(4500, [riga(1, 3000, 3000), riga(2, 2000, 2000), riga(9, 500, 500, 'nota_credito', 'NC 1')])
    expect(e).toMatchObject({ livello: 'ok', totaleFatture: 5000, totaleNote: 500, differenza: 0, messaggi: [] })
  })
  it('fattura coperta in parte → avviso con quanto resta', () => {
    const e = controllaRipartizione(5000, [riga(1, 2500, 2500), riga(2, 2500, 2700, 'fattura', 'FT 12/2026')])
    expect(e.livello).toBe('avviso')
    expect(e.messaggi).toContain('200,00 € resteranno da pagare sulla fattura FT 12/2026')
  })
  it('importo oltre le fatture → avviso', () => {
    const e = controllaRipartizione(5000, [riga(1, 4700, 4700)])
    expect(e.livello).toBe('avviso')
    expect(e.differenza).toBe(300)
    expect(e.messaggi).toContain('300,00 € della scadenza non coprono nessuna fattura')
  })
  it('quote oltre la scadenza → avviso', () => {
    const e = controllaRipartizione(1000, [riga(1, 1200, 1500)])
    expect(e.livello).toBe('avviso')
    expect(e.messaggi).toContain("Le quote superano l'importo della scadenza di 200,00 €")
  })
  it('quota oltre il residuo → blocco', () => {
    const e = controllaRipartizione(1000, [riga(1, 1000, 800)])
    expect(e.livello).toBe('blocco')
    expect(e.messaggi).toContain('FT 1: al massimo 800,00 €')
  })
  it('quota zero su un documento spuntato → blocco', () => {
    const e = controllaRipartizione(100, [riga(1, 100, 100), riga(2, 0, 50)])
    expect(e.livello).toBe('blocco')
    expect(e.messaggi).toContain('FT 2: nessun importo assegnato, toglila o aumenta l\'importo')
  })
  it("nota di credito piu' grande delle fatture → avviso dedicato, niente quote negative", () => {
    const e = controllaRipartizione(100, [riga(1, 300, 300), riga(9, 500, 500, 'nota_credito', 'NC 1')])
    expect(e.livello).toBe('avviso')
    expect(e.messaggi).toContain('Le note di credito superano le fatture di 200,00 €')
  })
})

describe('fornitore', () => {
  it('normalizza forme societarie, punteggiatura e maiuscole', () => {
    expect(normalizzaFornitore('PROFILSIDER S.r.l.')).toBe('profilsider')
    expect(normalizzaFornitore('F.lli LALOMIA SRL')).toBe('f lli lalomia')
    expect(normalizzaFornitore('Agrusa s.p.a.')).toBe('agrusa')
  })
  it('trova lo stesso fornitore scritto in modi diversi', () => {
    expect(fornitoreCorrisponde('F.lli LALOMIA SRL', 'F.LLI LALOMIA S.R.L.')).toBe(true)
    expect(fornitoreCorrisponde('PROFILSIDER SRL', 'Profilsider S.r.l.')).toBe(true)
    expect(fornitoreCorrisponde('EDILSIDER SPA', 'EDIL SIDER S.P.A.')).toBe(true)
    expect(fornitoreCorrisponde('SIRTAL', 'SIRTAL S.R.L.')).toBe(true)
  })
  it('non confonde fornitori diversi', () => {
    expect(fornitoreCorrisponde('SIRTAL', 'Profilsider S.r.l.')).toBe(false)
  })
  it('ricerca vuota trova tutto', () => {
    expect(fornitoreCorrisponde('  ', 'Qualsiasi')).toBe(true)
  })
})

describe('parseImporto', () => {
  it('virgola decimale e punti delle migliaia', () => {
    expect(parseImporto('12,50')).toBe(12.5)
    expect(parseImporto('1.234,56')).toBe(1234.56)
  })
  it('punto decimale da tastiera senza virgola', () => {
    expect(parseImporto('12.50')).toBe(12.5)
    expect(parseImporto('12.5')).toBe(12.5)
  })
  it('punto delle migliaia senza decimali', () => {
    expect(parseImporto('1.234')).toBe(1234)
    expect(parseImporto('1.234.567')).toBe(1234567)
  })
  it('testo non valido → null', () => {
    expect(parseImporto('')).toBeNull()
    expect(parseImporto('abc')).toBeNull()
  })
})

describe('periodoIniziale', () => {
  it('sei mesi di calendario fino alla data della scadenza', () => {
    expect(periodoIniziale('2026-10-31', '2026-10-03')).toEqual({ dal: '2026-05-01', al: '2026-10-31' })
  })
  it('a cavallo d\'anno', () => {
    expect(periodoIniziale('2027-02-15', '2026-10-03')).toEqual({ dal: '2026-09-01', al: '2027-02-15' })
  })
  it('senza data della scadenza parte da oggi', () => {
    expect(periodoIniziale(null, '2026-10-03')).toEqual({ dal: '2026-05-01', al: '2026-10-03' })
  })
})
