import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Restituisce l'organization_id dell'utente corrente.
 * Wrappato con React cache() per deduplicare le query DB
 * all'interno della stessa request server-side.
 */
export const getOrgId = cache(async (): Promise<string> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (!profile?.organization_id) throw new Error('Organizzazione non trovata')
  return profile.organization_id
})
