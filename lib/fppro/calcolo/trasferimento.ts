// Regole del trasferimento di un rilievo calcolato in Preventivi.
import { normalizzaTesto, soloCifre, type ClienteRicercabile } from '@/lib/ricerca-clienti'

type Snapshot = Pick<ClienteRicercabile, 'tipo' | 'ragione_sociale' | 'nome' | 'cognome' | 'telefono'>

const nomeCompleto = (c: Snapshot) =>
  c.tipo === 'azienda'
    ? normalizzaTesto(c.ragione_sociale)
    : normalizzaTesto([c.nome, c.cognome].filter(Boolean).join(' '))

const telefono = (s: string | null | undefined) => {
  const d = soloCifre(s ?? '')
  return d.length > 10 && d.startsWith('39') ? d.slice(2) : d
}

/**
 * Cliente gia' in anagrafica con lo stesso nome (nome e cognome in qualunque ordine,
 * oppure ragione sociale), cosi' il trasferimento non crea doppioni. Con piu' omonimi
 * decide il telefono; se resta il dubbio, null: meglio un cliente nuovo che quello sbagliato.
 */
export function clienteEsistente<T extends Snapshot & { id: string }>(snap: Snapshot, clienti: T[]): string | null {
  const nome = nomeCompleto(snap)
  if (!nome) return null
  const rovescio = snap.tipo === 'azienda' ? nome : normalizzaTesto([snap.cognome, snap.nome].filter(Boolean).join(' '))
  const stessi = clienti.filter(c => {
    const n = nomeCompleto({ ...c, tipo: c.tipo ?? 'privato' })
    return n === nome || n === rovescio
  })
  if (stessi.length === 1) return stessi[0].id
  const tel = telefono(snap.telefono)
  if (stessi.length > 1 && tel.length >= 6) {
    const conTel = stessi.filter(c => telefono(c.telefono) === tel)
    if (conTel.length === 1) return conTel[0].id
  }
  return null
}

/**
 * Cliente del preventivo nato da un rilievo: quello scelto dall'anagrafica in cantiere
 * (clienteId), se esiste ancora; altrimenti la ricerca per nome di clienteEsistente.
 */
export function clienteDelRilievo<T extends Snapshot & { id: string }>(
  snap: Snapshot & { clienteId?: string | null },
  clienti: T[],
): string | null {
  if (snap.clienteId && clienti.some(c => c.id === snap.clienteId)) return snap.clienteId
  return clienteEsistente(snap, clienti)
}

/**
 * Perche' il calcolo salvato non va piu' bene per il preventivo (null = va bene):
 * voci cambiate dal telefono o corrette in ufficio dopo il calcolo, voci aggiunte o eliminate.
 */
export function motivoCalcoloSuperato(
  calcolo: { calcolatoAt: string; voci: { voceId: string }[]; saltate: { voceId: string }[] },
  voci: { id: string; updated_at: string; correzioni_fp_at: string | null }[],
): string | null {
  const calcolate = new Set([...calcolo.voci, ...calcolo.saltate].map(v => v.voceId))
  const attuali = new Set(voci.map(v => v.id))
  if ([...calcolate].some(id => !attuali.has(id))) return 'Ricalcola: dopo il calcolo sono state eliminate delle voci'
  if ([...attuali].some(id => !calcolate.has(id))) return 'Ricalcola: dopo il calcolo sono state aggiunte delle voci'
  const quando = Date.parse(calcolo.calcolatoAt)
  const dopo = (s: string | null) => s !== null && Date.parse(s) > quando
  if (voci.some(v => dopo(v.updated_at) || dopo(v.correzioni_fp_at))) return 'Ricalcola: dopo il calcolo sono state modificate delle voci'
  return null
}

/** Perche' una voce non si puo' calcolare (null = si calcola). */
export function motivoVoceNonCalcolabile(
  struttura: { errore: string | null; albero: unknown[] } | undefined,
  voce: { larghezza: number | null; altezza: number | null },
): string | null {
  if (!struttura) return 'Struttura non trovata in FP PRO'
  if (struttura.errore || struttura.albero.length === 0) return 'Struttura non leggibile: aprirla e risalvarla in FP PRO'
  if (!voce.larghezza || !voce.altezza) return 'Mancano le misure'
  return null
}

/** Riga "Note telaio" della riga di preventivo: i lati scritti, nell'ordine del disegno. */
export function noteTelaioTesto(note: Partial<Record<'sinistra' | 'alto' | 'destra' | 'basso', string>> | undefined): string | null {
  const lati = (['sinistra', 'alto', 'destra', 'basso'] as const)
    .map(l => [l, note?.[l]?.trim() ?? ''] as const)
    .filter(([, t]) => t)
  return lati.length ? `Note telaio: ${lati.map(([l, t]) => `${l} ${t}`).join('; ')}` : null
}
