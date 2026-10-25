// Riepilogo dei costi di tutto il rilievo: somma delle voci calcolate (per la loro quantita')
// divisa come la formula di FP PRO: materiali per gruppo, lavoro per fase, spese generali,
// utile, provvigione, spese varie ed extra. Le aliquote e i costi orari vengono da ogni voce
// (calcolo.profilo); nei calcoli vecchi senza profilo lavoro e spese varie restano in un totale.
import type { CalcoloVoce, RigaMateriale } from './voce'
import type { OreVoce } from './tipi'

export type GruppoMateriale = RigaMateriale['gruppo']
export const GRUPPI_MATERIALE: GruppoMateriale[] = ['profili', 'accessori', 'vetri', 'pannelli']
export const FASI: (keyof OreVoce)[] = ['taglio', 'lavorazione', 'montaggio', 'assemblaggio', 'posa']
export const SPESE_VARIE = ['imballo', 'viaggio', 'materiali_vari', 'altro'] as const
export type SpesaVaria = (typeof SPESE_VARIE)[number]

export interface VoceDaRiepilogare {
  quantita: number
  larghezza: number
  altezza: number
  calcolo: CalcoloVoce
}

export interface RigaAggregata {
  codice: string
  descrizione: string
  unita: string
  quantita: number
  costo: number
}

export interface RiepilogoCosti {
  pezzi: number
  mq: number
  peso: number
  materiali: Record<GruppoMateriale, number>
  materialiTotale: number
  /** Righe sommate per codice, dalla piu' costosa */
  dettaglio: Record<GruppoMateriale, RigaAggregata[]>
  /** Minuti e costo per fase; null se qualche voce non ha i costi orari (calcolo vecchio) */
  fasi: Record<keyof OreVoce, { minuti: number; costo: number }> | null
  lavoroMinuti: number
  lavoro: number
  costoPuro: number
  speseGenerali: number
  costoIndustriale: number
  utile: number
  provvigione: number
  /** Spese varie una per una; null se qualche voce non ha le percentuali (calcolo vecchio) */
  speseVarie: Record<SpesaVaria, number> | null
  speseVarieTotale: number
  extra: number
  imponibile: number
}

const zeri = <K extends string>(chiavi: readonly K[]) => Object.fromEntries(chiavi.map(k => [k, 0])) as Record<K, number>

export function riepilogoCosti(voci: VoceDaRiepilogare[]): RiepilogoCosti {
  const materiali = zeri(GRUPPI_MATERIALE)
  const perCodice = new Map<string, RigaAggregata & { gruppo: GruppoMateriale }>()
  const fasi = Object.fromEntries(FASI.map(f => [f, { minuti: 0, costo: 0 }])) as Record<keyof OreVoce, { minuti: number; costo: number }>
  const spese = zeri(SPESE_VARIE)
  let fasiComplete = true
  let speseComplete = true
  const r = {
    pezzi: 0, mq: 0, peso: 0, lavoroMinuti: 0, lavoro: 0, costoPuro: 0, speseGenerali: 0, costoIndustriale: 0,
    utile: 0, provvigione: 0, speseVarieTotale: 0, extra: 0, imponibile: 0,
  }

  for (const v of voci) {
    const q = v.quantita > 0 ? v.quantita : 1
    const c = v.calcolo
    const p = c.prezzo
    r.pezzi += q
    r.mq += (v.larghezza * v.altezza / 1e6) * q
    r.peso += (c.peso ?? 0) * q
    for (const riga of c.righe) {
      materiali[riga.gruppo] += riga.costo * q
      const chiave = `${riga.gruppo}|${riga.codice}|${riga.unita}`
      const g = perCodice.get(chiave) ?? { gruppo: riga.gruppo, codice: riga.codice, descrizione: riga.descrizione, unita: riga.unita, quantita: 0, costo: 0 }
      g.quantita += riga.quantita * q
      g.costo += riga.costo * q
      perCodice.set(chiave, g)
    }
    const minuti = FASI.reduce((s, f) => s + c.ore[f] * 60, 0)
    r.lavoroMinuti += minuti * q
    r.lavoro += p.costoLavoro * q
    r.costoPuro += p.costoPuro * q
    r.speseGenerali += (p.costoIndustriale - p.costoPuro) * q
    r.costoIndustriale += p.costoIndustriale * q
    r.utile += p.utile * q
    r.provvigione += p.provvigione * q
    r.speseVarieTotale += p.speseVarie * q
    r.imponibile += p.imponibile * q
    const prima = p.costoIndustriale + p.utile + p.provvigione
    r.extra += (c.extraFissi ?? p.imponibile - prima - p.speseVarie) * q

    const pr = c.profilo
    if (!pr) { fasiComplete = false; speseComplete = false; continue }
    const costoOrario: Record<keyof OreVoce, number> = {
      taglio: pr.costo_taglio, lavorazione: pr.costo_lavorazione, montaggio: pr.costo_montaggio,
      assemblaggio: pr.costo_assemblaggio, posa: pr.costo_posa,
    }
    for (const f of FASI) {
      fasi[f].minuti += c.ore[f] * 60 * q
      fasi[f].costo += c.ore[f] * costoOrario[f] * q
    }
    // Ogni spesa varia e' la sua percentuale sullo stesso importo (prezzo con provvigione).
    for (const s of SPESE_VARIE) spese[s] += prima * pr[s] * q
  }

  const dettaglio = Object.fromEntries(GRUPPI_MATERIALE.map(g => [g, [] as RigaAggregata[]])) as Record<GruppoMateriale, RigaAggregata[]>
  for (const { gruppo, ...riga } of perCodice.values()) dettaglio[gruppo].push(riga)
  for (const g of GRUPPI_MATERIALE) dettaglio[g].sort((a, b) => b.costo - a.costo)

  return {
    ...r,
    materiali,
    materialiTotale: GRUPPI_MATERIALE.reduce((s, g) => s + materiali[g], 0),
    dettaglio,
    fasi: voci.length > 0 && fasiComplete ? fasi : null,
    speseVarie: voci.length > 0 && speseComplete ? spese : null,
  }
}
