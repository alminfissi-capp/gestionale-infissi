'use server'

import { revalidatePath } from 'next/cache'
import { getOrgId } from '@/lib/auth'
import { requireAccesso } from '@/lib/permessi'
import { createServiceClient } from '@/lib/supabase/service'
import { leggiSegreto } from '@/lib/integrazioni'
import { creaArchivioSupabase } from '@/lib/pagamenti/archivio-supabase'
import { parametriPagamenti } from '@/lib/pagamenti/dipendenze'
import { calcolaOpzioni, type EsitoRegole } from '@/lib/pagamenti/regole'
import { validaImpostazioni } from '@/lib/pagamenti/validazione'
import { IMPOSTAZIONI_PREDEFINITE, type ImpostazioniPreventivo, type Pagamento } from '@/lib/pagamenti/tipi'

export interface PannelloPagamento {
  impostazioni: ImpostazioniPreventivo
  pagamenti: Pagamento[]
  /** Cosa vedrebbe il cliente con queste impostazioni */
  anteprima: EsitoRegole
  stripeCollegato: boolean
  modalita: 'prova' | 'reale' | null
}

/** Preventivo della propria organizzazione, o errore: il service role non deve aprire preventivi altrui. */
async function preventivoMio(preventivoId: string) {
  const orgId = await getOrgId()
  const archivio = creaArchivioSupabase(createServiceClient())
  const p = await archivio.preventivoDaId(preventivoId)
  if (!p || p.organization_id !== orgId) throw new Error('Preventivo non trovato')
  return { orgId, archivio, p }
}

export async function getPannelloPagamento(preventivoId: string): Promise<PannelloPagamento> {
  await requireAccesso('preventivi')
  const { orgId, archivio, p } = await preventivoMio(preventivoId)
  const [salvate, pagamenti, chiave, { data: wh }] = await Promise.all([
    archivio.impostazioni(p.id),
    archivio.pagamenti(p.id),
    leggiSegreto(orgId, 'stripe', 'chiave_segreta'),
    createServiceClient().from('integrazioni').select('ultime4')
      .eq('organization_id', orgId).eq('servizio', 'stripe').eq('campo', 'id_webhook').maybeSingle(),
  ])
  const impostazioni = salvate ?? { ...IMPOSTAZIONI_PREDEFINITE, preventivo_id: p.id }
  return {
    impostazioni,
    pagamenti,
    anteprima: calcolaOpzioni({ preventivo: p, impostazioni, pagamenti, parametri: parametriPagamenti() }),
    stripeCollegato: !!chiave,
    modalita: wh?.ultime4 === 'reale' ? 'reale' : wh?.ultime4 === 'prova' ? 'prova' : null,
  }
}

export async function salvaImpostazioniPagamento(
  preventivoId: string,
  imp: Omit<ImpostazioniPreventivo, 'preventivo_id'>,
): Promise<{ errore?: string }> {
  await requireAccesso('preventivi', 'scrittura')
  const { orgId, archivio, p } = await preventivoMio(preventivoId)
  let valide: ImpostazioniPreventivo
  try {
    valide = validaImpostazioni(p.id, imp)
  } catch (e) {
    return { errore: e instanceof Error ? e.message : String(e) }
  }
  await archivio.salvaImpostazioni(valide, orgId)
  revalidatePath(`/preventivi/${p.id}`)
  return {}
}
