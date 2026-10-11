// Regole di unione tra rilievi del telefono e del server: vince il piu' recente.
import type { PosizioneFp } from '@/types/rilievo-fp'

export interface ConData {
  id: string
  aggiornatoAt: string
  daInviare?: number
}

/** Istante in millisecondi: il server scrive "+00:00", il telefono "Z", con o senza millisecondi. */
const istante = (s: string) => Date.parse(s)

/**
 * Righe arrivate dal server da salvare nel telefono: nuove o piu' recenti; mai sopra una
 * modifica locale non inviata piu' recente, mai una riga eliminata nel telefono e non
 * ancora comunicata al server (`esclusi`).
 */
export function remotiDaApplicare<T extends ConData>(
  locali: Map<string, ConData>,
  remoti: T[],
  esclusi: Set<string> = new Set(),
): T[] {
  return remoti.filter(r => {
    if (esclusi.has(r.id)) return false
    const l = locali.get(r.id)
    if (!l) return true
    if (l.daInviare && istante(l.aggiornatoAt) >= istante(r.aggiornatoAt)) return false
    return istante(r.aggiornatoAt) > istante(l.aggiornatoAt)
  })
}

/** Tra le righe inviate, quelle da segnare "inviate": solo se nel frattempo non sono cambiate. */
export function inviateConfermate(inviate: ConData[], attuali: Map<string, ConData>): string[] {
  return inviate.filter(i => attuali.get(i.id)?.aggiornatoAt === i.aggiornatoAt).map(i => i.id)
}

/** Scritture degli ultimi 30 secondi: potrebbero non essere ancora confermate quando si legge. */
export const MARGINE_SCRITTURE_MS = 30_000

/**
 * Dove ripartire la prossima volta: subito dopo l'ultima riga letta (segno, chiave). Se
 * quella riga e' degli ultimi 30 secondi, da 30 secondi fa (chiave null = "da quel segno
 * in poi"): una scrittura nata prima ma confermata dopo la lettura non va persa. Rilegge
 * poche righe, non tutto il catalogo (che ha segni vicini tra loro).
 */
export function posizioneSicura(ultima: PosizioneFp | null, adesso: string): PosizioneFp | null {
  if (!ultima) return null
  const soglia = istante(adesso) - MARGINE_SCRITTURE_MS
  return istante(ultima.segno) <= soglia ? ultima : { segno: new Date(soglia).toISOString(), chiave: null }
}
