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
