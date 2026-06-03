import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'

export const maxDuration = 300

const MAX_ITEMS = 10

function parsePrezzo(v: unknown): number | null {
  if (v == null) return null
  const n = parseFloat(String(v).replace(/[€\s]/g, '').replace(',', '.'))
  return isNaN(n) ? null : n
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { items } = await request.json() as {
    items: { codice: string; reparto?: number | null }[]
  }
  const limited = items.slice(0, MAX_ITEMS)

  const orgId      = await getOrgId()
  const backendUrl = process.env.ESP_BACKEND_URL ?? 'http://localhost:3001'
  const espApiKey  = process.env.ESP_API_SECRET

  // Aggiorna lo stato di una riga della coda (sorgente di verità condivisa)
  const setQueue = async (codice: string, status: string, prezzo: number | null = null) => {
    await supabase
      .from('catalogo_sync_queue')
      .update({ status, prezzo, updated_at: new Date().toISOString() })
      .eq('organization_id', orgId)
      .eq('codice', codice)
  }

  // Segna subito gli articoli del batch come "processing"
  await supabase
    .from('catalogo_sync_queue')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('organization_id', orgId)
    .in('codice', limited.map(i => i.codice))

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      for (const { codice, reparto } of limited) {
        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          if (espApiKey) headers['Authorization'] = `Bearer ${espApiKey}`

          const params = new URLSearchParams({ q: codice })
          if (reparto != null) params.set('reparto', String(reparto))

          const res = await fetch(`${backendUrl}/api/item?${params}`, {
            headers,
            signal: AbortSignal.timeout(90000),
            next: { revalidate: 0 },
          })

          if (res.status === 404) { await setQueue(codice, 'not_found'); send({ codice, status: 'not_found' }); continue }
          if (!res.ok)            { await setQueue(codice, 'error');     send({ codice, status: 'error' }); continue }

          const json = await res.json()

          const priceRow = {
            organization_id: orgId,
            codice,
            prezzo:         parsePrezzo(json.prezzo),
            disponibile_al: Boolean(json.disponibile_al),
            disponibile_ct: Boolean(json.disponibile_ct),
            qty_al:         Number(json.qty_al ?? 0),
            qty_ct:         Number(json.qty_ct ?? 0),
          }

          await supabase
            .from('catalogo_prezzi')
            .upsert(priceRow, { onConflict: 'organization_id,codice' })

          const campi: Record<string, unknown> = {}
          if (json.descrizione) campi.descrizione  = json.descrizione
          if (json.immagine_url) campi.immagine_url = json.immagine_url
          if (json.um)           campi.um           = json.um
          // totale = costo reale per 1 unità di magazzino (barra intera, accessorio, ecc.)
          // json.totale è il campo nuovo del backend; json.prezzo come fallback per vecchie versioni
          const prezzoAcquisto = parsePrezzo(json.totale ?? json.prezzo)
          if (prezzoAcquisto != null) campi.prezzo_acquisto = prezzoAcquisto

          if (Object.keys(campi).length > 0) {
            const service = createServiceClient()
            await service
              .from('catalogo_articoli')
              .update({ ...campi, updated_at: new Date().toISOString() })
              .eq('organization_id', orgId)
              .eq('codice', codice)
          }

          const finalStatus = priceRow.prezzo != null ? 'done' : 'no_price'
          await setQueue(codice, finalStatus, priceRow.prezzo)

          send({
            status:       finalStatus,
            fetched_at:   new Date().toISOString(),
            da_cache:     false,
            descrizione:  json.descrizione  ?? null,
            um:           json.um           ?? null,
            ...priceRow,
          })
        } catch (err: unknown) {
          const isTimeout = err instanceof Error &&
            (err.name === 'TimeoutError' || err.name === 'AbortError')
          const st = isTimeout ? 'timeout' : 'error'
          await setQueue(codice, st)
          send({ codice, status: st })
        }
      }

      send({ status: 'done' })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
