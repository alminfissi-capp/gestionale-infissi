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

export function creaArchivioSupabase(db: SupabaseClient): Archivio {
  return {
    async preventivoDaToken(token) {
      if (!UUID.test(token)) return null
      const { data, error } = await db.from('preventivi').select(CAMPI_PREVENTIVO).eq('share_token', token).maybeSingle()
      if (error) throw error
      return prev(data)
    },
    async preventivoDaId(id) {
      const { data, error } = await db.from('preventivi').select(CAMPI_PREVENTIVO).eq('id', id).maybeSingle()
      if (error) throw error
      return prev(data)
    },
    async impostazioni(preventivoId) {
      const { data, error } = await db.from('pagamenti_impostazioni_preventivo').select(CAMPI_IMPOSTAZIONI).eq('preventivo_id', preventivoId).maybeSingle()
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
      const { data, error } = await db.from('pagamenti_online').select('*').eq('preventivo_id', preventivoId).order('created_at')
      if (error) throw error
      return (data ?? []).map(r => pag(r)!)
    },
    async pagamentoDaSessione(sessionId) {
      const { data, error } = await db.from('pagamenti_online').select('*').eq('stripe_session_id', sessionId).maybeSingle()
      if (error) throw error
      return pag(data)
    },
    async pagamentoDaPaymentIntent(pi) {
      const { data, error } = await db.from('pagamenti_online').select('*').eq('stripe_payment_intent', pi).maybeSingle()
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
      const { data, error } = await db.from('pagamenti_online').update({ ...patch, updated_at: new Date().toISOString() })
        .eq('stripe_session_id', sessionId).in('stato', daStati).select('*').maybeSingle()
      if (error) throw error
      return pag(data)
    },
    async commessaDelPreventivo(preventivoId) {
      const { data, error } = await db.from('preventivi_commessa').select('commessa_id').eq('preventivo_id', preventivoId).limit(1).maybeSingle()
      if (error) throw error
      return (data?.commessa_id as string | undefined) ?? null
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
