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

/** "1B -SCELTA CERNIERA 2 A/R" -> "Cerniera 2 A/R" */
export function titoloGruppo(nome: string | null | undefined): string {
  // Sigla del gruppo all'inizio, con o senza trattino ("1B -SCELTA…", "1B SCELTA…", "- SCELTA…").
  let t = (nome ?? '').trim().replace(/^(\d+[A-Z]\s*-?|\d*[A-Z]?\s*-)\s*/i, '').replace(/^SCELTA\s+/i, '').replace(/^TIPO\s+/i, '').trim()
  if (!t) return 'Scelta'
  t = t.toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Sigla del gruppo di FP PRO per l'ordine delle domande: "1B -SCELTA…" -> "01B"; senza sigla in fondo. */
export const sigla = (nome: string | null | undefined) => {
  const m = /^\s*(\d+)\s*([A-Z]?)/i.exec(nome ?? '')
  return m ? `${m[1].padStart(2, '0')}${m[2].toUpperCase()}` : '99'
}

/** Kit del catalogo per la pagina dei nomi brevi: gruppi di FP PRO in ordine di sigla, nome automatico e corretto. */
export interface GruppoNomiBrevi {
  titolo: string
  ordine: string
  kit: { chiave: string; codice: string; descrizione: string; automatico: string; corretto: string | null }[]
}

export function elencoNomiBrevi(
  kit: { nome: string; descrizione: string | null; gruppo: number | null; gruppoNome: string | null }[],
  corretti: Map<string, string>,
): GruppoNomiBrevi[] {
  // Un gruppo di FP PRO mescola serie diverse (PLANET, CIELO…): nella voce compaiono solo i kit
  // della serie, quindi i nomi automatici si calcolano per famiglia (prima parola del codice).
  const famiglia = (nome: string) => nome.trim().split(/[\s_-]+/)[0].toUpperCase()
  const perGruppo = new Map<string, typeof kit>()
  for (const k of kit) {
    if (!k.gruppo) continue
    const chiave = `${k.gruppo}|${famiglia(k.nome)}`
    perGruppo.set(chiave, [...(perGruppo.get(chiave) ?? []), k])
  }
  const famigliePerGruppo = new Map<number, Set<string>>()
  for (const k of kit) if (k.gruppo) famigliePerGruppo.set(k.gruppo, (famigliePerGruppo.get(k.gruppo) ?? new Set()).add(famiglia(k.nome)))
  const out: GruppoNomiBrevi[] = []
  for (const membri of perGruppo.values()) {
    const auto = nomiBreviGruppo(membri.map(m => ({ codice: m.nome, descrizione: m.descrizione ?? '' })))
    const piuFamiglie = (famigliePerGruppo.get(membri[0].gruppo!)?.size ?? 1) > 1
    out.push({
      titolo: titoloGruppo(membri[0].gruppoNome) + (piuFamiglie ? ` · ${famiglia(membri[0].nome)}` : ''),
      ordine: sigla(membri[0].gruppoNome),
      kit: membri.map((m, i) => ({
        chiave: chiaveNomeKit(m.nome), codice: m.nome, descrizione: m.descrizione ?? '', automatico: auto[i],
        corretto: corretti.get(chiaveNomeKit(m.nome)) ?? null,
      })),
    })
  }
  return out.sort((a, b) => a.ordine.localeCompare(b.ordine) || a.titolo.localeCompare(b.titolo))
}
