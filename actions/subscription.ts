'use server'

import { createClient } from '@/lib/supabase/server'
import type { OrgSubscription, Role } from '@/types/subscription'

async function getOrgId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()
  if (!profile) throw new Error('Profilo non trovato')
  return profile.organization_id
}

/** Restituisce piano e stato abbonamento dell'organizzazione corrente */
export async function getOrgSubscription(): Promise<OrgSubscription> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data, error } = await supabase
    .from('organizations')
    .select('plan, subscription_status, trial_ends_at, stripe_customer_id, stripe_subscription_id')
    .eq('id', orgId)
    .single()

  if (error || !data) {
    // Fallback sicuro: trial attivo
    return {
      plan: 'trial',
      subscription_status: 'trialing',
      trial_ends_at: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
    }
  }

  return data as OrgSubscription
}

/** Restituisce ruolo e info dell'utente corrente */
export async function getCurrentUserRole(): Promise<{ role: Role; full_name: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const { data } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  return {
    role: (data?.role ?? 'operator') as Role,
    full_name: data?.full_name ?? null,
  }
}

