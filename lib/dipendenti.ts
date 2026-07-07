import type {
  BustaPaga,
  Dipendente,
  Mensilita,
  PagamentoDipendente,
} from '@/types/dipendente'

export const MENSILITA_LABELS: Record<Mensilita, string> = {
  mensile: 'Mensile',
  tredicesima: 'Tredicesima',
  quattordicesima: 'Quattordicesima',
  altro: 'Altro',
}

const ORDINE_MENSILITA: Record<Mensilita, number> = {
  mensile: 0,
  tredicesima: 1,
  quattordicesima: 2,
  altro: 3,
}

const arrotonda = (n: number) => Math.round(n * 100) / 100

export interface RigaMensilita {
  periodo: string // 'YYYY-MM-01'
  mensilita: Mensilita
  busta: BustaPaga | null
  pagamenti: PagamentoDipendente[]
  dovuto: number
  pagato: number
  residuo: number
}

/**
 * Raggruppa buste e pagamenti per (mese, mensilità) e calcola i residui.
 * Righe ordinate dal mese più recente; include anche mesi con soli
 * pagamenti (busta non ancora caricata → dovuto 0, residuo negativo).
 */
export function calcolaRigheMensilita(
  buste: BustaPaga[],
  pagamenti: PagamentoDipendente[],
): RigaMensilita[] {
  const mappa = new Map<string, RigaMensilita>()
  const getRiga = (periodo: string, mensilita: Mensilita): RigaMensilita => {
    const mese = periodo.slice(0, 7)
    const key = `${mese}|${mensilita}`
    let riga = mappa.get(key)
    if (!riga) {
      riga = { periodo: `${mese}-01`, mensilita, busta: null, pagamenti: [], dovuto: 0, pagato: 0, residuo: 0 }
      mappa.set(key, riga)
    }
    return riga
  }

  for (const b of buste) {
    const riga = getRiga(b.periodo, b.mensilita)
    riga.busta = b
    riga.dovuto += Number(b.netto)
  }
  for (const p of pagamenti) {
    const riga = getRiga(p.periodo_competenza, p.mensilita)
    riga.pagamenti.push(p)
    riga.pagato += Number(p.importo)
  }

  const righe = [...mappa.values()]
  for (const r of righe) {
    r.dovuto = arrotonda(r.dovuto)
    r.pagato = arrotonda(r.pagato)
    r.residuo = arrotonda(r.dovuto - r.pagato)
    r.pagamenti.sort((a, b) => a.data_pagamento.localeCompare(b.data_pagamento))
  }
  righe.sort(
    (a, b) =>
      b.periodo.localeCompare(a.periodo) ||
      ORDINE_MENSILITA[a.mensilita] - ORDINE_MENSILITA[b.mensilita],
  )
  return righe
}

export interface SaldoDipendente {
  dovuto: number
  pagato: number
  residuo: number
  mesi_aperti: number
}

export type DipendenteConSaldo = Dipendente & SaldoDipendente

export function calcolaSaldoDipendente(
  buste: BustaPaga[],
  pagamenti: PagamentoDipendente[],
): SaldoDipendente {
  const righe = calcolaRigheMensilita(buste, pagamenti)
  const dovuto = arrotonda(righe.reduce((s, r) => s + r.dovuto, 0))
  const pagato = arrotonda(righe.reduce((s, r) => s + r.pagato, 0))
  return {
    dovuto,
    pagato,
    residuo: arrotonda(dovuto - pagato),
    mesi_aperti: righe.filter((r) => r.residuo > 0).length,
  }
}

/** '2026-06-01' → 'giugno 2026' (capitalizzato dal chiamante se serve) */
export function formatPeriodo(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
}

const norm = (s: string) => s.replace(/\s/g, '').toUpperCase()

/** Matching busta → dipendente: prima per CF, poi per nome+cognome esatti. */
export function matchDipendente(
  dipendenti: Dipendente[],
  dati: { codice_fiscale: string | null; nome: string; cognome: string },
): Dipendente | null {
  if (dati.codice_fiscale) {
    const cf = norm(dati.codice_fiscale)
    const m = dipendenti.find((d) => d.codice_fiscale && norm(d.codice_fiscale) === cf)
    if (m) return m
  }
  const nome = dati.nome.trim().toLowerCase()
  const cognome = dati.cognome.trim().toLowerCase()
  return (
    dipendenti.find(
      (d) => d.nome.trim().toLowerCase() === nome && d.cognome.trim().toLowerCase() === cognome,
    ) ?? null
  )
}

/** Matching bonifico → dipendente: prima per IBAN, poi nome+cognome contenuti nel beneficiario. */
export function matchBeneficiario(
  dipendenti: Dipendente[],
  dati: { beneficiario: string | null; iban_beneficiario: string | null },
): Dipendente | null {
  if (dati.iban_beneficiario) {
    const iban = norm(dati.iban_beneficiario)
    const m = dipendenti.find((d) => d.iban && norm(d.iban) === iban)
    if (m) return m
  }
  if (!dati.beneficiario) return null
  const b = dati.beneficiario.toLowerCase()
  return (
    dipendenti.find(
      (d) => b.includes(d.nome.trim().toLowerCase()) && b.includes(d.cognome.trim().toLowerCase()),
    ) ?? null
  )
}
