// I pagamenti online fatti prima che esistesse la commessa diventano suoi acconti quando la commessa
// viene collegata ai preventivi (setPreventiviCommessa). Un solo acconto per pagamento (vincolo unico).
import type { SupabaseClient } from '@supabase/supabase-js'
import { pagamentiDaRegistrare } from './attivita'
import { rigaAcconto } from './riga-acconto'
import type { Pagamento } from './tipi'

/** Restituisce quanti acconti ha aggiunto. Va chiamata dopo aver verificato che la commessa e' dell'utente. */
export async function registraPagamentiInCommessa(db: SupabaseClient, commessaId: string): Promise<number> {
  const { data: comm } = await db.from('commesse').select('organization_id').eq('id', commessaId).maybeSingle()
  const orgId = comm?.organization_id as string | undefined
  if (!orgId) return 0
  // Solo pagamenti dell'organizzazione della commessa: un preventivo altrui collegato per errore non porta niente.
  const { data: link, error } = await db.from('preventivi_commessa').select('preventivo_id').eq('commessa_id', commessaId).eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  const preventivi = [...new Set((link ?? []).map(l => l.preventivo_id as string | null).filter((x): x is string => !!x))]
  if (preventivi.length === 0) return 0

  const { data: pag, error: e2 } = await db.from('pagamenti_online').select('*').in('preventivo_id', preventivi).eq('organization_id', orgId).eq('stato', 'pagato')
  if (e2) throw new Error(e2.message)
  const pagamenti = (pag ?? []) as Pagamento[]
  if (pagamenti.length === 0) return 0
  const { data: esistenti } = await db.from('acconti_commessa').select('pagamento_online_id').in('pagamento_online_id', pagamenti.map(p => p.id))
  const daFare = new Set(pagamentiDaRegistrare(pagamenti, new Set((esistenti ?? []).map(a => a.pagamento_online_id as string))))

  const { data: numeri } = await db.from('preventivi').select('id, numero').in('id', preventivi)
  const numero = new Map((numeri ?? []).map(n => [n.id as string, String(n.numero ?? '')]))
  let aggiunti = 0
  for (const p of pagamenti.filter(x => daFare.has(x.id))) {
    const data = (p.pagato_at ?? p.created_at).slice(0, 10)
    const riga = rigaAcconto({ ...p, importo: Number(p.importo) }, commessaId, p.metodo, numero.get(p.preventivo_id) ?? '', data)
    const { data: ins, error: e3 } = await db.from('acconti_commessa')
      .upsert(riga, { onConflict: 'pagamento_online_id', ignoreDuplicates: true }).select('id')
    if (e3) throw new Error(e3.message)
    const id = ins?.[0]?.id as string | undefined
    if (id) {
      await db.from('pagamenti_online').update({ acconto_commessa_id: id, updated_at: new Date().toISOString() }).eq('id', p.id)
      aggiunti++
    }
  }
  return aggiunti
}
