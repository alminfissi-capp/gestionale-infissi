// Solo per i test: commesse vere calcolate da FP PRO (estratte con ponte/strumenti/estrai-commessa.ts).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import { OPZIONI_XML, strutturaDaXml, type StrutturaLetta } from '../strutture-xml'

export interface CommessaFp {
  nome: string
  l: number
  h: number
  config: { nome: string | null; spese_generali: number; utile: number; provvigione: number }
  lavoro: { descrizione: string; ore: number; euroOra: number }[]
  speseVarie: { descrizione: string; perc: number; fisso: number }[]
  profili: { codice: string; lunghezza: number; quantita: number; kgMl: number; peso: number; costo: number }[]
  accessori: { codice: string; descrizione: string; quantita: number; prezzo: number; unitaVendita: number; costo: number }[]
  vetri: { codice: string; quantita: number; l: number; h: number; prezzoMq: number; costo: number }[]
  pannelli: { codice: string; quantita: number; l: number; h: number; prezzoMq: number; costo: number }[]
  anagrafica: {
    profili: { codice: string; composto: boolean; kgMl: number }[]
    componenti: { composto: string; componente: string; kgMl: number; principale: boolean; offset: number }[]
    barre: { codice: string; lunghezza: number }[]
    scarti: { codice: string; testa: number; coda: number }[]
  }
  totali: {
    costoProfili: number; costoAccessori: number; costoGuarnizioni: number; costoVetri: number
    costoPannelli: number; costoPuro: number; costoIndustriale: number; imponibile: number
  }
}

export function commessaFp(nome: string): { dati: CommessaFp; struttura: StrutturaLetta } {
  const cartella = __dirname
  const dati = JSON.parse(readFileSync(join(cartella, `commessa-${nome}.json`), 'utf8')) as CommessaFp
  const doc = new XMLParser(OPZIONI_XML).parse(readFileSync(join(cartella, `commessa-${nome}.xml`), 'utf8')) as {
    FP_JOBRECORD: { FP_TREE: unknown }
  }
  return { dati, struttura: strutturaDaXml({ FP_TREE: doc.FP_JOBRECORD.FP_TREE }) }
}
