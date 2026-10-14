import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { eseguiGiro, type TipoGiro } from '@/lib/fic/giro-sincronizzazione'

// Il giro di sincronizzazione ha un budget di 240 s: deve stare sotto questo limite.
export const maxDuration = 300

/**
 * Giro automatico orario della sincronizzazione fatture con FiC, chiamato da
 * pg_cron (migrazione 20261014100000). Fuori dal login: si autentica col segreto
 * del Vault nell'header x-cron-secret. Sincronizza solo le organizzazioni che
 * hanno acceso l'interruttore della scheda.
 */
export async function POST(request: NextRequest) {
  const svc = createServiceClient()
  const segreto = request.headers.get('x-cron-secret') ?? ''
  const { data: valido } = segreto
    ? await svc.rpc('cron_sync_fatture_valido', { p_segreto: segreto })
    : { data: false }
  if (!valido) return new Response('Unauthorized', { status: 401 })

  const tipo: TipoGiro = request.nextUrl.searchParams.get('tipo') === 'emesse' ? 'emesse' : 'fornitori'
  const { data: orgs, error } = await svc
    .from('fic_collegamenti')
    .select('organization_id')
    .eq(tipo === 'emesse' ? 'emesse_sync_automatica' : 'sync_automatica', true)
    .eq('stato', 'attivo')
  if (error) return Response.json({ errore: error.message }, { status: 500 })

  const esiti = []
  for (const { organization_id } of orgs ?? []) {
    const r = await eseguiGiro(svc, organization_id as string, tipo)
    esiti.push({ organization_id, esito: r.esito, messaggio: r.messaggio })
  }
  if (esiti.length) revalidatePath('/fatture-fornitori')
  return Response.json({ tipo, esiti })
}
