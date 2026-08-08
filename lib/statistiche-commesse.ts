// Logica pura per i grafici/statistiche commesse. Nessuna dipendenza React o Supabase.
//
// Definizione di "anno":
// - Andamento commesse e Resoconto cliente → l'anno è il BLOCCO di appartenenza
//   (i blocchi commesse sono nominati per anno: "2025", "2026"). I 12 mesi del
//   grafico vengono dalla data di conferma.
// - Incassi → l'anno è quello della DATA DI PAGAMENTO dell'acconto, a prescindere
//   dal blocco della commessa collegata.

export type StatRow = {
  id: string
  cliente_nome: string
  totale: number
  data_conferma: string | null
  blocco: string | null // nome del blocco/gruppo commesse di appartenenza
}

export type AccontoRow = {
  commessa_id: string
  importo: number
  data_pagamento: string | null
}

// Contributo costi/utile di una commessa, sommato dai suoi preventivi INTERNI.
export type CostoCommessaRow = {
  commessa_id: string
  blocco: string | null
  data_conferma: string | null
  materiali: number
  posa: number
  spese: number // spese varie degli articoli su misura (costo, non utile)
  utile: number
}

export type DatiStatistiche = {
  commesse: StatRow[]
  acconti: AccontoRow[]
  anni: string[] // valori del selettore (nomi blocco + anni di pagamento), desc
  costiCommesse: CostoCommessaRow[] // commesse con ≥1 preventivo interno collegato
}

export type PuntoMese = { mese: string; valore: number; numero: number }
export type PuntoIncasso = { mese: string; incasso: number }
export type PuntoCostiUtili = { mese: string; materiali: number; posa: number; spese: number; costi: number; utile: number }
export type RigaResoconto = {
  anno: string // nome del blocco (o etichetta totale)
  numero: number
  fatturato: number
  incassato: number
  saldo: number
}

export const MESI_LABEL = [
  'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu',
  'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic',
]

// Estrae l'anno (stringa "YYYY") da una data ISO. '' se non valida.
function annoStr(data: string | null): string {
  if (!data || data.length < 4) return ''
  const y = data.slice(0, 4)
  return /^\d{4}$/.test(y) ? y : ''
}

// Estrae l'indice mese 0-11 da una data ISO. null se non valida.
function meseDi(data: string | null): number | null {
  if (!data || data.length < 7) return null
  const m = Number(data.slice(5, 7))
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m - 1 : null
}

// Andamento commesse del blocco selezionato (12 righe gen-dic), distribuite per
// mese di data_conferma.
export function aggregaMese(commesse: StatRow[], anno: string): PuntoMese[] {
  const out: PuntoMese[] = MESI_LABEL.map((mese) => ({ mese, valore: 0, numero: 0 }))
  for (const c of commesse) {
    if (c.blocco !== anno) continue
    const m = meseDi(c.data_conferma)
    if (m === null) continue
    out[m].valore += Number(c.totale) || 0
    out[m].numero += 1
  }
  return out
}

// Incassi (acconti) per mese dell'anno di PAGAMENTO selezionato (12 righe gen-dic).
export function aggregaIncassiMese(acconti: AccontoRow[], anno: string): PuntoIncasso[] {
  const out: PuntoIncasso[] = MESI_LABEL.map((mese) => ({ mese, incasso: 0 }))
  for (const a of acconti) {
    if (annoStr(a.data_pagamento) !== anno) continue
    const m = meseDi(a.data_pagamento)
    if (m === null) continue
    out[m].incasso += Number(a.importo) || 0
  }
  return out
}

