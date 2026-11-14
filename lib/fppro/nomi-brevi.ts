// Nomi brevi da cantiere per le risposte di una domanda (spec 2026-11-14-kit-come-fppro).
// "Kit Cremonese anta ribalta / Kit Exens anta ribalta" -> "Kit Cremonese / Kit Exens":
// si tolgono le parole comuni a tutte le risposte del gruppo. Funzioni pure, anche offline.
// Un nome corretto a mano (pagina Nomi brevi) vince sempre: chiave chiaveNomeKit(codice).

/** Chiave del nome corretto a mano di un kit (tabella fp_nomi_brevi). */
export const chiaveNomeKit = (codice: string) => `kit:${codice.trim().toLowerCase().replace(/\s+/g, ' ')}`

/** Abbreviazioni di FP PRO che in cantiere non dicono niente. */
const ESTESE: Record<string, string> = { RISTRUTT: 'ristrutturazione', RISTUTT: 'ristrutturazione', SCF: 'a scomparsa' }
/** Lato, serie del sistema e simili: mai nel nome breve (il lato lo da' la mano). */
const SCARTA = /^(DX|SX|DS)$/i
/** Codici di profili e misure ("UP61849/UP62849"): non servono al nome. */
const CODICE = /\d{3,}/

const parole = (t: string) => t.split(/[\s\-_]+/).filter(Boolean)
const chiave = (p: string) => p.toLowerCase()
const maiuscola = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t)
/** Parola tutta maiuscola di 4+ lettere (codici di FP PRO) -> minuscolo; sigle corte (L, Z/T, DK) restano. */
const leggibile = (p: string) => (p.length > 3 && p === p.toUpperCase() && /[A-Z]/.test(p) ? p.toLowerCase() : p)

function resto(testi: string[], scartaLato: boolean): { comuni: string[]; resti: string[][] } {
  const liste = testi.map(t => parole(t).filter(p => !(scartaLato && SCARTA.test(p))))
  const comuni = liste.length > 1
    ? liste[0].filter(p => liste.every(l => l.some(x => chiave(x) === chiave(p))))
    : []
  const inComuni = new Set(comuni.map(chiave))
  return { comuni, resti: liste.map(l => l.filter(p => !inComuni.has(chiave(p)) && !CODICE.test(p))) }
}

const componi = (r: string[]) => maiuscola(r.map(p => ESTESE[p.toUpperCase()] ?? leggibile(p)).join(' ').trim())

/**
 * Nomi brevi per le risposte di una domanda (stesso ordine). Prima dalle descrizioni; una
 * risposta che resterebbe vuota prende le parole del codice; se e' ancora vuota: "Standard".
 * Parola comune iniziale "Kit"/"Telaio" e risposte cortissime: la parola comune davanti.
 */
export function nomiBreviGruppo(voci: { codice: string; descrizione: string }[]): string[] {
  const descr = resto(voci.map(v => v.descrizione || v.codice), true)
  const cod = resto(voci.map(v => v.codice), true)
  const primoComune = descr.comuni[0] ?? ''
  const prefisso = /^(kit|telaio)$/i.test(primoComune) ? maiuscola(leggibile(primoComune)) : ''
  const nomi = voci.map((v, i) => {
    let r = descr.resti[i]
    if (r.length === 0 || descr.resti.some((x, j) => j !== i && x.join(' ') === r.join(' '))) r = cod.resti[i]
    const testo = componi(r)
    if (!testo) return voci.length > 1 ? 'Standard' : componi(parole(v.descrizione || v.codice))
    if (prefisso) return `${prefisso} ${r.map(p => ESTESE[p.toUpperCase()] ?? leggibile(p)).join(' ').replace(/^./, c => c.toUpperCase())}`
    return testo
  })
  return nomi
}
