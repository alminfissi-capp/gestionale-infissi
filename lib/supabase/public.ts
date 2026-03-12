import { createClient } from '@supabase/supabase-js'

/** Client Supabase senza autenticazione — usato per le pagine pubbliche */
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
