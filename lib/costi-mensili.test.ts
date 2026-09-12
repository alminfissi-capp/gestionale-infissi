import { describe, it, expect } from 'vitest'
import {
  VOCI, FAMIGLIE, FAMIGLIA_DI, VOCE_LABEL, FAMIGLIA_LABEL, MESI_ESTESI,
  voceDiCategoria,
} from '@/lib/costi-mensili'

describe('mappe delle voci di spesa', () => {
  it('ogni categoria di scadenza finisce nella voce giusta', () => {
    expect(voceDiCategoria('utenza')).toBe('utenze')
    expect(voceDiCategoria('finanziamento')).toBe('finanziamenti')
    expect(voceDiCategoria('assegno')).toBe('materiali')
    expect(voceDiCategoria('tassa')).toBe('tasse')
    expect(voceDiCategoria('altro')).toBe('altro')
  })

  it('una categoria sconosciuta finisce fra le altre spese, non si perde', () => {
    expect(voceDiCategoria('leasing_auto')).toBe('altro')
    expect(voceDiCategoria('')).toBe('altro')
  })

  it('utenze, finanziamenti e stipendi sono costi fissi', () => {
    expect(FAMIGLIA_DI.utenze).toBe('fissi')
    expect(FAMIGLIA_DI.finanziamenti).toBe('fissi')
    expect(FAMIGLIA_DI.stipendi).toBe('fissi')
  })

  it('materiali e altre spese sono costi variabili, le tasse stanno a parte', () => {
    expect(FAMIGLIA_DI.materiali).toBe('variabili')
    expect(FAMIGLIA_DI.altro).toBe('variabili')
    expect(FAMIGLIA_DI.tasse).toBe('tasse')
  })

  it('ogni voce ha un etichetta e appartiene a una famiglia nota', () => {
    expect(VOCI).toHaveLength(6)
    for (const v of VOCI) {
      expect(VOCE_LABEL[v]).toBeTruthy()
      expect(FAMIGLIE).toContain(FAMIGLIA_DI[v])
    }
    expect(FAMIGLIE.map((f) => FAMIGLIA_LABEL[f]))
      .toEqual(['Costi fissi', 'Costi variabili', 'Tasse'])
  })

  it('le voci sono ordinate per famiglia: prima i fissi, poi i variabili, poi le tasse', () => {
    expect(VOCI.map((v) => FAMIGLIA_DI[v]))
      .toEqual(['fissi', 'fissi', 'fissi', 'variabili', 'variabili', 'tasse'])
  })

  it('i nomi estesi dei mesi servono agli avvisi', () => {
    expect(MESI_ESTESI).toHaveLength(12)
    expect(MESI_ESTESI[0]).toBe('gennaio')
    expect(MESI_ESTESI[11]).toBe('dicembre')
  })
})
