'use server'

import { revalidatePath } from 'next/cache'
import { getOrgId } from '@/lib/auth'
import { requireAccesso } from '@/lib/permessi'
import { createClient } from '@/lib/supabase/server'
import { cancellaSegreto, scriviSegreto } from '@/lib/integrazioni'
import type { CampoIntegrazione, ChiaveIntegrazione, Servizio } from '@/lib/integrazioni-nomi'

export type StatoIntegrazioni = Partial<Record<ChiaveIntegrazione, { ultime4: string; aggiornato_at: string }>>

/** Cosa e' salvato (mai il valore): per mostrare "Salvata · termina con …1234" */
export async function getStatoIntegrazioni(): Promise<StatoIntegrazioni> {
  await requireAccesso('impostazioni')
  const supabase = await createClient()
  const { data, error } = await supabase.from('integrazioni').select('servizio, campo, ultime4, aggiornato_at')
  if (error) throw new Error(error.message)
  const stato: StatoIntegrazioni = {}
  for (const r of data ?? []) stato[`${r.servizio}.${r.campo}` as ChiaveIntegrazione] = { ultime4: r.ultime4 ?? '', aggiornato_at: r.aggiornato_at }
  return stato
}

/** Scrive una chiave nel Vault (solo server). L'email non e' segreta: si ricorda intera. */
export async function salvaIntegrazione(servizio: Servizio, campo: CampoIntegrazione, valore: string): Promise<{ errore?: string }> {
  await requireAccesso('impostazioni', 'scrittura')
  const v = valore.trim()
  if (!v) return { errore: 'Valore vuoto' }
  if (v.length > 500) return { errore: 'Valore troppo lungo' }
  await scriviSegreto(await getOrgId(), servizio, campo, v)
  revalidatePath('/impostazioni')
  return {}
}

export async function eliminaIntegrazione(servizio: Servizio, campo: CampoIntegrazione): Promise<void> {
  await requireAccesso('impostazioni', 'scrittura')
  await cancellaSegreto(await getOrgId(), servizio, campo)
  revalidatePath('/impostazioni')
}
