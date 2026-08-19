// lib/calendario.ts
import type { Chiusura, OrariLavoro } from '@/types/calendario'

/** 'HH:MM' o 'HH:MM:SS' → minuti dalla mezzanotte. */
export function minutiDaOra(ora: string): number {
  const [h, m] = ora.split(':')
  return Number(h) * 60 + Number(m)
}

/** Minuti dalla mezzanotte → 'HH:MM'. */
export function oraDaMinuti(minuti: number): string {
  const h = Math.floor(minuti / 60)
  const m = minuti % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Indice del giorno della settimana con 0 = lunedi', per indicizzare OrariLavoro.
 * getDay() di JavaScript usa 0 = domenica, quindi va ruotato.
 */
export function indiceGiornoSettimana(data: string): number {
  const d = new Date(`${data}T00:00:00`)
  return (d.getDay() + 6) % 7
}

export type StatoGiorno = {
  aperto: boolean
  apertura: string
  chiusura: string
  /** Perche' e' chiuso: il nome del giorno o la descrizione della chiusura. */
  motivoChiusura: string | null
}

const NOMI_GIORNI = [
  'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica',
]

/**
 * Stato di un giorno: aperto o chiuso, con quali orari e per quale motivo.
 * Le chiusure hanno la precedenza sull'orario settimanale.
 */
export function statoGiorno(
  data: string,
  orari: OrariLavoro,
  chiusure: Chiusura[]
): StatoGiorno {
  const indice = indiceGiornoSettimana(data)
  const orario = orari[indice]

  const chiusuraAttiva = chiusure.find(
    (c) => data >= c.data_inizio && data <= c.data_fine
  )
  if (chiusuraAttiva) {
    return {
      aperto: false,
      apertura: orario.apertura,
      chiusura: orario.chiusura,
      motivoChiusura: chiusuraAttiva.descrizione,
    }
  }

  return {
    aperto: orario.aperto,
    apertura: orario.apertura,
    chiusura: orario.chiusura,
    motivoChiusura: orario.aperto ? null : NOMI_GIORNI[indice],
  }
}

/**
 * Estremi della griglia oraria: dall'apertura piu' presto alla chiusura piu'
 * tardi fra i giorni aperti. Le colonne del Gantt nascono da qui.
 */
export function fasciaGriglia(orari: OrariLavoro): { inizio: string; fine: string } {
  const aperti = orari.filter((g) => g.aperto)
  if (aperti.length === 0) return { inizio: '08:00', fine: '19:00' }
  const inizio = Math.min(...aperti.map((g) => minutiDaOra(g.apertura)))
  const fine = Math.max(...aperti.map((g) => minutiDaOra(g.chiusura)))
  return { inizio: oraDaMinuti(inizio), fine: oraDaMinuti(fine) }
}

export type Fascia = { inizio: string; fine: string }

export type PosizioneBarra = {
  /** Percentuale della larghezza della griglia. */
  sinistraPct: number
  larghezzaPct: number
}

/**
 * Posizione orizzontale di una barra dentro la griglia oraria, in percentuale.
 * Gli eventi che sbordano dalla fascia vengono tagliati ai bordi invece di
 * uscire dalla griglia.
 */
export function posizioneBarra(
  oraInizio: string,
  oraFine: string,
  fascia: Fascia
): PosizioneBarra {
  const gInizio = minutiDaOra(fascia.inizio)
  const gFine = minutiDaOra(fascia.fine)
  const durataGriglia = Math.max(1, gFine - gInizio)

  const inizio = Math.max(gInizio, Math.min(gFine, minutiDaOra(oraInizio)))
  const fine = Math.max(inizio, Math.min(gFine, minutiDaOra(oraFine)))

  return {
    sinistraPct: ((inizio - gInizio) / durataGriglia) * 100,
    larghezzaPct: ((fine - inizio) / durataGriglia) * 100,
  }
}

type Impilabile = { id: string; ora_inizio: string; ora_fine: string }

export type EventoImpilato<T extends Impilabile> = T & { riga: number }

/**
 * Assegna a ogni evento la riga verticale in cui disegnarlo dentro la giornata:
 * la prima riga in cui non si sovrappone a nulla. E' l'impilamento che nel
 * foglio in officina si vede quando piu' attivita' occupano la stessa fascia.
 */
export function impilaEventi<T extends Impilabile>(eventi: T[]): EventoImpilato<T>[] {
  const ordinati = [...eventi].sort((a, b) => {
    const d = minutiDaOra(a.ora_inizio) - minutiDaOra(b.ora_inizio)
    return d !== 0 ? d : a.id.localeCompare(b.id)
  })

  // Per ogni riga, il minuto in cui si libera.
  const fineRiga: number[] = []
  return ordinati.map((evento) => {
    const inizio = minutiDaOra(evento.ora_inizio)
    const fine = minutiDaOra(evento.ora_fine)
    let riga = fineRiga.findIndex((f) => f <= inizio)
    if (riga === -1) riga = fineRiga.length
    fineRiga[riga] = fine
    return { ...evento, riga }
  })
}

/** Arrotonda i minuti al passo della griglia, per lo snap del trascinamento. */
export function snapMinuti(minuti: number, passo = 30): number {
  return Math.round(minuti / passo) * passo
}
