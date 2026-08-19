// lib/calendario.ts
import { ASPETTO_TIPO, GIORNI_SETTIMANA } from '@/types/calendario'
import type { Chiusura, OrariLavoro, TipoEvento } from '@/types/calendario'

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

/**
 * Unione discriminata di proposito: a giorno chiuso gli orari non esistono.
 * Prima erano presenti comunque, e la domenica riportava un plausibilissimo
 * 08:00-19:00 accanto ad `aperto: false` — un invito a disegnare una fascia
 * oraria che non c'e'. Cosi' leggerli senza aver prima controllato `aperto`
 * e' un errore di compilazione, non un bug da scoprire sullo schermo.
 */
export type StatoGiorno =
  | { aperto: true; apertura: string; chiusura: string; motivoChiusura: null }
  | {
      aperto: false
      /** Il nome del giorno, o la descrizione della chiusura. */
      motivoChiusura: string
    }

/**
 * Una chiusura ricorrente ignora l'anno: valgono giorno e mese. Un intervallo
 * ricorrente puo' scavalcare il capodanno (24/12 - 06/01): in quel caso gli
 * estremi si invertono e il confronto diventa "prima dell'inizio oppure dopo
 * la fine".
 */
export function chiusuraCopre(chiusura: Chiusura, data: string): boolean {
  if (!chiusura.ricorrente) {
    return data >= chiusura.data_inizio && data <= chiusura.data_fine
  }
  const giorno = data.slice(5)
  const inizio = chiusura.data_inizio.slice(5)
  const fine = chiusura.data_fine.slice(5)
  return inizio <= fine
    ? giorno >= inizio && giorno <= fine
    : giorno >= inizio || giorno <= fine
}

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

  const chiusuraAttiva = chiusure.find((c) => chiusuraCopre(c, data))
  if (chiusuraAttiva) {
    return { aperto: false, motivoChiusura: chiusuraAttiva.descrizione }
  }

  if (!orario.aperto) {
    return { aperto: false, motivoChiusura: GIORNI_SETTIMANA[indice] }
  }

  return {
    aperto: true,
    apertura: orario.apertura,
    chiusura: orario.chiusura,
    motivoChiusura: null,
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

type Etichettabile = {
  tipo: TipoEvento
  titolo: string | null
  cliente_nome: string | null
  fornitore_nome: string | null
}

/**
 * Testo della barra, nella forma usata sul foglio appeso in officina:
 * "Ricez. Vetri METALVETRO ---SPAGNA---".
 */
export function etichettaEvento(evento: Etichettabile): string {
  const cliente = evento.cliente_nome?.trim()
  if (cliente) {
    const parti = [ASPETTO_TIPO[evento.tipo].label]
    const fornitore = evento.fornitore_nome?.trim()
    if (fornitore) parti.push(fornitore)
    return `${parti.join(' ')} ---${cliente}---`
  }

  const titolo = evento.titolo?.trim()
  if (titolo) return titolo

  return ASPETTO_TIPO[evento.tipo].label
}

/** Somma giorni a una data 'YYYY-MM-DD' restando in fuso locale. */
export function aggiungiGiorni(data: string, giorni: number): string {
  const d = new Date(`${data}T00:00:00`)
  d.setDate(d.getDate() + giorni)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export type GiornoCatena = { data: string; ora_inizio: string; ora_fine: string }

/**
 * Espande una lavorazione continuativa in una riga per giorno lavorativo.
 * I giorni chiusi vengono saltati e non consumano il conteggio; se un giorno
 * chiude prima dell'orario richiesto, la giornata si accorcia.
 *
 * ATTENZIONE: puo' restituire MENO di `numeroGiorni`. Il limite di 200
 * iterazioni evita di girare a vuoto quando tutto e' chiuso, ma la funzione
 * tronca in silenzio. Chi la chiama deve confrontare `giorni.length` con
 * `numeroGiorni` e avvisare l'utente: una catena piu' corta del richiesto,
 * senza un messaggio, si nota solo contando le barre sul Gantt.
 */
export function espandiCatena(
  dataInizio: string,
  numeroGiorni: number,
  oraInizio: string,
  oraFine: string,
  orari: OrariLavoro,
  chiusure: Chiusura[]
): GiornoCatena[] {
  const giorni: GiornoCatena[] = []
  let data = dataInizio
  let tentativi = 0

  while (giorni.length < numeroGiorni && tentativi < 200) {
    tentativi++
    const stato = statoGiorno(data, orari, chiusure)
    if (stato.aperto) {
      const fine = Math.min(minutiDaOra(oraFine), minutiDaOra(stato.chiusura))
      const inizio = Math.max(minutiDaOra(oraInizio), minutiDaOra(stato.apertura))
      if (fine > inizio) {
        giorni.push({
          data,
          ora_inizio: oraDaMinuti(inizio),
          ora_fine: oraDaMinuti(fine),
        })
      }
    }
    data = aggiungiGiorni(data, 1)
  }

  return giorni
}

/** I sette giorni della settimana che contiene `data`, da lunedi' a domenica. */
export function settimanaDi(data: string): string[] {
  const lunedi = aggiungiGiorni(data, -indiceGiornoSettimana(data))
  return Array.from({ length: 7 }, (_, i) => aggiungiGiorni(lunedi, i))
}

/**
 * Le settimane che compongono la griglia del mese. Sono sempre intere, quindi
 * la prima e l'ultima possono sconfinare nel mese vicino: la vista mese li
 * mostra in grigio, come su qualunque calendario di carta.
 */
export function settimaneDelMese(anno: number, mese: number): string[][] {
  const mm = String(mese).padStart(2, '0')
  const ultimoGiorno = new Date(anno, mese, 0).getDate()
  const settimane: string[][] = []

  let corrente = settimanaDi(`${anno}-${mm}-01`)
  const fineMese = `${anno}-${mm}-${String(ultimoGiorno).padStart(2, '0')}`
  while (corrente[0] <= fineMese) {
    settimane.push(corrente)
    corrente = settimanaDi(aggiungiGiorni(corrente[0], 7))
  }
  return settimane
}

/**
 * Eventi indicizzati per data e ordinati per ora di inizio: e' la forma in cui
 * le viste mese, settimana e giorno li pescano senza rifiltrare l'elenco.
 */
export function raggruppaPerGiorno<T extends { data: string; ora_inizio: string }>(
  eventi: T[]
): Map<string, T[]> {
  const mappa = new Map<string, T[]>()
  for (const e of eventi) {
    const dellaData = mappa.get(e.data)
    if (dellaData) dellaData.push(e)
    else mappa.set(e.data, [e])
  }
  for (const elenco of mappa.values()) {
    elenco.sort((a, b) => a.ora_inizio.localeCompare(b.ora_inizio))
  }
  return mappa
}
