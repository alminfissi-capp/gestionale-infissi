import { describe, it, expect } from 'vitest'
import { leggiBonifico } from '@/lib/parseBonificoScadenza'

// Il testo arriva da estraiItemsPagine, che unisce gli item con '\n':
// gli esempi qui sotto riproducono quella forma, etichetta e valore su righe separate.

const SICILBANCA = `
Contabile bonifico
Data esecuzione
14.03.2026
Beneficiario
ALFA SERRAMENTI SRL
IBAN beneficiario
IT60X0542811101000000123456
Causale
Saldo fattura 118/2026
Importo
1.250,40
Commissioni
2,50
Totale operazione
1.252,90
`

const INTESA = `
Bonifico eseguito
Data addebito ordinante
02/07/2026
Beneficiario
ENEL ENERGIA SPA
Causale del bonifico: Bolletta luce capannone giugno
Importo 340,00 Euro
`

describe('leggiBonifico', () => {
  it('legge il formato SICILBANCA', () => {
    const r = leggiBonifico(SICILBANCA)
    expect(r.importo).toBe(1250.4)
    expect(r.data).toBe('2026-03-14')
    expect(r.causale).toBe('Saldo fattura 118/2026')
  })

  it('legge il formato Intesa', () => {
    const r = leggiBonifico(INTESA)
    expect(r.importo).toBe(340)
    expect(r.data).toBe('2026-07-02')
    expect(r.causale).toBe('Bolletta luce capannone giugno')
  })

  it("prende l'importo del bonifico, non il totale con le commissioni", () => {
    // 1.252,90 e' la cifra piu' alta del documento: non deve vincere
    expect(leggiBonifico(SICILBANCA).importo).toBe(1250.4)
  })

  it('ripiega sulla cifra piu alta quando manca l etichetta Importo', () => {
    expect(leggiBonifico('Pagamento\n980,00\n1.500,00').importo).toBe(1500)
  })

  it('non restituisce nulla su un PDF senza testo utile', () => {
    const r = leggiBonifico('')
    expect(r).toEqual({ importo: null, data: null, causale: null })
  })

  it('scarta le date impossibili', () => {
    expect(leggiBonifico('Data esecuzione\n45.13.2026').data).toBeNull()
  })

  it('scarta gli anni fuori intervallo', () => {
    expect(leggiBonifico('Data esecuzione\n14.03.1987').data).toBeNull()
  })

  it('non trascina le etichette successive dentro la causale', () => {
    const r = leggiBonifico('Causale: Rata mutuo marzo IBAN IT60X05428111010000001234')
    expect(r.causale).toBe('Rata mutuo marzo')
  })

  it('ignora una causale troppo corta per significare qualcosa', () => {
    expect(leggiBonifico('Causale:\n-').causale).toBeNull()
  })
})
