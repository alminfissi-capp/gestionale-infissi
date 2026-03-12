'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function generaShareToken(preventivoId: string): Promise<string> {
  const supabase = await createClient()
  const token = crypto.randomUUID()
  const { error } = await supabase
    .from('preventivi')
    .update({
      share_token: token,
      condiviso_at: new Date().toISOString(),
      visualizzato_at: null,
    })
    .eq('id', preventivoId)

  if (error) throw new Error(error.message)
  revalidatePath(`/preventivi/${preventivoId}`)
  revalidatePath('/preventivi')
  return token
}

export async function revokaShareToken(preventivoId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('preventivi')
    .update({ share_token: null, condiviso_at: null, visualizzato_at: null })
    .eq('id', preventivoId)

  if (error) throw new Error(error.message)
  revalidatePath(`/preventivi/${preventivoId}`)
  revalidatePath('/preventivi')
}
