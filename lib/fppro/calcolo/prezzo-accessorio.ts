// Prezzo di un accessorio come FP PRO. I colori accessori della voce sono un ELENCO in ordine
// di preferenza (in FP PRO: FP_FITTINGSCOLOR, es. AV poi NO): vale il primo trattamento
// (fp_accessori_costi) che l'accessorio ha; se non ne ha nessuno dell'elenco, il prezzo
// generale (fp_accessori). Verificato sui prezzi della commessa 170-26G: ACP 8022 al prezzo AV,
// ACP 8020M (niente AV) al prezzo NO, ACP 8028 (ne' AV ne' NO) al prezzo generale.
// Se anche il prezzo generale e' 0: il trattamento piu' alto con un avviso (meglio un
// preventivo alto che uno sotto costo), senza avviso se costano tutti uguale.
export interface RigaAccessorio { fp_id: number; codice: string; serie: string | null; prezzo: number | null; unita_vendita: number | null }
export interface CostoAccessorio { accessorio_fp_id: number; colore_fp_id: number; prezzo: number | null; unita_vendita: number | null }

const n = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? 0 : Number(v))

export function prezzoAccessorio(
  righe: RigaAccessorio[],
  costi: CostoAccessorio[],
  serie: string,
  coloriAcc: number[],
  /** Nomi dei colori dell'elenco, per l'avviso */
  nomiColori: string[] = [],
): { prezzo: number; unitaVendita: number; avviso: string | null } | null {
  if (righe.length === 0) return null
  const costiDi = (id: number) => costi.filter(c => c.accessorio_fp_id === id && n(c.prezzo) > 0)
  const a = righe.find(x => x.serie === serie)
    ?? righe.find(x => costiDi(x.fp_id).length > 0)
    ?? righe.find(x => n(x.prezzo) > 0)
    ?? righe[0]
  const trattamenti = costiDi(a.fp_id)
  const unita = (u: number | null) => n(u) || n(a.unita_vendita) || 1
  const generale = { prezzo: n(a.prezzo), unitaVendita: n(a.unita_vendita) || 1, avviso: null }
  if (trattamenti.length === 0) return generale

  for (const colore of coloriAcc) {
    const t = trattamenti.find(c => c.colore_fp_id === colore)
    if (t) return { prezzo: n(t.prezzo), unitaVendita: unita(t.unita_vendita), avviso: null }
  }
  if (generale.prezzo > 0) return generale

  const unitari = trattamenti.map(c => n(c.prezzo) / unita(c.unita_vendita))
  const max = trattamenti[unitari.indexOf(Math.max(...unitari))]
  const tuttiUguali = unitari.every(u => Math.abs(u - unitari[0]) < 1e-9)
  const avviso = tuttiUguali
    ? null
    : coloriAcc.length === 0
      ? `Accessorio ${a.codice}: prezzo diverso per colore, scegli il colore accessori (usato il piu' alto)`
      : `Accessorio ${a.codice}: non esiste in ${nomiColori.length ? nomiColori.join(', ') : 'nessuno dei colori accessori scelti'}, aggiungi un altro colore accessori (usato il piu' alto)`
  return { prezzo: n(max.prezzo), unitaVendita: unita(max.unita_vendita), avviso }
}
