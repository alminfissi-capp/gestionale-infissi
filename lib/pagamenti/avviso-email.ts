// Email "Pagamento online ricevuto" all'azienda. Un errore non deve far fallire il webhook: solo log.
import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/service'
import { euro } from './formato'
import { nomeMetodo } from './metodo'
import type { Pagamento } from './tipi'

export async function inviaAvvisoPagamento(p: Pagamento): Promise<void> {
  try {
    if (!process.env.RESEND_API_KEY) return
    const service = createServiceClient()
    const [{ data: s }, { data: pr }] = await Promise.all([
      service.from('settings').select('email, denominazione').eq('organization_id', p.organization_id).maybeSingle(),
      service.from('preventivi').select('numero, cliente_snapshot').eq('id', p.preventivo_id).maybeSingle(),
    ])
    if (!s?.email) return
    const c = (pr?.cliente_snapshot ?? {}) as { nome?: string; cognome?: string; ragione_sociale?: string }
    const cliente = c.ragione_sociale || [c.nome, c.cognome].filter(Boolean).join(' ') || 'Cliente'
    const link = `${(process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')}/preventivi/${p.preventivo_id}`
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: `${s.denominazione ?? 'WinStudio'} <${s.email}>`,
      to: s.email,
      subject: `Pagamento online ricevuto – preventivo ${pr?.numero ?? ''}`,
      text: `${cliente} ha pagato online ${euro(Number(p.importo))} (${p.tipo}, ${nomeMetodo(p.metodo)}) per il preventivo ${pr?.numero ?? ''}.\n\n` +
        `La commessa non cambia stato da sola: portala tu a "da iniziare" quando vuoi.\n\n${link}`,
    })
  } catch (e) {
    console.error('[pagamenti] email di avviso non inviata', p.id, e)
  }
}
