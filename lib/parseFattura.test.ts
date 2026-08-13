import { describe, it, expect } from 'vitest'
import { parseFattura } from './parseFattura'
import { FATTURA_97, FATTURA_106, FATTURA_12 } from './parseFattura.fixtures'

describe('parseFattura — fattura di acconto', () => {
  it('legge numero, data e importi', () => {
    const f = parseFattura(FATTURA_97)
    expect(f).not.toBeNull()
    expect(f!.tipo).toBe('fattura')
    expect(f!.numero).toBe('97/2025')
    expect(f!.data).toBe('2025-11-24')
    expect(f!.imponibile).toBeCloseTo(15163.94, 2)
    expect(f!.iva).toBeCloseTo(3336.07, 2)
    expect(f!.totale).toBeCloseTo(18500.01, 2)
  })

  it('legge il destinatario e i suoi dati fiscali', () => {
    const f = parseFattura(FATTURA_97)!
    expect(f.destinatario).toBe('AZIENDA AGRICOLA DI TRANCHIDA GIANLUCA')
    expect(f.destinatarioIndirizzo).toBe('VIA G. ALESSI 8 - 90143 PALERMO (PA)')
    expect(f.destinatarioPiva).toBe('02562640819')
    expect(f.destinatarioCf).toBe('TRNGLC92D19G273K')
  })

  it('non confonde i dati fiscali dell’emittente con quelli del cliente', () => {
    const f = parseFattura(FATTURA_97)!
    expect(f.destinatarioPiva).not.toBe('06365120820')
    expect(f.destinatarioCf).not.toBe('CPPLSN88M12G273F')
  })

  it('prende la descrizione dalla prima riga del blocco', () => {
    const f = parseFattura(FATTURA_97)!
    expect(f.descrizione).toBe('Acconto su preventivo n. 10040/2025 G del 22/11/2025')
  })

  it('riconosce il preventivo citato', () => {
    const f = parseFattura(FATTURA_97)!
    expect(f.preventivoCitato).toEqual({ numero: '10040/2025 G', data: '2025-11-22' })
  })
})

describe('parseFattura — secondo acconto', () => {
  it('legge numero, data e importi', () => {
    const f = parseFattura(FATTURA_106)!
    expect(f.numero).toBe('106/2025')
    expect(f.data).toBe('2025-12-19')
    expect(f.imponibile).toBeCloseTo(5054.05, 2)
    expect(f.iva).toBeCloseTo(1111.89, 2)
    expect(f.totale).toBeCloseTo(6165.94, 2)
  })

  it('non trova preventivi citati se la descrizione non ne parla', () => {
    expect(parseFattura(FATTURA_106)!.preventivoCitato).toBeNull()
  })
})

describe('parseFattura — fattura a saldo su piu’ pagine', () => {
  it('legge gli importi dal riepilogo finale, non dalle righe', () => {
    const f = parseFattura(FATTURA_12)!
    expect(f.numero).toBe('12/2026')
    expect(f.data).toBe('2026-02-03')
    expect(f.imponibile).toBeCloseTo(22057.97, 2)
    expect(f.iva).toBeCloseTo(4852.75, 2)
    expect(f.totale).toBeCloseTo(26910.72, 2)
  })

  it('non si fa ingannare dalle fatture citate in detrazione', () => {
    const f = parseFattura(FATTURA_12)!
    expect(f.numero).toBe('12/2026')
  })

  it('preferisce il blocco OGGETTO come descrizione', () => {
    const f = parseFattura(FATTURA_12)!
    expect(f.descrizione).toContain('Fattura a saldo')
  })

  it('legge il destinatario anche se il blocco sta solo sulla prima pagina', () => {
    const f = parseFattura(FATTURA_12)!
    expect(f.destinatario).toBe('AZIENDA AGRICOLA DI TRANCHIDA GIANLUCA')
    expect(f.destinatarioPiva).toBe('02562640819')
  })
})

describe('parseFattura — note di credito e casi limite', () => {
  it('rende negativi gli importi di una nota di credito', () => {
    const testo = FATTURA_97.replace('FATTURA nr. 97/2025', 'NOTA DI CREDITO nr. 3/2026')
    const f = parseFattura(testo)!
    expect(f.tipo).toBe('nota_credito')
    expect(f.numero).toBe('3/2026')
    expect(f.imponibile).toBeCloseTo(-15163.94, 2)
    expect(f.iva).toBeCloseTo(-3336.07, 2)
    expect(f.totale).toBeCloseTo(-18500.01, 2)
  })

  it('restituisce null se il documento non e’ una fattura', () => {
    expect(parseFattura('Contabile di bonifico\nImporto 1.000,00\nBeneficiario Mario Rossi')).toBeNull()
  })

  it('restituisce null se manca il riepilogo degli importi', () => {
    expect(parseFattura('FATTURA nr. 5/2026 del 01/03/2026\nDESCRIZIONE\nLavori vari')).toBeNull()
  })

  it('gestisce importi senza separatore delle migliaia', () => {
    const testo = FATTURA_97
      .replaceAll('15.163,94', '900,00')
      .replaceAll('3.336,07', '198,00')
    const f = parseFattura(testo)!
    expect(f.imponibile).toBeCloseTo(900, 2)
    expect(f.iva).toBeCloseTo(198, 2)
    expect(f.totale).toBeCloseTo(1098, 2)
  })
})
