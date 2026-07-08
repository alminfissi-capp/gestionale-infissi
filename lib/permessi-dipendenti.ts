import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'

/**
 * Dati sensibili (stipendi): verifica il permesso 'dipendenti' lato server.
 * Gli admin passano sempre; gli operatori devono avere lettura/scrittura.
 */
export async function assertAccessoDipendenti(scrittura = false) {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    const { data: perm } = await supabase
      .from('user_permissions')
      .select('accesso')
      .eq('user_id', user.id)
      .eq('modulo', 'dipendenti')
      .maybeSingle()
    const accesso = perm?.accesso ?? 'nessuno'
    if (accesso === 'nessuno' || (scrittura && accesso !== 'scrittura')) {
      throw new Error('Accesso non consentito al modulo Dipendenti')
    }
  }
  return { supabase, orgId }
}
