// Resoconto mensile dei costi: costi fissi, costi variabili e tasse, mese per mese.
// Logica pura: nessuna dipendenza React o Supabase.
//
// Definizione di "anno": l'anno di CALENDARIO in cui il costo matura — la data di
// scadenza per le scadenze, il periodo di competenza per gli stipendi. Non è il
// nome del blocco commesse.
//
// COMPETENZA, NON CASSA: un costo conta nel mese in cui matura anche se non è
// ancora stato pagato. È la differenza con `aggregaUscitePerCategoria`, che somma
// solo il pagato: i due blocchi rispondono a domande diverse e i loro totali NON
// devono tornare uguali. Non "correggere" l'uno per farlo somigliare all'altro.

import { MESI_LABEL } from '@/lib/statistiche-commesse'

export type FamigliaCosto = 'fissi' | 'variabili' | 'tasse'

export type VoceCosto =
  | 'utenze' | 'finanziamenti' | 'stipendi'   // fissi
  | 'materiali' | 'altro'                      // variabili
  | 'tasse'                                    // a parte

export const FAMIGLIE: FamigliaCosto[] = ['fissi', 'variabili', 'tasse']

export const FAMIGLIA_LABEL: Record<FamigliaCosto, string> = {
  fissi: 'Costi fissi',
  variabili: 'Costi variabili',
  tasse: 'Tasse',
}

// Ordine di stampa nella tabella: le voci raggruppate per famiglia.
export const VOCI: VoceCosto[] = [
  'utenze', 'finanziamenti', 'stipendi', 'materiali', 'altro', 'tasse',
]

export const VOCE_LABEL: Record<VoceCosto, string> = {
  utenze: 'Utenze',
  finanziamenti: 'Finanziamenti',
  stipendi: 'Stipendi',
  materiali: 'Materiali e servizi',
  altro: 'Altre spese',
  tasse: 'Tasse e contributi',
}

export const FAMIGLIA_DI: Record<VoceCosto, FamigliaCosto> = {
  utenze: 'fissi',
  finanziamenti: 'fissi',
  stipendi: 'fissi',
  materiali: 'variabili',
  altro: 'variabili',
  tasse: 'tasse',
}

// Nomi estesi: servono all'avviso sui mesi senza stipendi, dove "luglio" si legge
// meglio di "Lug".
export const MESI_ESTESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]

// `CategoriaScadenza` (types/commessa.ts) → voce di spesa. Gli assegni sono i
// pagamenti ai fornitori di materiali e servizi, come in `CATEGORIA_USCITA`.
const VOCE_DI_CATEGORIA: Record<string, VoceCosto> = {
  utenza: 'utenze',
  finanziamento: 'finanziamenti',
  assegno: 'materiali',
  tassa: 'tasse',
  altro: 'altro',
}

/**
 * La voce di spesa di una scadenza. Una categoria non prevista non va persa:
 * finisce fra le altre spese, quindi fra i variabili.
 */
export function voceDiCategoria(categoria: string): VoceCosto {
  return VOCE_DI_CATEGORIA[categoria] ?? 'altro'
}

/** Una scadenza, ridotta ai campi che servono qui. */
export type ScadenzaCosto = {
  data_scadenza: string | null
  importo: number
  annullata: boolean
  categoria: string
}

/** Busta paga di un dipendente fisso. `periodo` è 'YYYY-MM-01': il mese di competenza. */
export type BustaCosto = { periodo: string; netto: number }

/**
 * Movimento di un "altro dipendente". `periodo` è la chiave canonica di
 * `lib/altri-dipendenti.ts`: primo del mese se la cadenza è mensile, lunedì della
 * settimana se è settimanale. In entrambi i casi il mese si legge alle posizioni
 * 5-6, e per la settimanale è quello che contiene il lunedì.
 */
export type MovimentoAltroCosto = { periodo: string; tipo: string; importo: number }

export type DatiCostiMensili = {
  scadenze: ScadenzaCosto[]
  buste: BustaCosto[]
  movimentiAltri: MovimentoAltroCosto[]
}

