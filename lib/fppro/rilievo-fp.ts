// Analisi di una struttura di FP PRO per il rilievo in cantiere (solo app).
import type { Lato, RifFp, VoceFpDati } from '@/types/rilievo-fp'
import { aperturaAnta, type AccessorioStruttura, type NodoStruttura } from './strutture-xml'
import { chiaveAccessorio } from './calcolo/accessori'

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
  /**
   * Chiave delle alternative (nodo + gruppo di FP PRO) se nello stesso nodo ci sono altri kit
   * dello stesso gruppo: se ne sceglie uno solo. null = kit indipendente (casella).
   */
  alternative: string | null
}

export function kitOpzionali(albero: NodoStruttura[]): KitOpzionale[] {
  const out: KitOpzionale[] = []
  for (const n of tutti(albero)) {
    const perGruppo = new Map<number, number>()
    n.kit.forEach(k => { if (k.opzionale && k.gruppo) perGruppo.set(k.gruppo, (perGruppo.get(k.gruppo) ?? 0) + 1) })
    n.kit.forEach((k, i) => {
      if (!k.opzionale) return
      const alternative = k.gruppo && (perGruppo.get(k.gruppo) ?? 0) > 1 ? `${n.codice}:g${k.gruppo}` : null
      out.push({ chiave: `${n.codice}:${i}`, codice: k.codice, descrizione: k.descrizione, predefinito: k.confermato, alternative })
    })
  }
  return out
}

/** Scelta di un kit: se ha alternative, quelle dello stesso gruppo si tolgono (come in FP PRO). */
export function sceltaKit(kit: KitOpzionale[], scelte: Record<string, boolean>, chiave: string, scelto: boolean): Record<string, boolean> {
  const k = kit.find(x => x.chiave === chiave)
  const out = { ...scelte, [chiave]: scelto }
  if (k?.alternative && scelto) {
    for (const altro of kit) if (altro.alternative === k.alternative && altro.chiave !== chiave) out[altro.chiave] = false
  }
  return out
}

/**
 * Kit alternativi scelti insieme nella stessa voce (es. "2AR-SORMONTO" e "2AR-SCOMPARSA"):
 * FP PRO ne accetta uno, il calcolo li conterebbe tutti. `gruppoDi` = gruppo di FP PRO del kit.
 */
export function kitAlternativiDoppi(
  albero: NodoStruttura[],
  scelte: Record<string, boolean>,
  gruppoDi: (kit: string) => number | null | undefined,
): string[][] {
  const out: string[][] = []
  for (const n of tutti(albero)) {
    const perGruppo = new Map<number, string[]>()
    n.kit.forEach((k, i) => {
      const scelto = !k.opzionale || (scelte[`${n.codice}:${i}`] ?? k.confermato)
      const g = k.gruppo ?? gruppoDi(k.codice)
      if (k.opzionale && scelto && g) perGruppo.set(g, [...(perGruppo.get(g) ?? []), k.codice])
    })
    for (const nomi of perGruppo.values()) if (nomi.length > 1) out.push(nomi)
  }
  return out
}

