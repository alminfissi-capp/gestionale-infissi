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
  // Campi del modulo cliente dei preventivi (rilievi dal 2026-11-08; assenti nei vecchi)
  via?: string | null
  civico?: string | null
  cap?: string | null
  citta?: string | null
  provincia?: string | null
  nazione?: string | null
  codice_sdi?: string | null
  cf_piva?: string | null
}
