'use server'

import fs from 'fs'
import path from 'path'

const DATA_PATH = path.join(process.cwd(), 'data/scorrevoli/scorrevoli_listino.json')

export type ScorevoliListino = {
  _meta: { fonte: string; fornitore: string; data_estrazione: string; nota: string }
  modelli: Modello[]
  configurazioni_fisse: ConfigurazioneFissa[]
  colori_struttura: ColoreStruttura[]
  colori_accessori: { nome: string }[]
  optional: Optional[]
  parametri_commerciali: ParametriCommerciali
}

export type Modello = {
  id: string
  nome: string
  descrizione: string
  prezzo_mq?: number
  prezzo_mq_fasce?: FasciaPrezzo[]
  altezza_min_fatturazione_mm: number
  larghezza_anta_min_mm: number
  larghezza_anta_max_mm: number
  mq_minimi_fatturazione: number | null
  altezza_max_mm: number
  note: string | null
  configurazione_ante_per_larghezza?: { larghezza_max_mm: number; nr_ante: number }[]
}

export type FasciaPrezzo = {
  fascia: string
  altezza_max_mm: number
  altezza_min_mm?: number
  prezzo_mq: number
}

export type ConfigurazioneFissa = {
  modello: string
  apertura: string
  nr_ante: number | string
  larghezza_max_mm: number
  altezza_max_mm: number
  prezzo: number
}

export type ColoreStruttura = {
  nome: string
  ral: string | null
  tipo: 'standard' | 'extra'
  maggiorazione: number
  modelli_applicabili: string[]
  nota?: string
}

export type Optional = {
  id: string
  descrizione: string
  prezzo: number | null
  unita: string
  modelli_applicabili: string[]
  nota?: string
}

export type ParametriCommerciali = {
  _nota: string
  sconto_vetrata_prisma: { valore: number; descrizione: string; editabile: boolean }
  sconto_optional: { valore: number; descrizione: string; editabile: boolean }
  trasporto: { valore: number; descrizione: string; editabile: boolean }
  iva: { valore: number; descrizione: string; editabile: boolean }
  margine_alm: { valore: number | null; descrizione: string; editabile: boolean }
}

export async function getScorevoliListino(): Promise<ScorevoliListino> {
  const raw = fs.readFileSync(DATA_PATH, 'utf-8')
  return JSON.parse(raw)
}

export async function saveScorevoliListino(data: ScorevoliListino): Promise<void> {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8')
}
