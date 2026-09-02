import type { CommessaCompleta, PreventivoPerCommessa } from '@/types/commessa'

/** Sotto questa soglia in euro la differenza è arrotondamento, non disallineamento. */
export const TOLLERANZA_ALLINEAMENTO = 0.01

export type MotivoNonConfrontabile =
  | 'nessun_preventivo'
  | 'preventivi_manuali'
  | 'preventivo_mancante'

export type StatoAllineamento =
  | { tipo: 'allineata' }
  | { tipo: 'non_confrontabile'; motivo: MotivoNonConfrontabile }
  | {
      tipo: 'disallineata'
      totaleCommessa: number
      totalePreventivi: number
      ivaPreventivi: number
      differenza: number // totalePreventivi − totaleCommessa
    }

/**
 * I preventivi collegati a una commessa. La junction `preventivi_commessa` è la
 * sorgente di verità; la vecchia colonna `commessa.preventivo_id` vale solo per le
 * commesse create prima che la junction esistesse.
 */
export function preventiviCollegati(
  commessa: Pick<CommessaCompleta, 'preventivo_id' | 'preventivi_collegati'>
): { interni: string[]; manuali: number } {
  const collegati = commessa.preventivi_collegati ?? []
  if (collegati.length === 0) {
    return { interni: commessa.preventivo_id ? [commessa.preventivo_id] : [], manuali: 0 }
  }
  return {
    interni: collegati
      .map((pc) => pc.preventivo_id)
      .filter((id): id is string => !!id),
    manuali: collegati.filter((pc) => !pc.preventivo_id).length,
  }
}

/**
 * Il totale di una commessa è una fotografia scattata alla conversione: modificare
 * il preventivo non la aggiorna, di proposito (imponibile e IVA sulla commessa sono
 * campi che l'utente compila a mano). Questa funzione dice se la fotografia è ancora
 * fedele. Quando il valore di anche un solo preventivo collegato non è conoscibile,
 * risponde `non_confrontabile`: meglio nessun avviso che un avviso falso.
 */
export function statoAllineamento(
  commessa: CommessaCompleta,
  preventiviById: Map<string, PreventivoPerCommessa>
): StatoAllineamento {
  // Le vendite e-commerce/eBay non nascono da un preventivo. Non arrivano nemmeno
  // a TabellaCommesse, che filtra anonima = false: il controllo è difensivo.
  if (commessa.anonima) return { tipo: 'non_confrontabile', motivo: 'nessun_preventivo' }

  const { interni, manuali } = preventiviCollegati(commessa)
  if (interni.length === 0 && manuali === 0) {
    return { tipo: 'non_confrontabile', motivo: 'nessun_preventivo' }
  }
  // Un PDF caricato a mano non ha un importo che il sistema possa leggere.
  if (manuali > 0) return { tipo: 'non_confrontabile', motivo: 'preventivi_manuali' }
  if (interni.some((id) => !preventiviById.has(id))) {
    return { tipo: 'non_confrontabile', motivo: 'preventivo_mancante' }
  }

  let totalePreventivi = 0
  let ivaPreventivi = 0
  for (const id of interni) {
    const p = preventiviById.get(id)!
    totalePreventivi += p.totale
    ivaPreventivi += p.iva_totale
  }

  const differenza = totalePreventivi - commessa.totale
  if (Math.abs(differenza) <= TOLLERANZA_ALLINEAMENTO) return { tipo: 'allineata' }

  return {
    tipo: 'disallineata',
    totaleCommessa: commessa.totale,
    totalePreventivi,
    ivaPreventivi,
    differenza,
  }
}
