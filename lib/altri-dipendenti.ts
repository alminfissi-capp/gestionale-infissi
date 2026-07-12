import type {
  AltroDipendente,
  CadenzaAltro,
  MovimentoAltroDipendente,
} from '@/types/dipendente'

export const CADENZA_LABELS: Record<CadenzaAltro, string> = {
  settimanale: 'Settimanale',
  mensile: 'Mensile',
}

const arrotonda = (n: number) => Math.round(n * 100) / 100

/**
 * Normalizza una data ('YYYY-MM-DD') nella chiave-periodo canonica secondo la cadenza:
 * - mensile → primo giorno del mese ('YYYY-MM-01')
 * - settimanale → lunedì della settimana (lun–dom) che contiene la data
 * Usa UTC per evitare slittamenti di fuso orario.
 */
export function normalizzaPeriodo(data: string, cadenza: CadenzaAltro): string {
  const [y, m, d] = data.split('-').map(Number)
  if (cadenza === 'mensile') {
    return `${y}-${String(m).padStart(2, '0')}-01`
  }
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = dt.getUTCDay() // 0=domenica … 6=sabato
  const diff = dow === 0 ? -6 : 1 - dow // porta al lunedì
  dt.setUTCDate(dt.getUTCDate() + diff)
  return dt.toISOString().slice(0, 10)
}

export interface RigaAltro {
  periodo: string // chiave canonica
  stipendi: MovimentoAltroDipendente[]
  pagamenti: MovimentoAltroDipendente[]
  dovuto: number
  pagato: number
  residuo: number
}

/**
 * Raggruppa i movimenti per periodo canonico e calcola i residui.
 * Righe ordinate dal periodo più recente; include periodi con soli pagamenti
 * (dovuto 0 → residuo negativo).
 */
export function calcolaRigheAltro(movimenti: MovimentoAltroDipendente[]): RigaAltro[] {
  const mappa = new Map<string, RigaAltro>()
  const getRiga = (periodo: string): RigaAltro => {
    let r = mappa.get(periodo)
    if (!r) {
      r = { periodo, stipendi: [], pagamenti: [], dovuto: 0, pagato: 0, residuo: 0 }
      mappa.set(periodo, r)
    }
    return r
  }

  for (const m of movimenti) {
    const r = getRiga(m.periodo)
    if (m.tipo === 'stipendio') {
      r.stipendi.push(m)
      r.dovuto += Number(m.importo)
    } else {
      r.pagamenti.push(m)
      r.pagato += Number(m.importo)
    }
  }

  const righe = [...mappa.values()]
  for (const r of righe) {
    r.dovuto = arrotonda(r.dovuto)
    r.pagato = arrotonda(r.pagato)
    r.residuo = arrotonda(r.dovuto - r.pagato)
    r.stipendi.sort((a, b) => a.created_at.localeCompare(b.created_at))
    r.pagamenti.sort((a, b) => (a.data_pagamento ?? '').localeCompare(b.data_pagamento ?? ''))
  }
  righe.sort((a, b) => b.periodo.localeCompare(a.periodo))
  return righe
}

export interface SaldoAltro {
  dovuto: number
  pagato: number
  residuo: number
  periodi_aperti: number
}

export type AltroDipendenteConSaldo = AltroDipendente & SaldoAltro

export function calcolaSaldoAltro(movimenti: MovimentoAltroDipendente[]): SaldoAltro {
  const righe = calcolaRigheAltro(movimenti)
  const dovuto = arrotonda(righe.reduce((s, r) => s + r.dovuto, 0))
  const pagato = arrotonda(righe.reduce((s, r) => s + r.pagato, 0))
  return {
    dovuto,
    pagato,
    residuo: arrotonda(dovuto - pagato),
    periodi_aperti: righe.filter((r) => r.residuo > 0).length,
  }
}

/** Etichetta leggibile del periodo secondo la cadenza. */
export function formatPeriodoAltro(periodo: string, cadenza: CadenzaAltro): string {
  const [y, m, d] = periodo.split('-').map(Number)
  if (cadenza === 'mensile') {
    return new Date(y, m - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
  }
  const lun = new Date(y, m - 1, d)
  const dom = new Date(y, m - 1, d + 6)
  const f = (x: Date) => x.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
  return `Settimana dal ${f(lun)} al ${f(dom)}`
}
