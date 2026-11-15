// Archivio dei pagamenti sul database di WinStudio, col service role (solo server: webhook, checkout,
// pagine pubbliche e azioni gia' autorizzate). Dal modulo alm-pagamenti.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Archivio, NuovoPagamento } from './archivio'
import { CAMPI_IMPOSTAZIONI, normalizzaImpostazioni } from './normalizza'
import { rigaAcconto } from './riga-acconto'
import type { ImpostazioniPreventivo, Pagamento, Preventivo, StatoPagamento } from './tipi'

const CAMPI_PREVENTIVO = 'id, organization_id, numero, stato, firma_stato, totale_finale, cliente_snapshot, share_token'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const prev = (r: Record<string, unknown> | null): Preventivo | null =>
  r ? { ...(r as unknown as Preventivo), numero: String(r.numero ?? ''), totale_finale: Number(r.totale_finale ?? 0) } : null
const pag = (r: Record<string, unknown> | null): Pagamento | null => (r ? { ...(r as unknown as Pagamento), importo: Number(r.importo) } : null)

/**
 * `orgId`: se dato, ogni lettura e scrittura dei pagamenti resta in quell'organizzazione (webhook e checkout
 * sanno di quale organizzazione si tratta: un evento non puo' toccare pagamenti di un'altra).
 */
export function creaArchivioSupabase(db: SupabaseClient, orgId?: string): Archivio {
  // Filtro dell'organizzazione sulla query (tipo generico: i builder di PostgREST sono troppo profondi per i generici di TS).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inOrg = <Q,>(q: Q): Q => (orgId ? (q as any).eq('organization_id', orgId) : q)
  return {
    async preventivoDaToken(token) {
      if (!UUID.test(token)) return null
      const { data, error } = await inOrg(db.from('preventivi').select(CAMPI_PREVENTIVO).eq('share_token', token)).maybeSingle()
      if (error) throw error
      return prev(data)
    },
    async preventivoDaId(id) {
      const { data, error } = await inOrg(db.from('preventivi').select(CAMPI_PREVENTIVO).eq('id', id)).maybeSingle()
      if (error) throw error
      return prev(data)
    },
    async impostazioni(preventivoId) {
      const { data, error } = await inOrg(db.from('pagamenti_impostazioni_preventivo').select(CAMPI_IMPOSTAZIONI).eq('preventivo_id', preventivoId)).maybeSingle()
      if (error) throw error
      return normalizzaImpostazioni(data)
    },
    async salvaImpostazioni(imp: ImpostazioniPreventivo, organizationId: string) {
      const { data, error } = await db.from('pagamenti_impostazioni_preventivo')
        .upsert({ ...imp, organization_id: organizationId, updated_at: new Date().toISOString() }, { onConflict: 'preventivo_id' })
        .select(CAMPI_IMPOSTAZIONI).single()
      if (error) throw error
      return normalizzaImpostazioni(data)!
    },
    async pagamenti(preventivoId) {
      const { data, error } = await inOrg(db.from('pagamenti_online').select('*').eq('preventivo_id', preventivoId)).order('created_at')
      if (error) throw error
      return (data ?? []).map(r => pag(r)!)
    },
    async pagamentoDaSessione(sessionId) {
      const { data, error } = await inOrg(db.from('pagamenti_online').select('*').eq('stripe_session_id', sessionId)).maybeSingle()
      if (error) throw error
      return pag(data)
    },
    async pagamentoDaPaymentIntent(pi) {
      const { data, error } = await inOrg(db.from('pagamenti_online').select('*').eq('stripe_payment_intent', pi)).maybeSingle()
      if (error) throw error
      return pag(data)
    },
    async creaPagamento(n: NuovoPagamento) {
      const { data, error } = await db.from('pagamenti_online').insert(n).select('*').single()
      if (error) throw error
      return pag(data)!
    },
    async aggiornaStato(sessionId: string, daStati: StatoPagamento[], patch) {
      // Update condizionato e atomico: due webhook identici in parallelo ne aggiornano uno solo.
      const { data, error } = await inOrg(db.from('pagamenti_online').update({ ...patch, updated_at: new Date().toISOString() })
        .eq('stripe_session_id', sessionId)).in('stato', daStati).select('*').maybeSingle()
      if (error) throw error
      return pag(data)
    },
    async commessaDelPreventivo(preventivoId, organizationId) {
      // Solo commesse dell'organizzazione del preventivo: un collegamento verso un preventivo altrui non conta.
      const { data, error } = await db.from('preventivi_commessa').select('commessa_id, commesse!inner(organization_id, created_at)')
        .eq('preventivo_id', preventivoId).eq('organization_id', organizationId).eq('commesse.organization_id', organizationId)
        .order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (error) throw error
      if (data?.commessa_id) return data.commessa_id as string
      // Commesse vecchie: legame nella colonna commesse.preventivo_id (vale quando la tabella dei collegamenti e' vuota)
      const { data: vecchia } = await db.from('commesse').select('id').eq('preventivo_id', preventivoId)
        .eq('organization_id', organizationId).order('created_at', { ascending: true }).limit(1).maybeSingle()
      return (vecchia?.id as string | undefined) ?? null
    },
    async eliminaAccontoDaPagamento(p) {
      const { data, error } = await db.from('acconti_commessa').delete()
        .eq('pagamento_online_id', p.id).eq('organization_id', p.organization_id).select('id')
      // Errore = l'acconto e' gia' stato scritto come incasso su Fatture in Cloud (vincolo): resta, si toglie a mano.
      if (error) { console.error('[pagamenti] acconto del rimborso non tolto', p.id, error.message); return false }
      return (data ?? []).length > 0
    },
    async registraAccontoDaPagamento(p, commessaId, metodo) {
      const { data: pr } = await db.from('preventivi').select('numero').eq('id', p.preventivo_id).maybeSingle()
      const riga = rigaAcconto(p, commessaId, metodo, String(pr?.numero ?? ''), new Date().toISOString().slice(0, 10))
      // Un acconto per pagamento (vincolo unico): se c'e' gia', niente.
      const { data, error } = await db.from('acconti_commessa')
        .upsert(riga, { onConflict: 'pagamento_online_id', ignoreDuplicates: true }).select('id')
      if (error) throw error
      return (data?.[0]?.id as string | undefined) ?? null
    },
  }
}
