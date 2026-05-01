'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import type { ModuloApp, TipoAccesso, PermessiUtente, UtenteConPermessi } from '@/types/permessi'
import { MODULI_APP, PERMESSI_VUOTI } from '@/types/permessi'

async function assertAdmin(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') throw new Error('Accesso negato')
  return user.id
}

async function assertTargetInSameOrg(service: ReturnType<typeof createServiceClient>, orgId: string, userId: string): Promise<void> {
  const { data } = await service.from('profiles').select('id').eq('id', userId).eq('organization_id', orgId).maybeSingle()
  if (!data) throw new Error('Utente non trovato')
}

export async function getUtenti(): Promise<UtenteConPermessi[]> {
  await assertAdmin()
  const orgId = await getOrgId()
  const service = createServiceClient()

  const { data: profiles, error } = await service
    .from('profiles')
    .select('id, full_name, role, email, disabled, operatore')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  if (!profiles || profiles.length === 0) return []

  const { data: allPermessi } = await service
    .from('user_permissions')
    .select('user_id, modulo, accesso')
    .eq('organization_id', orgId)

  // Recupera email dagli utenti auth se non è in profiles
  const needsEmail = profiles.filter((p) => !p.email)
  const emailMap = new Map<string, string>()
  await Promise.all(
    needsEmail.map(async (p) => {
      const { data: { user } } = await service.auth.admin.getUserById(p.id)
      if (user?.email) emailMap.set(p.id, user.email)
    })
  )

  return profiles.map((p) => {
    const permMap: PermessiUtente = { ...PERMESSI_VUOTI }
    for (const perm of allPermessi ?? []) {
      if (perm.user_id === p.id && MODULI_APP.includes(perm.modulo as ModuloApp)) {
        permMap[perm.modulo as ModuloApp] = perm.accesso as TipoAccesso
      }
    }
    return {
      id: p.id,
      email: p.email ?? emailMap.get(p.id) ?? '',
      full_name: p.full_name,
      role: p.role as 'admin' | 'operator',
      disabled: p.disabled ?? false,
      operatore: p.operatore ?? null,
      permessi: permMap,
    }
  })
}

export async function createUtente(
  email: string,
  password: string,
  fullName: string
): Promise<{ error?: string }> {
  await assertAdmin()
  const orgId = await getOrgId()
  const service = createServiceClient()

  const { data: { user }, error: authErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authErr || !user) return { error: authErr?.message ?? 'Errore creazione utente' }

  const { error: profErr } = await service.from('profiles').insert({
    id: user.id,
    organization_id: orgId,
    full_name: fullName.trim() || null,
    email,
    role: 'operator',
    disabled: false,
  })

  if (profErr) {
    await service.auth.admin.deleteUser(user.id)
    return { error: profErr.message }
  }

  revalidatePath('/impostazioni/utenti')
  return {}
}

export async function deleteUtente(userId: string): Promise<{ error?: string }> {
  const adminId = await assertAdmin()
  if (userId === adminId) return { error: 'Non puoi eliminare il tuo account' }

  const orgId = await getOrgId()
  const service = createServiceClient()
  try { await assertTargetInSameOrg(service, orgId, userId) } catch { return { error: 'Utente non trovato' } }

  const { error } = await service.auth.admin.deleteUser(userId)
  if (error) return { error: error.message }

  revalidatePath('/impostazioni/utenti')
  return {}
}

export async function updatePasswordUtente(
  userId: string,
  newPassword: string
): Promise<{ error?: string }> {
  await assertAdmin()
  const orgId = await getOrgId()
  if (newPassword.length < 6) return { error: 'La password deve essere almeno 6 caratteri' }

  const service = createServiceClient()
  try { await assertTargetInSameOrg(service, orgId, userId) } catch { return { error: 'Utente non trovato' } }

  const { error } = await service.auth.admin.updateUserById(userId, { password: newPassword })
  if (error) return { error: error.message }
  return {}
}

export async function toggleDisableUtente(
  userId: string,
  disable: boolean
): Promise<{ error?: string }> {
  const adminId = await assertAdmin()
  if (userId === adminId) return { error: 'Non puoi disabilitare il tuo account' }

  const orgId = await getOrgId()
  const service = createServiceClient()
  try { await assertTargetInSameOrg(service, orgId, userId) } catch { return { error: 'Utente non trovato' } }

  // Ban/unban in Supabase Auth (impedisce il login)
  const { error: authErr } = await service.auth.admin.updateUserById(userId, {
    ban_duration: disable ? '87600h' : 'none',
  })
  if (authErr) return { error: authErr.message }

  // Salva lo stato nella tabella profiles per mostrarlo nella UI
  const { error: profErr } = await service
    .from('profiles')
    .update({ disabled: disable })
    .eq('id', userId)
  if (profErr) return { error: profErr.message }

  revalidatePath('/impostazioni/utenti')
  return {}
}

export async function updateOperatoreUtente(
  userId: string,
  operatore: string | null
): Promise<{ error?: string }> {
  await assertAdmin()
  const orgId = await getOrgId()
  const service = createServiceClient()
  try { await assertTargetInSameOrg(service, orgId, userId) } catch { return { error: 'Utente non trovato' } }

  const valore = operatore ? operatore.trim().toUpperCase().charAt(0) : null
  const { error } = await service
    .from('profiles')
    .update({ operatore: valore })
    .eq('id', userId)

  if (error) return { error: error.message }
  revalidatePath('/impostazioni/utenti')
  return {}
}

export async function updatePermessiUtente(
  userId: string,
  permessi: Partial<Record<ModuloApp, TipoAccesso>>
): Promise<{ error?: string }> {
  await assertAdmin()
  const orgId = await getOrgId()
  const service = createServiceClient()

  const rows = Object.entries(permessi).map(([modulo, accesso]) => ({
    organization_id: orgId,
    user_id: userId,
    modulo,
    accesso,
  }))

  const { error } = await service
    .from('user_permissions')
    .upsert(rows, { onConflict: 'organization_id,user_id,modulo' })

  if (error) return { error: error.message }
  return {}
}
