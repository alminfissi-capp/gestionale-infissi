// Situazione dei pagamenti per il cliente, calcolata sul server dal token del link (service role).
import { createServiceClient } from '@/lib/supabase/service'
import { leggiSegreto } from '@/lib/integrazioni'
import { creaArchivioSupabase } from './archivio-supabase'
import { parametriPagamenti } from './dipendenze'
import { calcolaOpzioni } from './regole'
import { situazioneDaEsito, type SituazionePubblica } from './situazione-pubblica'

/** null = preventivo inesistente. Senza Stripe collegato il pagamento online risulta non attivo. */
export async function caricaSituazionePubblica(shareToken: string): Promise<SituazionePubblica | null> {
  const service = createServiceClient()
  const archivio = creaArchivioSupabase(service)
  const p = await archivio.preventivoDaToken(shareToken)
  if (!p) return null
  const [impostazioni, pagamenti, chiave, { data: s }] = await Promise.all([
    archivio.impostazioni(p.id),
    archivio.pagamenti(p.id),
    leggiSegreto(p.organization_id, 'stripe', 'chiave_segreta'),
    service.from('settings').select('iban, denominazione').eq('organization_id', p.organization_id).maybeSingle(),
  ])
  const esito = calcolaOpzioni({ preventivo: p, impostazioni: chiave ? impostazioni : null, pagamenti, parametri: parametriPagamenti() })
  return situazioneDaEsito(p, esito, pagamenti, s?.iban ? { iban: String(s.iban), intestatario: String(s.denominazione ?? '') } : null)
}
