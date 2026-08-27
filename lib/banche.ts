// Esposizione verso le banche: fido di cassa sui conti correnti e anticipi fattura.
// Logica pura: niente React, niente Supabase, e `oggi` arriva sempre dal chiamante come
// 'YYYY-MM-DD' — le date ISO si confrontano come stringhe e i test restano riproducibili.
//
// Due convenzioni d'inserimento opposte, entrambe volute (vedi la spec):
//  · conto corrente → si scrive il DISPONIBILE, l'utilizzato si ricava
//  · linea di credito → si scrivono i singoli ANTICIPI, utilizzato e disponibile si ricavano

export type TipoLineaCredito = 'anticipo_fatture' | 'sbf' | 'castelletto' | 'altro'

export type ContoBancaRow = {
  id: string
  nome: string
  disponibile: number // saldo_attuale: quanto si può spendere, fido incluso
  accordato: number   // fido_accordato
}

export type LineaCreditoRow = {
  id: string
  nome: string
  tipo: TipoLineaCredito
  accordato: number
}

export type AnticipoRow = {
  id: string
  linea_id: string
  commessa_id: string | null
  descrizione: string
  importo: number
  data_scadenza: string | null // 'YYYY-MM-DD'
  rimborsato: boolean
}

// Quello che la pagina sa delle commesse collegate. Chiave = commessa_id.
// Una chiave mancante non è un errore: l'anticipo si mostra senza residuo.
export type InfoCommessa = { etichetta: string; residuo: number }

export type AnticipoCalcolato = AnticipoRow & {
  etichettaCommessa: string | null
  residuoCommessa: number | null
  scaduto: boolean
  daChiudere: boolean // la commessa risulta saldata: promemoria, non azione
}

export type UtilizzoBanca = {
  id: string
  nome: string
  accordato: number
  disponibile: number
  utilizzato: number
  residuo: number
  anticipi: AnticipoCalcolato[] // sempre vuoto per i conti correnti
}

export type RiepilogoBanche = {
  conti: UtilizzoBanca[] // solo quelli con un fido accordato
  linee: UtilizzoBanca[]
  liquiditaPropria: number // Σ max(0, disponibile − accordato) sui conti
  fidoCassaUtilizzato: number
  lineeUtilizzato: number
  utilizzatoTotale: number
  residuoTotale: number
  anticipiScaduti: number
  anticipiDaChiudere: number
}

const num = (v: number) => (Number.isFinite(Number(v)) ? Number(v) : 0)

// Floor per singola entità, come per i crediti da commessa e i conti dipendenti:
// un conto in attivo non deve mascherare il rosso di un altro.
export function utilizzoConto(c: ContoBancaRow): {
  utilizzato: number
  propria: number
  residuo: number
} {
  const accordato = num(c.accordato)
  const disponibile = num(c.disponibile)
  return {
    utilizzato: Math.max(0, accordato - disponibile),
    propria: Math.max(0, disponibile - accordato),
    residuo: Math.max(0, Math.min(disponibile, accordato)),
  }
}

export function riepilogoBanche(
  conti: ContoBancaRow[],
  linee: LineaCreditoRow[],
  anticipi: AnticipoRow[],
  commesse: Record<string, InfoCommessa>,
  oggi: string,
): RiepilogoBanche {
  let liquiditaPropria = 0
  let fidoCassaUtilizzato = 0
  const contiUso: UtilizzoBanca[] = []

  for (const c of conti) {
    const { utilizzato, propria, residuo } = utilizzoConto(c)
    liquiditaPropria += propria
    fidoCassaUtilizzato += utilizzato
    // Una riga di fido a zero non dice niente: resta fuori dal dettaglio, ma la sua
    // disponibilità è già entrata in liquiditaPropria.
    if (num(c.accordato) <= 0) continue
    contiUso.push({
      id: c.id,
      nome: c.nome,
      accordato: num(c.accordato),
      disponibile: num(c.disponibile),
      utilizzato,
      residuo,
      anticipi: [],
    })
  }

  const utilizzatoTotale = fidoCassaUtilizzato
  const residuoTotale = contiUso.reduce((s, c) => s + c.residuo, 0)

  return {
    conti: contiUso,
    linee: [],
    liquiditaPropria,
    fidoCassaUtilizzato,
    lineeUtilizzato: 0,
    utilizzatoTotale,
    residuoTotale,
    anticipiScaduti: 0,
    anticipiDaChiudere: 0,
  }
}
