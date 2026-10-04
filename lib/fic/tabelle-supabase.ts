import type { SupabaseClient } from '@supabase/supabase-js'
import type { RigaBase, TabelleFatture } from '@/lib/fic/salvataggio'
import type { RigaFattura } from '@/lib/fic/mappa'

export type NomiTabelle = { fatture: string; rate: string }
export const TABELLE_FORNITORI: NomiTabelle = { fatture: 'fatture_fornitori', rate: 'fatture_fornitori_rate' }
export const TABELLE_EMESSE: NomiTabelle = { fatture: 'fatture_emesse', rate: 'fatture_emesse_rate' }

/** Righe per chiamata: tiene corti URL (`in(...)`) e corpi delle richieste. */
const LOTTO_DB = 200

function blocchi<T>(xs: T[], n: number): T[][] {
  return Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))
}

/**
 * Le scritture di `salvaDocumenti` sulle tabelle Supabase (service role), fornitori o emesse.
 * Usata dalla sincronizzazione e dall'aggiornamento immediato dopo un pagamento.
 */
export function tabelleSupabase<F extends RigaBase = RigaFattura>(
  svc: SupabaseClient,
  nomi: NomiTabelle = TABELLE_FORNITORI,
): TabelleFatture<F> {
  return {
    async upsertFatture(righe) {
      const { data, error } = await svc
        .from(nomi.fatture)
        .upsert(righe, { onConflict: 'organization_id,fic_id' })
        .select('id, fic_id')
      if (error) throw new Error(error.message)
      return (data ?? []).map((r) => ({ id: r.id as string, fic_id: Number(r.fic_id) }))
    },
    async eliminaRate(fatturaIds) {
      for (const blocco of blocchi(fatturaIds, LOTTO_DB)) {
        const { error } = await svc.from(nomi.rate).delete().in('fattura_id', blocco)
        if (error) throw new Error(error.message)
      }
    },
    async inserisciRate(righe) {
      for (const blocco of blocchi(righe, LOTTO_DB)) {
        const { error } = await svc.from(nomi.rate).insert(blocco)
        if (error) throw new Error(error.message)
      }
    },
  }
}
