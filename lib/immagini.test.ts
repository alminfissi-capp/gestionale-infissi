import { describe, it, expect } from 'vitest'
import { nomeDaFile } from '@/lib/immagini'

describe('nomeDaFile', () => {
  it('toglie l estensione e usa il resto come nome', () => {
    expect(nomeDaFile('zanzariera.jpg')).toBe('zanzariera')
    expect(nomeDaFile('soglia-ribassata.PNG')).toBe('soglia-ribassata')
  })

  it('tiene i punti interni, toglie solo l ultimo pezzo', () => {
    expect(nomeDaFile('tapparella.v2.webp')).toBe('tapparella.v2')
  })

  it('lascia stare i nomi senza estensione', () => {
    expect(nomeDaFile('maniglia')).toBe('maniglia')
  })

  it('scarta il percorso che certi browser mettono davanti', () => {
    expect(nomeDaFile('C:\\fakepath\\persiana.jpg')).toBe('persiana')
    expect(nomeDaFile('foto/2026/cassonetto.jpg')).toBe('cassonetto')
  })

  it('non torna mai vuoto: senza niente di leggibile ripiega su Icona', () => {
    expect(nomeDaFile('')).toBe('Icona')
    expect(nomeDaFile('   ')).toBe('Icona')
    expect(nomeDaFile('.jpg')).toBe('Icona')
  })

  it('accorcia i nomi lunghissimi, che in griglia non si leggono comunque', () => {
    const lungo = 'a'.repeat(120) + '.jpg'
    expect(nomeDaFile(lungo)).toHaveLength(60)
  })
})
