// Formula di prezzo di FP PRO (verificata al centesimo su 170-26G e 172-26G).
import type { CorrezioniVoce, OreVoce, ProfiloCalcolo } from './tipi'

export interface PrezzoVoce {
  costoLavoro: number
  costoPuro: number
  costoIndustriale: number
  utile: number
  provvigione: number
  speseVarie: number
  imponibile: number
}

export function prezzoComeFp(materiali: number, ore: OreVoce, p: ProfiloCalcolo, extraFissi: number): PrezzoVoce {
  const costoLavoro =
    ore.taglio * p.costo_taglio + ore.lavorazione * p.costo_lavorazione + ore.montaggio * p.costo_montaggio +
    ore.assemblaggio * p.costo_assemblaggio + ore.posa * p.costo_posa
  const costoPuro = materiali + costoLavoro
  const costoIndustriale = costoPuro * (1 + p.spese_generali)
  const utile = costoIndustriale * p.utile
  const a = costoIndustriale + utile
  // La provvigione e' una percentuale del prezzo di vendita, non del costo.
  const b = p.provvigione < 1 ? a / (1 - p.provvigione) : a
  const speseVarie = b * (p.imballo + p.viaggio + p.materiali_vari + p.altro)
  return { costoLavoro, costoPuro, costoIndustriale, utile, provvigione: b - a, speseVarie, imponibile: b + speseVarie + extraFissi }
}

export function applicaCorrezioni(p: ProfiloCalcolo, ore: OreVoce, c: CorrezioniVoce | undefined) {
  return {
    profilo: { ...p, ...(c?.percentuali ?? {}) },
    ore: { ...ore, ...(c?.ore ?? {}) },
    extraFissi: (c?.extra ?? []).reduce((s, e) => s + (Number.isFinite(e.importo) ? e.importo : 0), 0),
  }
}
