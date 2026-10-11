// Regole di unione tra rilievi del telefono e del server: vince il piu' recente.

export interface ConData {
  id: string
  aggiornatoAt: string
  daInviare?: number
}

/** Righe arrivate dal server da salvare nel telefono: nuove o piu' recenti, mai sopra una modifica locale non inviata piu' recente. */
export function remotiDaApplicare<T extends ConData>(locali: Map<string, ConData>, remoti: T[]): T[] {
  return remoti.filter(r => {
    const l = locali.get(r.id)
    if (!l) return true
    if (l.daInviare && l.aggiornatoAt >= r.aggiornatoAt) return false
    return r.aggiornatoAt > l.aggiornatoAt
  })
}

/** Tra le righe inviate, quelle da segnare "inviate": solo se nel frattempo non sono cambiate. */
export function inviateConfermate(inviate: ConData[], attuali: Map<string, ConData>): string[] {
  return inviate.filter(i => attuali.get(i.id)?.aggiornatoAt === i.aggiornatoAt).map(i => i.id)
}
