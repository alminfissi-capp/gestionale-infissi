// Logica pura per i grafici/statistiche commesse. Nessuna dipendenza React o Supabase.

export type StatRow = {
  id: string
  cliente_nome: string
  totale: number
  data_conferma: string | null
}

export type AccontoRow = {
  commessa_id: string
  importo: number
  data_pagamento: string | null
}

export type DatiStatistiche = {
  commesse: StatRow[]
  acconti: AccontoRow[]
  anni: number[]
}

export type PuntoMese = { mese: string; valore: number; numero: number }
export type PuntoIncasso = { mese: string; incasso: number }
export type RigaResoconto = {
  anno: number
  numero: number
  fatturato: number
  incassato: number
  saldo: number
}

export const MESI_LABEL = [
  'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu',
  'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic',
]

// Estrae l'anno da una data ISO ('2026-06-26' o full timestamp). null se non valida.
function annoDi(data: string | null): number | null {
  if (!data) return null
  const y = Number(data.slice(0, 4))
  return Number.isFinite(y) && y > 1900 ? y : null
}

// Estrae l'indice mese 0-11 da una data ISO. null se non valida.
function meseDi(data: string | null): number | null {
  if (!data || data.length < 7) return null
  const m = Number(data.slice(5, 7))
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m - 1 : null
}

// Andamento commesse per mese dell'anno selezionato (12 righe gen-dic).
export function aggregaMese(commesse: StatRow[], anno: number): PuntoMese[] {
  const out: PuntoMese[] = MESI_LABEL.map((mese) => ({ mese, valore: 0, numero: 0 }))
  for (const c of commesse) {
    if (annoDi(c.data_conferma) !== anno) continue
    const m = meseDi(c.data_conferma)
    if (m === null) continue
    out[m].valore += Number(c.totale) || 0
    out[m].numero += 1
  }
  return out
}

// Incassi (acconti) per mese dell'anno selezionato (12 righe gen-dic).
export function aggregaIncassiMese(acconti: AccontoRow[], anno: number): PuntoIncasso[] {
  const out: PuntoIncasso[] = MESI_LABEL.map((mese) => ({ mese, incasso: 0 }))
  for (const a of acconti) {
    if (annoDi(a.data_pagamento) !== anno) continue
    const m = meseDi(a.data_pagamento)
    if (m === null) continue
    out[m].incasso += Number(a.importo) || 0
  }
  return out
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

// Resoconto per cliente, diviso per anno: fatturato, incassato, saldo residuo.
// Ignora il selettore anno: include tutti gli anni del cliente.
export function resocontoCliente(
  commesse: StatRow[],
  acconti: AccontoRow[],
  cliente: string,
): { righe: RigaResoconto[]; totale: RigaResoconto } {
  const target = cliente.trim().toLowerCase()
  // Commesse del cliente + mappa id → anno per attribuire gli acconti.
  const commesseCliente = commesse.filter(
    (c) => (c.cliente_nome ?? '').trim().toLowerCase() === target,
  )
  const annoPerCommessa = new Map<string, number>()
  const perAnno = new Map<number, RigaResoconto>()

  function riga(anno: number): RigaResoconto {
    let r = perAnno.get(anno)
    if (!r) {
      r = { anno, numero: 0, fatturato: 0, incassato: 0, saldo: 0 }
      perAnno.set(anno, r)
    }
    return r
  }

  for (const c of commesseCliente) {
    const anno = annoDi(c.data_conferma)
    if (anno === null) continue
    annoPerCommessa.set(c.id, anno)
    const r = riga(anno)
    r.numero += 1
    r.fatturato += Number(c.totale) || 0
  }

  // Acconti: attribuiti all'anno della commessa collegata (coerente con fatturato/saldo).
  const idsCliente = new Set(commesseCliente.map((c) => c.id))
  for (const a of acconti) {
    if (!idsCliente.has(a.commessa_id)) continue
    const anno = annoPerCommessa.get(a.commessa_id)
    if (anno === undefined) continue
    riga(anno).incassato += Number(a.importo) || 0
  }

  const righe = [...perAnno.values()].sort((a, b) => b.anno - a.anno)
  for (const r of righe) r.saldo = r.fatturato - r.incassato

  const totale: RigaResoconto = righe.reduce(
    (acc, r) => ({
      anno: 0,
      numero: acc.numero + r.numero,
      fatturato: acc.fatturato + r.fatturato,
      incassato: acc.incassato + r.incassato,
      saldo: acc.saldo + r.saldo,
    }),
    { anno: 0, numero: 0, fatturato: 0, incassato: 0, saldo: 0 },
  )

  return { righe, totale }
}
