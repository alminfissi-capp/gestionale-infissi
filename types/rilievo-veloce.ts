// Cliente del rilievo (copia al momento del rilievo). Gli altri tipi del vecchio
// rilievo veloce sono stati tolti con la fase 3: la voce nuova sta in types/rilievo-fp.ts.

export interface ClienteSnapshotRilievo {
  tipo: 'privato' | 'azienda'
  ragione_sociale: string | null
  nome: string | null
  cognome: string | null
  telefono: string | null
  email: string | null
  indirizzo: string | null
  cantiere: string | null
  /** Scheda dell'anagrafica scelta in cantiere: il trasferimento in Preventivi usa questa */
  clienteId?: string | null
}
