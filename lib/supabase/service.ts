import { createClient } from '@supabase/supabase-js'

/** Client Supabase con service role — solo server-side, bypassa RLS */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
