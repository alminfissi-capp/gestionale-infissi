/**
 * Ordinamento dei blocchi della pagina statistiche.
 *
 * L'ordine salvato e' una lista di identificativi. Tenerla separata dall'elenco
 * dei blocchi esistenti fa si' che le due cose possano cambiare indipendentemente:
 * si aggiunge un blocco senza invalidare gli ordini gia' salvati, e si toglie un
 * blocco senza lasciare buchi.
 */

/**
 * Applica l'ordine salvato all'elenco dei blocchi esistenti.
 *
 * Chi non compare nell'ordine salvato si accoda (e' un blocco aggiunto dopo);
 * chi compare nell'ordine ma non esiste piu' viene scartato.
 */
export function applicaOrdine(tutti: readonly string[], salvato: string[] | undefined): string[] {
  if (!salvato || salvato.length === 0) return [...tutti]
  const esistenti = new Set(tutti)
  const noti = salvato.filter((id) => esistenti.has(id))
  const gia = new Set(noti)
  return [...noti, ...tutti.filter((id) => !gia.has(id))]
}

/** Sposta un blocco di una posizione. Restituisce un array nuovo. */
export function spostaBlocco(ordine: readonly string[], id: string, verso: 'su' | 'giu'): string[] {
  const i = ordine.indexOf(id)
  if (i === -1) return [...ordine]
  const j = verso === 'su' ? i - 1 : i + 1
  if (j < 0 || j >= ordine.length) return [...ordine]
  const out = [...ordine]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}
