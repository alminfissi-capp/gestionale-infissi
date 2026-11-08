import type { ClienteSnapshot } from '@/types/preventivo'
import type { ClienteSnapshotRilievo } from '@/types/rilievo-veloce'

// Cliente nuovo scritto in cantiere: dal testo cercato si propongono nome e cognome
// (prima parola nome, il resto cognome: "Anna De Luca"), poi si correggono nel modulo.
export function separaNome(testo: string): { nome: string; cognome: string } {
  const parole = testo.trim().split(/\s+/).filter(Boolean)
  if (parole.length < 2) return { nome: '', cognome: parole[0] ?? '' }
  return { nome: parole[0], cognome: parole.slice(1).join(' ') }
}

const n = (x: string | null | undefined) => (x && x.trim() ? x : null)

/** Cliente del rilievo -> modulo cliente dei preventivi (StepCliente) */
export function snapshotPerModulo(c: ClienteSnapshotRilievo): ClienteSnapshot {
  return {
    tipo: c.tipo, ragione_sociale: c.ragione_sociale, nome: c.nome, cognome: c.cognome, telefono: c.telefono, email: c.email,
    indirizzo: c.indirizzo, via: c.via ?? null, civico: c.civico ?? null, cap: c.cap ?? null, citta: c.citta ?? null,
    provincia: c.provincia ?? null, nazione: c.nazione ?? null, codice_sdi: c.codice_sdi ?? null, cantiere: c.cantiere, cf_piva: c.cf_piva ?? null,
  }
}

/** Modulo cliente -> cliente del rilievo; l'indirizzo in una riga si ricompone dai campi se manca */
export function snapshotDalModulo(s: ClienteSnapshot, clienteId: string | null): ClienteSnapshotRilievo {
  const strada = [n(s.via), n(s.civico)].filter(Boolean).join(' ')
  const citta = [n(s.cap), n(s.citta)].filter(Boolean).join(' ')
  const composto = [strada, citta].filter(Boolean).join(', ')
  return {
    tipo: s.tipo ?? 'privato', ragione_sociale: n(s.ragione_sociale), nome: n(s.nome), cognome: n(s.cognome),
    telefono: n(s.telefono), email: n(s.email), indirizzo: n(s.indirizzo) ?? (composto || null), cantiere: n(s.cantiere), clienteId,
    via: n(s.via), civico: n(s.civico), cap: n(s.cap), citta: n(s.citta), provincia: n(s.provincia), nazione: n(s.nazione),
    codice_sdi: n(s.codice_sdi), cf_piva: n(s.cf_piva),
  }
}

/**
 * Cliente scritto a mano da registrare subito in anagrafica (con la rete): cosi' due schede
 * omonime non fanno nascere un terzo cliente al trasferimento. Senza rete lo fa il trasferimento.
 */
export function clienteDaRegistrare(s: ClienteSnapshotRilievo, online: boolean): boolean {
  if (!online || s.clienteId) return false
  return s.tipo === 'azienda' ? !!n(s.ragione_sociale) : !!(n(s.nome) || n(s.cognome))
}
