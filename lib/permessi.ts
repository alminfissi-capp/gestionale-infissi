import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { ModuloApp, TipoAccesso, PermessiUtente } from '@/types/permessi'
import { MODULI_APP, PERMESSI_VUOTI, PERMESSI_ADMIN } from '@/types/permessi'

/** Carica i permessi dell'utente corrente — memoizzato per request con React cache() */
export const getMyPermissions = cache(async (): Promise<{
  isAdmin: boolean
  permessi: PermessiUtente
}> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { isAdmin: false, permessi: { ...PERMESSI_VUOTI } }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') {
    return { isAdmin: true, permessi: { ...PERMESSI_ADMIN } }
  }

  const { data: permsData } = await supabase
    .from('user_permissions')
    .select('modulo, accesso')
    .eq('user_id', user.id)

  const permessi: PermessiUtente = { ...PERMESSI_VUOTI }
  for (const p of permsData ?? []) {
    if (MODULI_APP.includes(p.modulo as ModuloApp)) {
      permessi[p.modulo as ModuloApp] = p.accesso as TipoAccesso
    }
  }

  return { isAdmin: false, permessi }
})

/**
 * Verifica che l'utente abbia almeno il livello richiesto per il modulo.
 * Se non lo ha, redirige alla dashboard.
 */
export async function requireAccesso(
  modulo: ModuloApp,
  min: TipoAccesso = 'lettura'
): Promise<void> {
  const { permessi } = await getMyPermissions()
  const livello = permessi[modulo]
  const ok = min === 'lettura' ? livello !== 'nessuno' : livello === 'scrittura'
  if (!ok) redirect('/')
}