export function haAnteBattenti(albero: NodoStruttura[]): boolean {
  // Vasistas e a sporgere non hanno mano: le cerniere sono orizzontali.
  return tutti(albero).some(n => n.tipo === 8610 && aperturaAnta(n) === 'battente')
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
 * Albero per il telefono: solo gli accessori OPZIONALI (sciolti e dentro i kit), che in
 * cantiere si scelgono; gli altri sono quasi tutto il peso delle strutture e al rilievo non
 * servono. I costi (fase 4) leggono l'albero completo dal database. Un kit senza righe nello
 * STR (FP PRO scrive solo quelle del kit confermato) prende le sue dal catalogo dei kit.
 */
export interface GruppoFp { id: number; tipo: number | null; nome: string | null }

/** Dati del catalogo che il server aggiunge all'albero per il telefono (tutti facoltativi). */
export interface ArricchimentoAlbero {
  /** Righe del kit dal catalogo (per i kit senza righe nello STR) */
  righeCatalogo?: (kit: string) => AccessorioStruttura[]
  /** Gruppo di alternative del kit */
  gruppoKit?: (kit: string) => GruppoFp | null
  /** Gruppo di un accessorio facoltativo dentro un kit */
  gruppoAccessorio?: (kit: string, codice: string) => GruppoFp | null
  /** L'accessorio ha un prezzo per colore accessori */
  aColore?: (codice: string) => boolean
}

/**
 * Albero per il telefono: solo gli accessori OPZIONALI (sciolti e dentro i kit), che in
 * cantiere si scelgono; gli altri sono quasi tutto il peso delle strutture e al rilievo non
 * servono. I costi (fase 4) leggono l'albero completo dal database. Un kit senza righe nello
 * STR (FP PRO scrive solo quelle del kit confermato) prende le sue dal catalogo dei kit.
 * Il server aggiunge gruppi di alternative e codici degli accessori a colore (opzioni semplici).
 */
export function alberoLeggero(albero: NodoStruttura[], a: ArricchimentoAlbero = {}): NodoStruttura[] {
  const aColore = (righe: AccessorioStruttura[]) => [...new Set(righe.filter(r => a.aColore?.(r.codice)).map(r => r.codice))]
  return albero.map(n => ({
    ...n,
    accessori: n.accessori.filter(x => x.opzionale),
    codiciColore: aColore(n.accessori),
    kit: n.kit.map(k => {
      const righe = k.accessori.length > 0 ? k.accessori : (a.righeCatalogo?.(k.codice) ?? [])
      const g = a.gruppoKit?.(k.codice) ?? null
      return {
        ...k,
        accessori: righe.filter(x => x.opzionale).map(x => {
          const ga = a.gruppoAccessorio?.(k.codice, x.codice) ?? null
          return ga ? { ...x, gruppo: ga.id, gruppoTipo: ga.tipo, gruppoNome: ga.nome } : x
        }),
        gruppo: g?.id ?? null,
        gruppoTipo: g?.tipo ?? null,
        gruppoNome: g?.nome ?? null,
        codiciColore: aColore(righe),
      }
    }),
    figli: alberoLeggero(n.figli, a),
  }))
}

export interface AccessorioOpzionale {
  /** chiaveAccessorio: dove si salva la scelta in VoceFpDati.accessori */
  chiave: string
  codice: string
  descrizione: string
  /** Scelto se nella voce non si tocca (come lo conta FP PRO) */
  predefinito: boolean
  /** Gruppo di alternative di FP PRO (accessori dello stesso gruppo = una domanda) */
  gruppo?: number | null
  gruppoTipo?: number | null
  gruppoNome?: string | null
}

export interface GruppoAccessoriOpzionali {
  titolo: string
  /** Chiave del kit opzionale da cui dipende (si mostra solo se il kit e' scelto); null = sempre */
  kit: string | null
  accessori: AccessorioOpzionale[]
}

/**
 * Accessori opzionali da scegliere nella voce, per kit (es. serratura e martellina dentro
 * "MARTELLINA + MARTELLINA" dello scorrevole). Stesso codice ripetuto nel kit = una scelta sola.
 */
export function accessoriOpzionali(albero: NodoStruttura[]): GruppoAccessoriOpzionali[] {
  const out: GruppoAccessoriOpzionali[] = []
  const elenco = (righe: AccessorioStruttura[], chiave: (codice: string) => string): AccessorioOpzionale[] => {
    const perCodice = new Map<string, AccessorioOpzionale>()
    for (const a of righe.filter(x => x.opzionale)) {
      const prima = perCodice.get(a.codice)
      if (prima) prima.predefinito ||= a.confermato
      else {
        perCodice.set(a.codice, {
          chiave: chiave(a.codice), codice: a.codice, descrizione: a.descrizione, predefinito: a.confermato,
          gruppo: a.gruppo ?? null, gruppoTipo: a.gruppoTipo ?? null, gruppoNome: a.gruppoNome ?? null,
        })
      }
    }
    return [...perCodice.values()]
  }
  for (const n of tutti(albero)) {
    const sciolti = elenco(n.accessori, c => chiaveAccessorio(n.codice, null, c))
    if (sciolti.length > 0) out.push({ titolo: 'Accessori della struttura', kit: null, accessori: sciolti })
    n.kit.forEach((k, i) => {
      const accessori = elenco(k.accessori, c => chiaveAccessorio(n.codice, i, c))
      if (accessori.length > 0) out.push({ titolo: k.descrizione || k.codice, kit: k.opzionale ? `${n.codice}:${i}` : null, accessori })
    })
  }
  return out
}

/** Accessori opzionali scelti nella voce (solo nei kit attivi), per il riepilogo. */
export function accessoriOpzionaliScelti(albero: NodoStruttura[], v: Pick<VoceFpDati, 'kit' | 'accessori'>): AccessorioOpzionale[] {
  const predefiniti = new Map(kitOpzionali(albero).map(k => [k.chiave, k.predefinito]))
  return accessoriOpzionali(albero)
    .filter(g => g.kit === null || (v.kit?.[g.kit] ?? predefiniti.get(g.kit) ?? false))
    .flatMap(g => g.accessori.filter(a => v.accessori?.[a.chiave] ?? a.predefinito))
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
