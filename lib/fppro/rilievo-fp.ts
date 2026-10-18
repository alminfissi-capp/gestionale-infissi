// Analisi di una struttura di FP PRO per il rilievo in cantiere (solo app).
import type { Lato, RifFp, VoceFpDati } from '@/types/rilievo-fp'
import type { NodoStruttura } from './strutture-xml'

const LATI_TELAIO: Lato[] = ['sinistra', 'alto', 'destra', 'basso']

const tutti = (nodi: NodoStruttura[]): NodoStruttura[] => nodi.flatMap(n => [n, ...tutti(n.figli)])
const nomeDxf = (dxf: string) => dxf.slice(dxf.lastIndexOf('\\') + 1).replace(/\.dxf$/i, '')

export interface Divisione {
  codice: string
  tipo: 'traverso' | 'montante'
  /** Posizione dell'asse nella struttura di FP PRO: y dal basso (traverso), x da sinistra (montante) */
  nominale: number
  etichetta: string
}

export function divisioniStruttura(albero: NodoStruttura[]): Divisione[] {
  let traversi = 0
  let montanti = 0
  const out: Divisione[] = []
  for (const n of tutti(albero)) {
    if (n.tipo === 8070 && n.y !== null) {
      out.push({ codice: String(n.codice), tipo: 'traverso', nominale: n.y, etichetta: `Traverso ${++traversi}` })
    } else if (n.tipo === 8060 && n.x !== null) {
      out.push({ codice: String(n.codice), tipo: 'montante', nominale: n.x, etichetta: `Montante ${++montanti}` })
    }
  }
  return out
}

export interface CampoRiempimento {
  codice: string
  tipo: 'vetro' | 'pannello'
  codiceDefault: string
  etichetta: string
}

export function campiRiempimento(albero: NodoStruttura[]): CampoRiempimento[] {
  let vetri = 0
  let pannelli = 0
  const out: CampoRiempimento[] = []
  for (const n of tutti(albero)) {
    const pezzo = n.pezzi.find(p => p.tipo === 8510 || p.tipo === 8500)
    if (!pezzo) continue
    const vetro = pezzo.tipo === 8510
    out.push({
      codice: String(n.codice),
      tipo: vetro ? 'vetro' : 'pannello',
      codiceDefault: nomeDxf(pezzo.dxf),
      etichetta: vetro ? `Vetro ${++vetri}` : `Pannello ${++pannelli}`,
    })
  }
  return out
}

export interface KitOpzionale {
  chiave: string
  codice: string
  descrizione: string
  /** Scelto nella struttura di FP PRO */
  predefinito: boolean
}

export function kitOpzionali(albero: NodoStruttura[]): KitOpzionale[] {
  const out: KitOpzionale[] = []
  for (const n of tutti(albero)) {
    n.kit.forEach((k, i) => {
      if (k.opzionale) out.push({ chiave: `${n.codice}:${i}`, codice: k.codice, descrizione: k.descrizione, predefinito: k.confermato })
    })
  }
  return out
}

export function haAnteBattenti(albero: NodoStruttura[]): boolean {
  return tutti(albero).some(n => n.tipo === 8610)
}

/** Profili del telaio esterno, nell'ordine in cui FP PRO li salva: sinistra, alto, destra, basso. */
export function telaiStruttura(albero: NodoStruttura[]): Partial<Record<Lato, string>> {
  const telaio = tutti(albero).find(n => n.tipo === 8600)
  const pezzi = telaio?.pezzi.filter(p => p.tipo === 8050) ?? []
  const out: Partial<Record<Lato, string>> = {}
  pezzi.slice(0, 4).forEach((p, i) => { out[LATI_TELAIO[i]] = nomeDxf(p.dxf) })
  return out
}

export function nuovaVoceFp(
  s: { id: string; percorso: string; nome: string; albero: NodoStruttura[] },
  serie: string,
): VoceFpDati {
  return {
    strutturaId: s.id,
    percorso: s.percorso,
    nome: s.nome,
    serie,
    larghezza: null,
    altezza: null,
    quote: {},
    coloreInt: null,
    coloreEst: null,
    vetri: {},
    kit: Object.fromEntries(kitOpzionali(s.albero).map(k => [k.chiave, k.predefinito])),
    mano: null,
    telai: {},
  }
}

export function problemiVoce(v: VoceFpDati, divisioni: Divisione[]): string[] {
  const problemi: string[] = []
  if (!v.larghezza || v.larghezza <= 0) problemi.push('Manca la larghezza')
  if (!v.altezza || v.altezza <= 0) problemi.push('Manca l\'altezza')
  for (const d of divisioni) {
    const q = v.quote[d.codice]
    if (q === undefined) continue
    const limite = d.tipo === 'traverso' ? v.altezza : v.larghezza
    if (q <= 0 || (limite !== null && limite > 0 && q >= limite)) problemi.push(`${d.etichetta}: quota fuori dal telaio`)
  }
  return problemi
}

/**
 * Albero senza accessori (ne' sciolti ne' dentro i kit): e' quasi tutto il peso delle
 * strutture e al rilievo non serve. I costi (fase 4) leggono l'albero completo dal database.
 */
export function alberoLeggero(albero: NodoStruttura[]): NodoStruttura[] {
  return albero.map(n => ({
    ...n,
    accessori: [],
    kit: n.kit.map(k => ({ ...k, accessori: [] })),
    figli: alberoLeggero(n.figli),
  }))
}

/** Colori accessori della voce in ordine: l'elenco se c'e', altrimenti il singolo colore delle voci vecchie. */
export function coloriAccessori(v: Pick<VoceFpDati, 'coloreAcc' | 'coloriAcc'>): RifFp[] {
  if (v.coloriAcc && v.coloriAcc.length > 0) return v.coloriAcc
  return v.coloreAcc ? [v.coloreAcc] : []
}

const KIT_RIBALTA = /\dAR\b|A\/R|RIBALTA/i

/** La voce ha un kit anta-ribalta attivo (quelli scelti, e quelli non opzionali della struttura)? */
export function haRibalta(albero: NodoStruttura[], kitScelti: Record<string, boolean>): boolean {
  return tutti(albero).some(n => n.kit.some((k, i) => {
    const attivo = !k.opzionale || (kitScelti[`${n.codice}:${i}`] ?? k.confermato)
    return attivo && KIT_RIBALTA.test(`${k.codice} ${k.descrizione}`)
  }))
}
