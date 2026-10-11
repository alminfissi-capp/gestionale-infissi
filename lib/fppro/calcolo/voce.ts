// Calcolo completo di una voce come FP PRO: materiali (profili a barre ottimizzate,
// accessori, vetri, pannelli), ore della struttura, formula di prezzo.
// Puro: il listino arriva da fuori (actions/calcolo-fp.ts lo legge dal database).
import type { SezioneProfilo } from '../dxf-sezione'
import type { NodoStruttura } from '../strutture-xml'
import { accessoriVoce, type RegoleAccessori } from './accessori'
import { ottimizzaBarre } from './barre'
import { larghezzeDaPoligoni, pezziECampi, type Larghezze } from './geometria'
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
  accessorio(codice: string, serie: string): { prezzo: number; unitaVendita: number } | null
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

export interface CalcoloVoce {
  materiali: number
  righe: RigaMateriale[]
  ore: OreVoce
  prezzo: PrezzoVoce
  peso: number
  avvisi: string[]
}

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
  /** codice del nodo di riempimento -> codice vetro scelto */
  vetriScelti: Record<string, string>
  tempi: OreVoce
  profilo: ProfiloCalcolo
  /** Maggiorazioni del profilo di calcolo di FP PRO (maggrottvetri, maggrottpannelli) */
  maggiorazioni: { vetri: number; pannelli: number }
  correzioni?: CorrezioniVoce
  larghezze?: Larghezze
  /** Profilo di telaio scelto in cantiere per lato (codice); assente = come la struttura */
  telai?: Partial<Record<'sinistra' | 'alto' | 'destra' | 'basso', string>>
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

export function codiceDaDxf(dxf: string): string {
  return dxf.slice(Math.max(dxf.lastIndexOf('\\'), dxf.lastIndexOf('/')) + 1).replace(/\.dxf$/i, '')
}

const tondo = (v: number) => Math.round(v * 10000) / 10000

export function calcolaVoce(input: InputVoce, listino: ListinoCalcolo, regole: RegoleAccessori): CalcoloVoce {
  const avvisi: string[] = []
  const righe: RigaMateriale[] = []
  // I poligoni dell'anteprima di FP PRO sono schematici: servono solo se mancano le sezioni dei DXF.
  const larghezze = input.larghezze ?? larghezzeDaPoligoni(input.poligoni)
  const albero = conTelaiScelti(input.albero, input.telai)
  const { pezzi, campi, zone } = pezziECampi(albero, input, larghezze, dxf => listino.sezione(codiceDaDxf(dxf)))

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
  for (const [codice, { p, lunghezze }] of perCodice) {
    const { barre } = ottimizzaBarre(lunghezze, p.barra, p.testa, p.coda)
    const metri = barre.reduce((s, b) => s + b, 0) / 1000
    peso += lunghezze.reduce((s, l) => s + l, 0) / 1000 * p.kgMl
    let costo = 0
    if (p.kgMl > 0 && p.euroKg !== null) costo = metri * p.kgMl * p.fattorePeso * p.euroKg
    else if (p.euroMl !== null) costo = metri * p.euroMl
    else avvisi.push(`Profilo ${codice} senza prezzo per questo colore`)
    righe.push({ gruppo: 'profili', codice, descrizione: `${barre.length} barre`, quantita: tondo(metri), unita: 'm', costo })
  }

  // Vetri e pannelli.
  for (const c of campi) {
    const codice = c.tipo === 'vetro' ? (input.vetriScelti[c.codiceNodo] ?? codiceDaDxf(c.dxf)) : codiceDaDxf(c.dxf)
    const mq = (c.l * c.h) / 1e6
    if (c.tipo === 'vetro') {
      const v = listino.vetro(codice)
      if (!v) avvisi.push(`Vetro ${codice} senza prezzo`)
      peso += mq * (v?.kgMq ?? 0)
      const costo = v ? Math.max(mq, v.minFatt) * v.euroMq * (1 + input.maggiorazioni.vetri) : 0
      righe.push({ gruppo: 'vetri', codice, descrizione: `${Math.round(c.l)} x ${Math.round(c.h)}`, quantita: tondo(mq), unita: 'm²', costo })
    } else {
      const p = listino.pannello(codice)
      if (!p) avvisi.push(`Pannello ${codice} senza prezzo`)
      const costo = p ? Math.max(mq, p.minFatt) * p.euroMq * (1 + input.maggiorazioni.pannelli) : 0
      righe.push({ gruppo: 'pannelli', codice, descrizione: `${Math.round(c.l)} x ${Math.round(c.h)}`, quantita: tondo(mq), unita: 'm²', costo })
    }
  }

  // Accessori (le formule dei kit usano il peso del serramento).
  for (const a of accessoriVoce(albero, input.kitScelti, zone, peso, regole)) {
    const prezzo = listino.accessorio(a.codice, a.serie)
    if (!prezzo) avvisi.push(`Accessorio ${a.codice} non trovato nel listino di FP PRO`)
    if (a.regolaIgnota) avvisi.push(`Regola dell'accessorio ${a.codice} non interpretata: contato come da kit`)
    const costo = prezzo && prezzo.unitaVendita > 0 ? (prezzo.prezzo / prezzo.unitaVendita) * a.quantita : 0
    righe.push({ gruppo: 'accessori', codice: a.codice, descrizione: a.descrizione, quantita: tondo(a.quantita), unita: a.metri ? 'm' : 'pz', costo })
  }

  const materiali = righe.reduce((s, r) => s + r.costo, 0)
  const { profilo, ore, extraFissi } = applicaCorrezioni(input.profilo, input.tempi, input.correzioni)
  return { materiali, righe, ore, prezzo: prezzoComeFp(materiali, ore, profilo, extraFissi), peso, avvisi: [...new Set(avvisi)] }
}
