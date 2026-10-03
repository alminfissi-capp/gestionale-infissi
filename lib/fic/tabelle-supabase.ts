import type { SupabaseClient } from '@supabase/supabase-js'
import type { TabelleFatture } from '@/lib/fic/salvataggio'

/** Righe per chiamata: tiene corti URL (`in(...)`) e corpi delle richieste. */
const LOTTO_DB = 200

function blocchi<T>(xs: T[], n: number): T[][] {
  return Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))
}

/**
 * Le scritture di `salvaDocumenti` sulle tabelle Supabase (service role).
 * Usata dalla sincronizzazione e dall'aggiornamento immediato dopo un pagamento.
 */
export function tabelleSupabase(svc: SupabaseClient): TabelleFatture {
  return {
    async upsertFatture(righe) {
      const { data, error } = await svc
        .from('fatture_fornitori')
        .upsert(righe, { onConflict: 'organization_id,fic_id' })
        .select('id, fic_id')
      if (error) throw new Error(error.message)
      return (data ?? []).map((r) => ({ id: r.id as string, fic_id: Number(r.fic_id) }))
    },
    async eliminaRate(fatturaIds) {
      for (const blocco of blocchi(fatturaIds, LOTTO_DB)) {
        const { error } = await svc.from('fatture_fornitori_rate').delete().in('fattura_id', blocco)
        if (error) throw new Error(error.message)
      }
    },
    async inserisciRate(righe) {
      for (const blocco of blocchi(righe, LOTTO_DB)) {
        const { error } = await svc.from('fatture_fornitori_rate').insert(blocco)
        if (error) throw new Error(error.message)
      }
    },
  }
}
