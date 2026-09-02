import { normalizzaTesto } from '@/lib/ricerca-clienti'

/**
 * Quel poco che serve per cercare una commessa. Volutamente più stretto di
 * `Commessa`: la funzione è pura e va chiamabile anche da un test con tre righe
 * scritte a mano.
 */
export type CommessaRicercabile = {
  numero_commessa: string | null
  cliente_nome: string
  numeri_preventivo: string[]
}

/**
 * Filtra le commesse su numero commessa, nome cliente e numeri dei preventivi
 * collegati.
 *
 * Stessa regola di `lib/ricerca-clienti.ts`, e per lo stesso motivo: la query si
 * spezza in parole e **ogni parola** deve trovare riscontro in almeno un campo,
 * in qualunque ordine. Confrontare la query intera contro un singolo campo
 * fallirebbe su "guarracino 251", che è esattamente come si cerca a mente:
 * un pezzo di cliente e un pezzo di numero.
 */
export function filtraCommesse<T extends CommessaRicercabile>(
  commesse: T[],
  query: string,
): T[] {
  const parole = normalizzaTesto(query).split(' ').filter(Boolean)
  if (parole.length === 0) return commesse

  return commesse.filter((c) => {
    const campi = [
      normalizzaTesto(c.numero_commessa),
      normalizzaTesto(c.cliente_nome),
      ...c.numeri_preventivo.map((n) => normalizzaTesto(n)),
    ].filter(Boolean)
    return parole.every((p) => campi.some((campo) => campo.includes(p)))
  })
}
