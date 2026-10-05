/** Come si mostra l'elenco commesse sul telefono (tablet e PC hanno sempre la tabella). */
export type VistaCommesseMobile = 'schede' | 'righe' | 'espandibili'

export const VISTA_COMMESSE_DEFAULT: VistaCommesseMobile = 'schede'

export const VISTE_COMMESSE_MOBILE: { valore: VistaCommesseMobile; titolo: string; descrizione: string }[] = [
  {
    valore: 'schede',
    titolo: 'Schede',
    descrizione: 'Una scheda per commessa con importi e tasti sempre visibili.',
  },
  {
    valore: 'righe',
    titolo: 'Righe compatte',
    descrizione: 'Due righe per commessa: ne vedi molte di più per schermata. Le azioni sono nel menu ⋮.',
  },
  {
    valore: 'espandibili',
    titolo: 'Righe espandibili',
    descrizione: 'Riga corta con cliente, stato e saldo; la freccia apre importi e tasti.',
  },
]

/** Preferenze dell'interfaccia di un utente (colonna profiles.preferenze_interfaccia). */
export type PreferenzeInterfaccia = {
  vistaCommesseMobile?: VistaCommesseMobile
}
