// Prezzo di un accessorio come FP PRO: se ha prezzi per trattamento (fp_accessori_costi)
// vale quello del colore accessori della voce; il prezzo generale (fp_accessori) solo se
// di trattamenti non ce ne sono. Senza colore scelto: prezzo comune se tutti uguali,
// altrimenti il piu' alto con un avviso (meglio un preventivo alto che uno sotto costo).
export interface RigaAccessorio { fp_id: number; codice: string; serie: string | null; prezzo: number | null; unita_vendita: number | null }
export interface CostoAccessorio { accessorio_fp_id: number; colore_fp_id: number; prezzo: number | null; unita_vendita: number | null }

const n = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? 0 : Number(v))

export function prezzoAccessorio(
  righe: RigaAccessorio[], costi: CostoAccessorio[], serie: string, coloreAcc: number | null,
): { prezzo: number; unitaVendita: number; avviso: string | null } | null {
  if (righe.length === 0) return null
  const costiDi = (id: number) => costi.filter(c => c.accessorio_fp_id === id && n(c.prezzo) > 0)
  const a = righe.find(x => x.serie === serie)
    ?? righe.find(x => costiDi(x.fp_id).length > 0)
    ?? righe.find(x => n(x.prezzo) > 0)
    ?? righe[0]
  const trattamenti = costiDi(a.fp_id)
  const unita = (u: number | null) => n(u) || n(a.unita_vendita) || 1
  if (trattamenti.length === 0) return { prezzo: n(a.prezzo), unitaVendita: n(a.unita_vendita) || 1, avviso: null }
  const scelto = coloreAcc === null ? undefined : trattamenti.find(c => c.colore_fp_id === coloreAcc)
  if (scelto) return { prezzo: n(scelto.prezzo), unitaVendita: unita(scelto.unita_vendita), avviso: null }
  const unitari = trattamenti.map(c => n(c.prezzo) / unita(c.unita_vendita))
  const max = trattamenti[unitari.indexOf(Math.max(...unitari))]
  const tuttiUguali = unitari.every(u => Math.abs(u - unitari[0]) < 1e-9)
  return {
    prezzo: n(max.prezzo),
    unitaVendita: unita(max.unita_vendita),
    avviso: tuttiUguali ? null : `Accessorio ${a.codice}: prezzo diverso per colore, scegli il colore accessori (usato il piu' alto)`,
  }
}
