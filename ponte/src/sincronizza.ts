// Copia FP PRO -> Supabase. Prima legge e controlla TUTTE le tabelle, poi scrive:
// se una tabella e' vuota o ha cambiato colonne non si tocca niente.
// Si scrivono solo le righe nuove o cambiate (impronta), per non gonfiare il database.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { TABELLE_SYNC, aBlocchi, confrontaRighe, impronta, verificaSorgente } from '../../lib/fppro/sync-tabelle.ts'
import type { Riga, RigaEsistente, RigaFp, TabellaSync } from '../../lib/fppro/sync-tabelle.ts'
import { log } from './log.ts'

const BLOCCO = 500
// Non oltre il "Max rows" di PostgREST (1000), altrimenti le pagine tornano troncate.
const PAGINA = 1000

async function leggiEsistenti(supabase: SupabaseClient, tabella: string, orgId: string): Promise<RigaEsistente[]> {
  const righe: RigaEsistente[] = []
  for (let da = 0; ; da += PAGINA) {
    const { data, error } = await supabase
      .from(tabella).select('fp_id, impronta, presente')
      .eq('organization_id', orgId).order('fp_id').range(da, da + PAGINA - 1)
    if (error) throw new Error(`${tabella}: ${error.message}`)
    righe.push(...(data as RigaEsistente[]))
    if (data.length < PAGINA) return righe
  }
}

export async function sincronizza(
  db: Pool,
  supabase: SupabaseClient,
  orgId: string,
): Promise<Record<string, number>> {
  const lette: { t: TabellaSync; righe: RigaFp[] }[] = []
  for (const t of TABELLE_SYNC) {
    const [colonne] = await db.query<RowDataPacket[]>(
      'select column_name as c from information_schema.columns where table_schema = database() and table_name = ?',
      [t.mysql],
    )
    const [righe] = await db.query<RowDataPacket[]>(t.sql)
    const errore = verificaSorgente(t, righe as Riga[], colonne.map(r => String(r.c)))
    if (errore) throw new Error(errore)
    lette.push({ t, righe: (righe as Riga[]).map(t.mappa) })
    log(`Letta ${t.mysql}: ${righe.length} righe`)
  }

  const esito: Record<string, number> = {}
  for (const { t, righe } of lette) {
    const ora = new Date().toISOString()
    const { daScrivere, daSegnareAssenti } = confrontaRighe(righe, await leggiEsistenti(supabase, t.supabase, orgId))
    for (const blocco of aBlocchi(daScrivere, BLOCCO)) {
      const { error } = await supabase.from(t.supabase).upsert(
        blocco.map(r => ({ ...r, impronta: impronta(r), organization_id: orgId, presente: true, sincronizzato_at: ora })),
        { onConflict: 'organization_id,fp_id' },
      )
      if (error) throw new Error(`${t.supabase}: ${error.message}`)
    }
    // Non si cancella: rilievi e preventivi potrebbero puntare a queste righe.
    for (const ids of aBlocchi(daSegnareAssenti, BLOCCO)) {
      const { error } = await supabase
        .from(t.supabase).update({ presente: false, sincronizzato_at: ora })
        .eq('organization_id', orgId).in('fp_id', ids)
      if (error) throw new Error(`${t.supabase}: ${error.message}`)
    }
    esito[t.supabase] = righe.length
    log(`${t.supabase}: ${righe.length} righe in FP PRO, ${daScrivere.length} scritte, ${daSegnareAssenti.length} non piu' presenti`)
  }
  return esito
}
