// Calcolo completo di una voce come FP PRO: materiali (profili a barre ottimizzate,
// accessori, vetri, pannelli), ore della struttura, formula di prezzo.
// Puro: il listino arriva da fuori (actions/calcolo-fp.ts lo legge dal database).
import type { SezioneProfilo } from '../dxf-sezione'
import type { NodoStruttura } from '../strutture-xml'
import { accessoriVoce, type OpzioniAccessori, type QuantitaAccessorio, type RegoleAccessori } from './accessori'
import { ottimizzaBarre } from './barre'
import { larghezzeDaPoligoni, pezziECampi, type CampoCalcolo, type Larghezze } from './geometria'
import { applicaCorrezioni, prezzoComeFp, type PrezzoVoce } from './prezzo'
import type { CorrezioniVoce, OreVoce, ProfiloCalcolo } from './tipi'

export interface ProfiloListino {
  kgMl: number
  euroKg: number | null
  euroMl: number | null
  /** 1 + tolleranza di peso del colore (es. 1.03 per i verniciati) */
  fattorePeso: number
  barra: number
  testa: number
  coda: number
  componenti: { codice: string; principale: boolean; offset: number }[]
}

export interface ListinoCalcolo {
  profilo(codice: string): ProfiloListino | null
  /** avviso: es. prezzo diverso per colore senza colore accessori scelto */
  accessorio(codice: string, serie: string): { prezzo: number; unitaVendita: number; avviso?: string | null } | null
  vetro(codice: string): { euroMq: number; minFatt: number; kgMq: number } | null
  pannello(codice: string): { euroMq: number; minFatt: number } | null
  /** Misure in vista dal DXF del profilo (fp_profili_sezioni) */
  sezione(codice: string): SezioneProfilo | null
}

export interface RigaMateriale {
  gruppo: 'profili' | 'accessori' | 'vetri' | 'pannelli'
  codice: string
  descrizione: string
  quantita: number
  unita: string
  costo: number
}

/** Pezzi di un profilo in una voce, per ottimizzare le barre su tutta la commessa */
export interface TagliProfilo {
  codice: string
  lunghezze: number[]
  /** Costo al metro nel colore della voce */
  euroM: number
  barra: number
  testa: number
  coda: number
}

export interface CalcoloVoce {
  materiali: number
  righe: RigaMateriale[]
  ore: OreVoce
  prezzo: PrezzoVoce
  peso: number
  avvisi: string[]
  /** Errori bloccanti (es. kit con la stessa funzione scelti insieme): il rilievo non va nel preventivo */
  errori?: string[]
  /** Costi orari e percentuali usati davvero (profilo + correzioni): per il riepilogo costi. Assente nei calcoli vecchi. */
  profilo?: ProfiloCalcolo
  /** Extra fissi della voce (correzioni) */
  extraFissi?: number
  /** Pezzi dei profili: servono a fattoreBarreCommessa, non si salvano */
  tagli?: TagliProfilo[]
  /** Misure e peso di ogni anta (per nodo, la principale per prima): servono alle regole di FP PRO */
  ante?: AntaPesata[]
}

export interface AntaPesata { nodo: number; tipo: number; l: number; h: number; peso: number }

