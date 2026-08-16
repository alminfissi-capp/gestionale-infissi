import { describe, it, expect } from 'vitest'
import {
  clienteCorrisponde,
  filtraClienti,
  normalizzaTesto,
  soloCifre,
  type ClienteRicercabile,
} from '@/lib/ricerca-clienti'

const zamueli: ClienteRicercabile = {
  tipo: 'privato',
  nome: 'Marcello',
  cognome: 'Zamueli',
  telefono: '+39 3487320995',
  email: 'm.zamueli@example.com',
  cf_piva: 'ZMLMCL80A01G273K',
}

const liCandri: ClienteRicercabile = {
  tipo: 'privato',
  nome: 'Emanuele',
  cognome: 'Li Candri',
  telefono: '+39 320 873 2247',
}

const vecchioSenzaPrefisso: ClienteRicercabile = {
  tipo: 'privato',
  nome: 'Diana',
  cognome: 'Russo',
  telefono: '3477717399',
}

const azienda: ClienteRicercabile = {
  tipo: 'azienda',
  ragione_sociale: 'ALBERICO COSTRUZIONI SRL',
  telefono: '3274459506',
  cf_piva: '06123450827',
}

const accentato: ClienteRicercabile = { tipo: 'privato', nome: 'Nicolò', cognome: "D'Angelò" }

describe('normalizzaTesto', () => {
  it('minuscola, toglie gli accenti e compatta gli spazi', () => {
    expect(normalizzaTesto('  Nicolò   D’Angelò ')).toBe("nicolo d'angelo")
    expect(normalizzaTesto('Li  Candri')).toBe('li candri')
  })
})

describe('soloCifre', () => {
  it('tiene solo le cifre', () => {
    expect(soloCifre('+39 320 873 2247')).toBe('393208732247')
    expect(soloCifre('347-771.7399')).toBe('3477717399')
  })
})

describe('clienteCorrisponde — nome completo', () => {
  // Il bug segnalato: cercando "marcello zamueli" non usciva nulla, perché
  // nessun singolo campo contiene la stringa intera.
  it('trova il cliente cercando "nome cognome"', () => {
    expect(clienteCorrisponde(zamueli, 'marcello zamueli')).toBe(true)
  })

  it('trova il cliente anche a parole invertite', () => {
    expect(clienteCorrisponde(zamueli, 'zamueli marcello')).toBe(true)
  })

  it('accetta le iniziali parziali di ogni parola', () => {
    expect(clienteCorrisponde(zamueli, 'marc zam')).toBe(true)
  })

  it('funziona con i cognomi composti', () => {
    expect(clienteCorrisponde(liCandri, 'emanuele li candri')).toBe(true)
    expect(clienteCorrisponde(liCandri, 'li candri')).toBe(true)
  })

  it('continua a funzionare con una sola parola (comportamento precedente)', () => {
    expect(clienteCorrisponde(zamueli, 'zamueli')).toBe(true)
    expect(clienteCorrisponde(zamueli, 'marcello')).toBe(true)
  })

  it('non restituisce clienti che non c entrano', () => {
    expect(clienteCorrisponde(zamueli, 'marcello labarbera')).toBe(false)
    expect(clienteCorrisponde(vecchioSenzaPrefisso, 'marcello')).toBe(false)
  })

  it('ignora accenti e apostrofi tipografici', () => {
    expect(clienteCorrisponde(accentato, 'nicolo dangelo')).toBe(false) // apostrofo mancante: parola diversa
    expect(clienteCorrisponde(accentato, 'nicolo')).toBe(true)
    expect(clienteCorrisponde(accentato, "d'angelo")).toBe(true)
  })
})

describe('clienteCorrisponde — telefono', () => {
  it('trova il numero indipendentemente da prefisso e spaziatura', () => {
    expect(clienteCorrisponde(liCandri, '3208732247')).toBe(true)
    expect(clienteCorrisponde(liCandri, '320 873 2247')).toBe(true)
    expect(clienteCorrisponde(liCandri, '+39 3208732247')).toBe(true)
    expect(clienteCorrisponde(liCandri, '+393208732247')).toBe(true)
  })

  it('trova i numeri vecchi salvati senza prefisso anche digitando il prefisso', () => {
    expect(clienteCorrisponde(vecchioSenzaPrefisso, '3477717399')).toBe(true)
    expect(clienteCorrisponde(vecchioSenzaPrefisso, '+39 3477717399')).toBe(true)
  })

  it('cerca anche per frammento di numero', () => {
    expect(clienteCorrisponde(zamueli, '7320995')).toBe(true)
  })

  it('non confonde numeri diversi', () => {
    expect(clienteCorrisponde(zamueli, '3477717399')).toBe(false)
  })
})

describe('clienteCorrisponde — aziende e altri campi', () => {
  it('trova per ragione sociale a più parole', () => {
    expect(clienteCorrisponde(azienda, 'alberico costruzioni')).toBe(true)
    expect(clienteCorrisponde(azienda, 'costruzioni srl')).toBe(true)
  })

  it('trova per email e per codice fiscale', () => {
    expect(clienteCorrisponde(zamueli, 'm.zamueli@example.com')).toBe(true)
    expect(clienteCorrisponde(zamueli, 'zmlmcl')).toBe(true)
  })

  it('combina campi diversi nella stessa ricerca', () => {
    expect(clienteCorrisponde(zamueli, 'marcello 3487320995')).toBe(true)
  })
})

describe('filtraClienti', () => {
  const tutti = [zamueli, liCandri, vecchioSenzaPrefisso, azienda, accentato]

  it('restituisce tutti i clienti se la query è vuota', () => {
    expect(filtraClienti(tutti, '')).toHaveLength(5)
    expect(filtraClienti(tutti, '   ')).toHaveLength(5)
  })

  it('filtra per nome completo', () => {
    expect(filtraClienti(tutti, 'marcello zamueli')).toEqual([zamueli])
  })

  it('restituisce lista vuota se nessuno corrisponde', () => {
    expect(filtraClienti(tutti, 'marcello labarbera')).toEqual([])
  })
})