export type RigaMeseCosti = {
  mese: string // 'Gen', 'Feb', … — etichetta dell'asse X
  voci: Record<VoceCosto, number>
  fissi: number
  variabili: number
  tasse: number
  totale: number
}

export type TotaleFamiglia = {
  famiglia: FamigliaCosto
  label: string
  totale: number
  media: number       // totale / 12
  percentuale: number // sul totale dell'anno
}

export type ResocontoCosti = {
  mesi: RigaMeseCosti[]          // sempre 12
  famiglie: TotaleFamiglia[]     // sempre 3, nell'ordine di FAMIGLIE
  totaliVoce: Record<VoceCosto, number>
  totaleAnno: number
  mesiSenzaStipendi: number[]    // indici 0-11
  haCosti: boolean
}

/** Al centesimo: sommare decimali in virgola mobile lascia code tipo 90,459999. */
const euro = (n: number) => Math.round(n * 100) / 100

// Helper locali e non importati da `statistiche-commesse`, dove sono privati:
// sono quattro righe, e copiarle costa meno che allargare l'API di quel modulo.
function annoDi(data: string | null | undefined): string {
  if (!data || data.length < 4) return ''
  const y = data.slice(0, 4)
  return /^\d{4}$/.test(y) ? y : ''
}

function meseDi(data: string | null | undefined): number | null {
  if (!data || data.length < 7) return null
  const m = Number(data.slice(5, 7))
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m - 1 : null
}

const vociAZero = (): Record<VoceCosto, number> =>
  Object.fromEntries(VOCI.map((v) => [v, 0])) as Record<VoceCosto, number>

/**
 * I costi dell'anno, mese per mese, divisi nelle tre famiglie.
 *
 * `oggi` ('YYYY-MM-DD', calcolata sul server in fuso Europe/Rome) serve solo a
 * sapere quali mesi sono già trascorsi, per l'avviso sugli stipendi mancanti.
 */
export function aggregaCostiMensili(
  dati: DatiCostiMensili,
  anno: string,
  // Diventa `oggi` col Task 4, che è dove serve davvero. Il trattino basso lo
  // tiene fuori da no-unused-vars (argsIgnorePattern in eslint.config.mjs).
  _oggi: string,
): ResocontoCosti {
  const mesi: RigaMeseCosti[] = MESI_LABEL.map((mese) => ({
    mese, voci: vociAZero(), fissi: 0, variabili: 0, tasse: 0, totale: 0,
  }))

  const aggiungi = (m: number, voce: VoceCosto, importo: number) => {
    if (!Number.isFinite(importo)) return
    mesi[m].voci[voce] += importo
  }

  for (const s of dati.scadenze) {
    if (s.annullata) continue
    if (annoDi(s.data_scadenza) !== anno) continue
    const m = meseDi(s.data_scadenza)
    if (m === null) continue
    aggiungi(m, voceDiCategoria(s.categoria), Number(s.importo) || 0)
  }

  const totaliVoce = vociAZero()
  for (const riga of mesi) {
    for (const v of VOCI) {
      riga.voci[v] = euro(riga.voci[v])
      totaliVoce[v] = euro(totaliVoce[v] + riga.voci[v])
      riga[FAMIGLIA_DI[v]] += riga.voci[v]
    }
    riga.fissi = euro(riga.fissi)
    riga.variabili = euro(riga.variabili)
    riga.tasse = euro(riga.tasse)
    riga.totale = euro(riga.fissi + riga.variabili + riga.tasse)
  }

  const totaleAnno = euro(mesi.reduce((s, r) => s + r.totale, 0))

  const famiglie: TotaleFamiglia[] = FAMIGLIE.map((f) => {
    const totale = euro(mesi.reduce((s, r) => s + r[f], 0))
    return {
      famiglia: f,
      label: FAMIGLIA_LABEL[f],
      totale,
      media: euro(totale / 12),
      percentuale: totaleAnno > 0 ? (totale / totaleAnno) * 100 : 0,
    }
  })

  return {
    mesi,
    famiglie,
    totaliVoce,
    totaleAnno,
    mesiSenzaStipendi: [], // il calcolo vero arriva col Task 4
    haCosti: totaleAnno > 0,
  }
}
