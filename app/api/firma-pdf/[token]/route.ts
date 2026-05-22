import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const service = createServiceClient()

  const { data: prev } = await service
    .from('preventivi')
    .select('id')
    .eq('token_conferma', token)
    .single()

  if (!prev) return new NextResponse('Not found', { status: 404 })

  const tempPath = `firma-temp/${prev.id}/${token}.pdf`
  const { data: fileBlob, error } = await service.storage
    .from('commesse-docs')
    .download(tempPath)

  if (!fileBlob || error) {
    console.error('[firma-pdf] Download error:', error?.message, 'path:', tempPath)
    return new NextResponse('Not found', { status: 404 })
  }

  const buffer = Buffer.from(await fileBlob.arrayBuffer())
  console.log('[firma-pdf] Serving PDF for token:', token.slice(0, 8), 'size:', buffer.length)

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'no-store',
    },
  })
}