// Costi/utili stimati per mese del blocco selezionato (12 righe gen-dic),
// distribuiti per mese di data_conferma della commessa.
export function aggregaCostiUtiliMese(costi: CostoCommessaRow[], anno: string): PuntoCostiUtili[] {
  const out: PuntoCostiUtili[] = MESI_LABEL.map((mese) => ({ mese, materiali: 0, posa: 0, spese: 0, costi: 0, utile: 0 }))
  for (const c of costi) {
    if (c.blocco !== anno) continue
    const m = meseDi(c.data_conferma)
    if (m === null) continue
    out[m].materiali += Number(c.materiali) || 0
    out[m].posa += Number(c.posa) || 0
    out[m].spese += Number(c.spese) || 0
    out[m].utile += Number(c.utile) || 0
  }
  for (const p of out) p.costi = p.materiali + p.posa + p.spese
  return out
}

// Quante commesse del blocco selezionato NON hanno un preventivo interno (escluse dalla stima).
export function contaCommesseSenzaPreventivo(
  commesse: StatRow[],
  costi: CostoCommessaRow[],
  anno: string,
): number {
  const conPreventivo = new Set(costi.filter((c) => c.blocco === anno).map((c) => c.commessa_id))
  const totBlocco = commesse.filter((c) => c.blocco === anno).length
  return Math.max(0, totBlocco - conPreventivo.size)
}

// Lista clienti unici (case-insensitive sul confronto, label originale), ordinati.
export function clientiUnici(commesse: StatRow[]): string[] {
  const map = new Map<string, string>()
  for (const c of commesse) {
    const nome = (c.cliente_nome ?? '').trim()
    if (!nome) continue
    const key = nome.toLowerCase()
    if (!map.has(key)) map.set(key, nome)
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, 'it'))
}

// Ordina valori "anno" (nomi blocco numerici) in modo decrescente.
function ordinaAnniDesc(a: string, b: string): number {
  const na = Number(a)
  const nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na
  return b.localeCompare(a)
}

// Resoconto per cliente, diviso per BLOCCO: fatturato, incassato, saldo residuo.
// Indipendente dal selettore: include tutti i blocchi del cliente.
export function resocontoCliente(
  commesse: StatRow[],
  acconti: AccontoRow[],
  cliente: string,
): { righe: RigaResoconto[]; totale: RigaResoconto } {
  const target = cliente.trim().toLowerCase()
  const commesseCliente = commesse.filter(
    (c) => (c.cliente_nome ?? '').trim().toLowerCase() === target,
  )
  const bloccoPerCommessa = new Map<string, string>()
  const perBlocco = new Map<string, RigaResoconto>()

  function riga(blocco: string): RigaResoconto {
    let r = perBlocco.get(blocco)
    if (!r) {
      r = { anno: blocco, numero: 0, fatturato: 0, incassato: 0, saldo: 0 }
      perBlocco.set(blocco, r)
    }
    return r
  }

  for (const c of commesseCliente) {
    const blocco = c.blocco ?? '(senza blocco)'
    bloccoPerCommessa.set(c.id, blocco)
    const r = riga(blocco)
    r.numero += 1
    r.fatturato += Number(c.totale) || 0
  }

  // Acconti: attribuiti al blocco della commessa collegata (coerente con fatturato/saldo).
  const idsCliente = new Set(commesseCliente.map((c) => c.id))
  for (const a of acconti) {
    if (!idsCliente.has(a.commessa_id)) continue
    const blocco = bloccoPerCommessa.get(a.commessa_id)
    if (blocco === undefined) continue
    riga(blocco).incassato += Number(a.importo) || 0
  }

  const righe = [...perBlocco.values()].sort((a, b) => ordinaAnniDesc(a.anno, b.anno))
  for (const r of righe) r.saldo = r.fatturato - r.incassato

  const totale: RigaResoconto = righe.reduce(
    (acc, r) => ({
      anno: '',
      numero: acc.numero + r.numero,
      fatturato: acc.fatturato + r.fatturato,
      incassato: acc.incassato + r.incassato,
      saldo: acc.saldo + r.saldo,
    }),
    { anno: '', numero: 0, fatturato: 0, incassato: 0, saldo: 0 },
  )

  return { righe, totale }
}
