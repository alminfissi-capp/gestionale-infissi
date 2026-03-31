import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// GIF 1×1 trasparente
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  // Segna email come aperta solo la prima volta
  const { error } = await supabase
    .from('preventivi')
    .update({ email_aperta_at: new Date().toISOString() })
    .eq('id', id)
    .is('email_aperta_at', null)

  if (error) {
    console.error('[track/email] update error:', error.message)
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type':  'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma:          'no-cache',
    },
  })
}
