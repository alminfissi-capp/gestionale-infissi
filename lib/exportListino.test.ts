import { describe, it, expect } from 'vitest'
import { grigliaToCsv, nomeFileSicuro } from '@/lib/exportListino'

describe('nomeFileSicuro', () => {
  it('sostituisce la barra, che il browser leggerebbe come percorso', () => {
    // Nomi veri in archivio: senza questa pulizia il download resta muto.
    expect(nomeFileSicuro('Cambio Telo/Rete Porta', '.csv')).toBe('Cambio Telo-Rete Porta.csv')
    expect(nomeFileSicuro('Box Parete Fissa/Laterale', '.csv')).toBe('Box Parete Fissa-Laterale.csv')
    expect(nomeFileSicuro('Falso Telaio Termico 50/70 + Retine porta intonaco', '.csv'))
      .toBe('Falso Telaio Termico 50-70 + Retine porta intonaco.csv')
  })

  it('ripulisce gli altri caratteri vietati', () => {
    expect(nomeFileSicuro('A:B*C?D"E<F>G|H\\I', '.csv')).toBe('A-B-C-D-E-F-G-H-I.csv')
  })

  it('non raddoppia l estensione', () => {
    expect(nomeFileSicuro('listino.csv', '.csv')).toBe('listino.csv')
    expect(nomeFileSicuro('archivio.zip', '.zip')).toBe('archivio.zip')
  })

  it('ripiega su un nome valido se resta vuoto', () => {
    expect(nomeFileSicuro('   ', '.csv')).toBe('listino.csv')
    expect(nomeFileSicuro('', '.zip')).toBe('listino.zip')
  })

  it('normalizza gli spazi', () => {
    expect(nomeFileSicuro('  REHAU   Sistema  70  ', '.csv')).toBe('REHAU Sistema 70.csv')
  })
})

describe('grigliaToCsv', () => {
  it('scrive intestazione e righe con separatore ;', () => {
    const csv = grigliaToCsv({
      larghezze: [600, 900],
      altezze: [1000, 1200],
      griglia: { '1000': { '600': 100, '900': 150 }, '1200': { '600': 120, '900': 180 } },
    })
    expect(csv.split('\r\n')).toEqual([
      'ALT\\LAR;600;900',
      '1000;100;150',
      '1200;120;180',
    ])
  })

  it('lascia vuote le celle senza prezzo', () => {
    const csv = grigliaToCsv({
      larghezze: [600, 900],
      altezze: [1000],
      griglia: { '1000': { '600': 100 } },
    })
    expect(csv).toBe('ALT\\LAR;600;900\r\n1000;100;')
  })

  it('regge una riga di altezza del tutto assente', () => {
    const csv = grigliaToCsv({ larghezze: [600], altezze: [1000, 1200], griglia: { '1000': { '600': 50 } } })
    expect(csv).toBe('ALT\\LAR;600\r\n1000;50\r\n1200;')
  })
})