export interface InputVoce {
  albero: NodoStruttura[]
  serie: string[]
  poligoni: number[][]
  L: number
  H: number
  L0: number
  H0: number
  quote: Record<string, number>
  kitScelti: Record<string, boolean>
  /** Accessori opzionali scelti nella voce (chiaveAccessorio -> scelto); assente = come FP PRO */
  accessoriScelti?: Record<string, boolean>
  /** codice del nodo di riempimento -> codice vetro scelto */
  vetriScelti: Record<string, string>
  /** codice del nodo di riempimento -> codice pannello scelto (anche al posto di un vetro); vince sul vetro */
  pannelliScelti?: Record<string, string>
  /** Accessori aggiunti a mano nella voce: pezzi per serramento */
  accessoriAggiunti?: { codice: string; serie: string; descrizione: string; quantita: number }[]
  tempi: OreVoce
  profilo: ProfiloCalcolo
  /** Maggiorazioni del profilo di calcolo di FP PRO (maggrottvetri, maggrottpannelli) */
  maggiorazioni: { vetri: number; pannelli: number }
  correzioni?: CorrezioniVoce
  larghezze?: Larghezze
  /** Profilo di telaio scelto in cantiere per lato (codice); assente = come la struttura */
  telai?: Partial<Record<'sinistra' | 'alto' | 'destra' | 'basso', string>>
  /** Profilo anta scelto nella voce (codice): sostituisce i pezzi 8090/8100 delle ante; assente = come la struttura */
  anta?: string
  /**
   * Costo barre / costo pezzi di tutta la commessa (fattoreBarreCommessa): i profili si pagano
   * come pezzi x fattore. Assente = barre ottimizzate sulla sola voce.
   */
  fattoreBarre?: number
  /** Mano della voce: sceglie le righe destre/sinistre dei kit (FP PRO: Apertura). Assente = destra */
  mano?: 'sx' | 'dx' | null
}

const LATI = ['sinistra', 'alto', 'destra', 'basso'] as const

/** Albero con i pezzi di telaio sostituiti dai profili scelti per lato (stessa cartella del DXF). */
function conTelaiScelti(albero: NodoStruttura[], telai: InputVoce['telai']): NodoStruttura[] {
  if (!telai || Object.keys(telai).length === 0) return albero
  return albero.map(n => {
    if (n.tipo !== 8600) return { ...n, figli: conTelaiScelti(n.figli, telai) }
    let lato = 0
    const pezzi = n.pezzi.map(p => {
      if (p.tipo !== 8050) return p
      const codice = telai[LATI[lato++]]
      if (!codice) return p
      const cartella = p.dxf.slice(0, Math.max(p.dxf.lastIndexOf('\\'), p.dxf.lastIndexOf('/')) + 1)
      return { ...p, dxf: `${cartella}${codice}.DXF` }
    })
    return { ...n, pezzi }
  })
}

/** Albero con i pezzi anta (8090 battente, 8100 scorrevole) sostituiti dal profilo scelto. */
function conAntaScelta(albero: NodoStruttura[], anta: string | undefined): NodoStruttura[] {
  if (!anta) return albero
  return albero.map(n => {
    const figli = conAntaScelta(n.figli, anta)
    if (n.tipo !== 8610 && n.tipo !== 8620) return { ...n, figli }
    const pezzi = n.pezzi.map(p => {
      if (p.tipo !== 8090 && p.tipo !== 8100) return p
      const cartella = p.dxf.slice(0, Math.max(p.dxf.lastIndexOf('\\'), p.dxf.lastIndexOf('/')) + 1)
      return { ...p, dxf: `${cartella}${anta}.DXF` }
    })
    return { ...n, pezzi, figli }
  })
}

export function codiceDaDxf(dxf: string): string {
  return dxf.slice(Math.max(dxf.lastIndexOf('\\'), dxf.lastIndexOf('/')) + 1).replace(/\.dxf$/i, '')
}

const tondo = (v: number) => Math.round(v * 10000) / 10000

