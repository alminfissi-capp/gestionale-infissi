'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { getSettings, getLogoSignedUrl } from '@/actions/impostazioni'
import type { RigaPreventivo } from '@/lib/resoconto'
import type { Settings } from '@/types/impostazioni'
import type {
  ResocontoCommessa,
  ResocontoCommessaInput,
  DatiPrecompilazione,
} from '@/types/resoconto'
import type { ClienteSnapshot } from '@/types/preventivo'

export async function getResocontoCommessa(
  commessaId: string
): Promise<ResocontoCommessa | null> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data, error } = await supabase
    .from('resoconti_commessa')
    .select('*')
    .eq('commessa_id', commessaId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (error || !data) return null

  return {
    ...data,
    righe_preventivi: Array.isArray(data.righe_preventivi) ? data.righe_preventivi : [],
    righe_fatture: Array.isArray(data.righe_fatture) ? data.righe_fatture : [],
  }
}

export async function saveResocontoCommessa(
  commessaId: string,
  input: ResocontoCommessaInput
): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error } = await supabase.from('resoconti_commessa').upsert(
    {
      ...input,
      commessa_id: commessaId,
      organization_id: orgId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'commessa_id' }
  )

  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

export async function deleteResocontoCommessa(commessaId: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error } = await supabase
    .from('resoconti_commessa')
    .delete()
    .eq('commessa_id', commessaId)
    .eq('organization_id', orgId)

  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

/** Indirizzo completo del cliente dallo snapshot del preventivo. */
function indirizzoDaSnapshot(snap: ClienteSnapshot | null): string | null {
  if (!snap) return null

  const via = [snap.via, snap.civico].filter(Boolean).join(' ')
  const citta = [snap.cap, snap.citta].filter(Boolean).join(' ')
  const provincia = snap.provincia ? `(${snap.provincia})` : ''
  const completo = [via, citta, provincia].filter(Boolean).join(' ').trim()

  return completo || snap.indirizzo || null
}

/**
 * Precompilazione del form: i preventivi collegati alla commessa e i dati del
 * cliente presi dallo snapshot del primo preventivo del gestionale.
 *
 * I preventivi allegati solo come PDF esterno entrano comunque, con il solo
 * numero e importi a zero: le righe si completano a mano nel form.
 */
export async function getDatiPrecompilazione(
  commessaId: string
): Promise<DatiPrecompilazione> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data: collegati } = await supabase
    .from('preventivi_commessa')
    .select('preventivo_id, numero_preventivo, ordine')
    .eq('commessa_id', commessaId)
    .eq('organization_id', orgId)
    .order('ordine', { ascending: true })

  const righe: RigaPreventivo[] = []
  let clienteIndirizzo: string | null = null
  let clientePiva: string | null = null
  let cantiere: string | null = null

  const ids = (collegati ?? []).map((c) => c.preventivo_id).filter(Boolean) as string[]
  const dettagli = new Map<
    string,
    { numero: string | null; totale_finale: number; iva_totale: number; created_at: string; cliente_snapshot: ClienteSnapshot | null }
  >()

  if (ids.length > 0) {
    const { data: preventivi } = await supabase
      .from('preventivi')
      .select('id, numero, totale_finale, iva_totale, created_at, cliente_snapshot')
      .in('id', ids)
      .eq('organization_id', orgId)

    for (const p of preventivi ?? []) {
      dettagli.set(p.id, {
        numero: p.numero,
        totale_finale: Number(p.totale_finale),
        iva_totale: Number(p.iva_totale),
        created_at: p.created_at,
        cliente_snapshot: p.cliente_snapshot,
      })
    }
  }

  for (const c of collegati ?? []) {
    const d = c.preventivo_id ? dettagli.get(c.preventivo_id) : undefined

    if (d) {
      righe.push({
        numero: d.numero ?? c.numero_preventivo ?? '',
        data: d.created_at.slice(0, 10),
        oggetto: '',
        imponibile: Math.round((d.totale_finale - d.iva_totale) * 100) / 100,
        iva: d.iva_totale,
        totale: d.totale_finale,
      })

      if (!clienteIndirizzo) clienteIndirizzo = indirizzoDaSnapshot(d.cliente_snapshot)
      if (!clientePiva) clientePiva = d.cliente_snapshot?.cf_piva ?? null
      if (!cantiere) cantiere = d.cliente_snapshot?.cantiere ?? null
    } else {
      // Preventivo allegato solo come PDF: si conosce il numero, non gli importi.
      righe.push({
        numero: c.numero_preventivo ?? '',
        data: null,
        oggetto: '',
        imponibile: 0,
        iva: 0,
        totale: 0,
      })
    }
  }

  return { preventivi: righe, clienteIndirizzo, clientePiva, cantiere }
}

/** Logo e dati aziendali per l'intestazione del PDF. */
export async function getIntestazioneAzienda(): Promise<{
  settings: Settings | null
  logoUrl: string | null
}> {
  const settings = await getSettings()
  const logoUrl = settings?.logo_url ? await getLogoSignedUrl(settings.logo_url) : null
  return { settings, logoUrl }
}