export function calcolaVoce(input: InputVoce, listino: ListinoCalcolo, regole: RegoleAccessori): CalcoloVoce {
  const avvisi: string[] = []
  const righe: RigaMateriale[] = []
  // I poligoni dell'anteprima di FP PRO sono schematici: servono solo se mancano le sezioni dei DXF.
  const larghezze = input.larghezze ?? larghezzeDaPoligoni(input.poligoni)
  const albero = conAntaScelta(conTelaiScelti(input.albero, input.telai), input.anta)
  const { pezzi, campi, zone, ante: geoAnte } = pezziECampi(albero, input, larghezze, dxf => listino.sezione(codiceDaDxf(dxf)))

  // Profili: si risale al codice, i composti si dividono nei componenti, poi barre per codice.
  const cercaProfilo = (codice: string): { codice: string; p: ProfiloListino } | null => {
    const p = listino.profilo(codice)
    if (p) return { codice, p }
    const senzaLettere = codice.replace(/[A-Z]+$/i, '')
    const q = senzaLettere !== codice ? listino.profilo(senzaLettere) : null
    return q ? { codice: senzaLettere, p: q } : null
  }
  const perCodice = new Map<string, { p: ProfiloListino; lunghezze: number[] }>()
  const aggiungi = (codice: string, p: ProfiloListino, lunghezza: number) => {
    const g = perCodice.get(codice) ?? { p, lunghezze: [] }
    g.lunghezze.push(lunghezza)
    perCodice.set(codice, g)
  }
  for (const pezzo of pezzi) {
    const codice = codiceDaDxf(pezzo.dxf)
    // Pezzo senza disegno nella struttura (es. 8040 delle doghe): non c'e' niente da prezzare.
    if (!codice.trim()) continue
    const trovato = cercaProfilo(codice)
    if (!trovato) {
      avvisi.push(`Profilo ${codice} non trovato nel listino di FP PRO`)
      continue
    }
    if (trovato.p.componenti.length === 0) {
      aggiungi(trovato.codice, trovato.p, pezzo.lunghezza)
      continue
    }
    for (const c of trovato.p.componenti) {
      const comp = cercaProfilo(c.codice)
      if (!comp) {
        avvisi.push(`Profilo ${c.codice} (parte di ${codice}) non trovato nel listino di FP PRO`)
        continue
      }
      const lunghezza = c.principale || c.offset <= 0 ? pezzo.lunghezza : pezzo.lunghezza - 2 * c.offset
      if (lunghezza > 0) aggiungi(comp.codice, comp.p, lunghezza)
    }
  }
  let peso = 0
  const tagli: TagliProfilo[] = []
  for (const [codice, { p, lunghezze }] of perCodice) {
    const metriPezzi = lunghezze.reduce((s, l) => s + l, 0) / 1000
    peso += metriPezzi * p.kgMl
    let euroM = 0
    if (p.kgMl > 0 && p.euroKg !== null) euroM = p.kgMl * p.fattorePeso * p.euroKg
    else if (p.euroMl !== null) euroM = p.euroMl
    else avvisi.push(`Profilo ${codice} senza prezzo per questo colore`)
    tagli.push({ codice, lunghezze, euroM, barra: p.barra, testa: p.testa, coda: p.coda })
    if (input.fattoreBarre !== undefined) {
      const costo = metriPezzi * euroM * input.fattoreBarre
      righe.push({ gruppo: 'profili', codice, descrizione: `${lunghezze.length} pezzi, barre ottimizzate sulla commessa`, quantita: tondo(metriPezzi), unita: 'm', costo })
      continue
    }
    const { barre } = ottimizzaBarre(lunghezze, p.barra, p.testa, p.coda)
    const metri = barre.reduce((s, b) => s + b, 0) / 1000
    righe.push({ gruppo: 'profili', codice, descrizione: `${barre.length} barre`, quantita: tondo(metri), unita: 'm', costo: metri * euroM })
  }

  // Vetri e pannelli.
  const pesiCampi: { zona: CampoCalcolo['zona']; kg: number }[] = []
  for (const c of campi) {
    // Scelta della voce: pannello (anche al posto del vetro), poi vetro, poi la struttura.
    const pannelloScelto = input.pannelliScelti?.[c.codiceNodo]
    const vetroScelto = input.vetriScelti[c.codiceNodo]
    const tipo = pannelloScelto ? 'pannello' : vetroScelto ? 'vetro' : c.tipo
    const codice = pannelloScelto ?? vetroScelto ?? codiceDaDxf(c.dxf)
    const mq = (c.l * c.h) / 1e6
    if (tipo === 'vetro') {
      const v = listino.vetro(codice)
      if (!v || v.euroMq <= 0) avvisi.push(`Vetro ${codice} senza prezzo`)
      peso += mq * (v?.kgMq ?? 0)
      pesiCampi.push({ zona: c.zona, kg: mq * (v?.kgMq ?? 0) })
      const costo = v ? Math.max(mq, v.minFatt) * v.euroMq * (1 + input.maggiorazioni.vetri) : 0
      righe.push({ gruppo: 'vetri', codice, descrizione: `${Math.round(c.l)} x ${Math.round(c.h)}`, quantita: tondo(mq), unita: 'm²', costo })
    } else {
      const p = listino.pannello(codice)
      if (!p || p.euroMq <= 0) avvisi.push(`Pannello ${codice} senza prezzo`)
      const costo = p ? Math.max(mq, p.minFatt) * p.euroMq * (1 + input.maggiorazioni.pannelli) : 0
      righe.push({ gruppo: 'pannelli', codice, descrizione: `${Math.round(c.l)} x ${Math.round(c.h)}`, quantita: tondo(mq), unita: 'm²', costo })
    }
  }

  // Peso di ogni anta: profili d'anta (perimetro x kg/m) + vetri dentro l'anta. La principale
  // (maniglia) e' l'anta 1 di FP PRO: dalla mano (sx = prima, dx = ultima), altrimenti MainSashIndex.
  const kgMlAnta = (nodo: number, indice: number): number => {
    const n = trovaNodo(albero, nodo)
    const p = n?.pezzi.find(x => (x.tipo === 8090 || x.tipo === 8100) && x.indice === indice)
      ?? n?.pezzi.find(x => x.tipo === 8090 || x.tipo === 8100)
    if (!p) return 0
    const t = cercaProfilo(codiceDaDxf(p.dxf))
    if (!t) return 0
    if (t.p.kgMl > 0 || t.p.componenti.length === 0) return t.p.kgMl
    return t.p.componenti.reduce((s, c) => s + (cercaProfilo(c.codice)?.p.kgMl ?? 0), 0)
  }
  const dentro = (z: CampoCalcolo['zona'], a: CampoCalcolo['zona']) => {
    const cx = (z.x0 + z.x1) / 2
    const cy = (z.y0 + z.y1) / 2
    return cx >= a.x0 && cx <= a.x1 && cy >= a.y0 && cy <= a.y1
  }
  const ante: AntaPesata[] = []
  const anteRegole: NonNullable<OpzioniAccessori['ante']> = {}
  for (const nodo of [...new Set(geoAnte.map(a => a.nodo))]) {
    const gruppo = geoAnte.filter(a => a.nodo === nodo).sort((a, b) => a.indice - b.indice)
    const k = gruppo.length
    const principale = input.mano === 'sx' ? 0 : input.mano === 'dx' ? k - 1 : Math.min(Math.max(gruppo[0].principale, 0), k - 1)
    const ordinate = [gruppo[principale], ...gruppo.filter((_, i) => i !== principale)]
    const pesate = ordinate.map(a => {
      const l = a.zona.x1 - a.zona.x0
      const h = a.zona.y1 - a.zona.y0
      const vetri = pesiCampi.filter(c => dentro(c.zona, a.zona)).reduce((s, c) => s + c.kg, 0)
      return { nodo, tipo: a.tipo, l, h, peso: (2 * (l + h) / 1000) * kgMlAnta(nodo, a.indice) + vetri }
    })
    ante.push(...pesate)
    const misure = pesate.map(({ l, h, peso: p }) => ({ l, h, peso: p }))
    const mobili = pesate.filter((_, i) => !antaFissa(trovaNodo(albero, nodo), ordinate[i].indice)).map(({ l, h, peso: p }) => ({ l, h, peso: p }))
    anteRegole[nodo] = gruppo[0].tipo === 8620 ? { ante: [], scorrevoli: mobili } : { ante: misure, scorrevoli: [] }
  }

  // Accessori (le formule dei kit usano il peso del serramento) + quelli aggiunti a mano nella voce.
  // Fissaggi dei profili: squadrette e cavallotti per ogni pezzo, dal sistema di giunzione della serie.
  const fissaggi: QuantitaAccessorio[] = []
  if (regole.fissaggi) {
    for (const pezzo of pezzi) {
      const codice = codiceDaDxf(pezzo.dxf)
      if (!codice.trim()) continue
      for (const f of regole.fissaggi(codice, pezzo.tipo)) {
        if (f.dimRif !== 1 || f.quantita <= 0) continue
        fissaggi.push({ codice: f.codice, serie: f.serie ?? '', descrizione: f.descrizione ?? '', quantita: f.quantita, metri: false, regolaIgnota: false })
      }
    }
  }
  const accessori: QuantitaAccessorio[] = [
    ...fissaggi,
    ...accessoriVoce(albero, input.kitScelti, zone, peso, regole, input.accessoriScelti, { mano: input.mano ?? null, ante: anteRegole }),
    ...(input.accessoriAggiunti ?? []).filter(a => a.quantita > 0)
      .map(a => ({ codice: a.codice, serie: a.serie, descrizione: a.descrizione, quantita: a.quantita, metri: false, regolaIgnota: false })),
  ]
  for (const a of accessori) {
    // Regola di FP PRO che il motore non sa applicare: riga non contata, avviso nella voce.
    if (a.avviso) {
      avvisi.push(a.avviso)
      continue
    }
    // "_AVVISO1" e simili: messaggi di FP PRO dentro i kit (es. misure fuori campo), non prodotti.
    if (a.codice.startsWith('_')) {
      avvisi.push(a.descrizione || a.codice)
      continue
    }
    const prezzo = listino.accessorio(a.codice, a.serie)
    if (!prezzo) avvisi.push(`Accessorio ${a.codice} non trovato nel listino di FP PRO`)
    else if (prezzo.prezzo <= 0) avvisi.push(`Accessorio ${a.codice} senza prezzo`)
    if (prezzo?.avviso) avvisi.push(prezzo.avviso)
    if (a.regolaIgnota) avvisi.push(`Regola dell'accessorio ${a.codice} non interpretata: contato come da kit`)
    const costo = prezzo && prezzo.unitaVendita > 0 ? (prezzo.prezzo / prezzo.unitaVendita) * a.quantita : 0
    righe.push({ gruppo: 'accessori', codice: a.codice, descrizione: a.descrizione, quantita: tondo(a.quantita), unita: a.metri ? 'm' : 'pz', costo })
  }

  const materiali = righe.reduce((s, r) => s + r.costo, 0)
  const { profilo, ore, extraFissi } = applicaCorrezioni(input.profilo, input.tempi, input.correzioni)
  return { materiali, righe, ore, prezzo: prezzoComeFp(materiali, ore, profilo, extraFissi), peso, avvisi: [...new Set(avvisi)], profilo, extraFissi, tagli, ante }
}

function trovaNodo(nodi: NodoStruttura[], codice: number): NodoStruttura | null {
  for (const n of nodi) {
    if (n.codice === codice) return n
    const f = trovaNodo(n.figli, codice)
    if (f) return f
  }
  return null
}

/** Anta scorrevole fissa: ha pezzi 8101 (ID_ANTA_SCORREVOLE_FISSA di FP PRO) e nessun 8100; i riporti (8210) non contano. */
export function antaFissa(nodo: NodoStruttura | null, indice: number): boolean {
  const pezzi = nodo?.pezzi.filter(p => p.indice === indice) ?? []
  return pezzi.some(p => p.tipo === 8101) && !pezzi.some(p => p.tipo === 8100)
}
