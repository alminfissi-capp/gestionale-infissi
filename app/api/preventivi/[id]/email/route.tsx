import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { getLogoSignedUrl } from '@/actions/impostazioni'
import PreventivoPdf from '@/lib/pdf/preventivoPdf'
import type { PreventivoCompleto } from '@/types/preventivo'
import type { Settings } from '@/types/impostazioni'

const resend = new Resend(process.env.RESEND_API_KEY)

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { destinatario, oggetto, messaggio } = await req.json()

    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

    // Fetch preventivo + articoli + settings in parallelo
    const [{ data: prev }, { data: articoli }, { data: settingsRaw }] = await Promise.all([
      supabase.from('preventivi').select('*').eq('id', id).single(),
      supabase.from('articoli_preventivo').select('*').eq('preventivo_id', id).order('ordine'),
      supabase.from('settings').select('*').maybeSingle(),
    ])

    if (!prev) return NextResponse.json({ error: 'Preventivo non trovato' }, { status: 404 })

    const settings  = settingsRaw as Settings | null
    const logoUrl   = settings?.logo_url ? await getLogoSignedUrl(settings.logo_url) : null

    const preventivo: PreventivoCompleto = {
      ...prev,
      articoli:                 articoli ?? [],
      cataloghi_allegati_data:  [],
      allegati_calcoli_data:    [],
    }

    // ── Genera PDF server-side ──
    const pdfBuffer = await renderToBuffer(
      <PreventivoPdf preventivo={preventivo} settings={settings} logoUrl={logoUrl} />
    )
    const filename = prev.numero ? `preventivo-${prev.numero}.pdf` : 'preventivo.pdf'

    // ── Email HTML + pixel tracking ──
    const azienda     = settings?.denominazione || 'Azienda'
    const fromEmail   = settings?.email || 'onboarding@resend.dev'
    const trackingUrl = `${BASE_URL}/api/track/email/${id}`

    const emailHtml = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#0E8F9C;padding:24px 32px;">
              <p style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">${azienda}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:#374151;font-size:15px;line-height:1.6;">
              ${messaggio.replace(/\n/g, '<br>')}
              <p style="margin-top:24px;padding-top:24px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">
                ${azienda}${settings?.indirizzo ? `<br>${settings.indirizzo}` : ''}${settings?.telefono ? `<br>Tel: ${settings.telefono}` : ''}${settings?.email ? `<br>${settings.email}` : ''}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  <img src="${trackingUrl}" width="1" height="1" style="display:none;" alt="" />
</body>
</html>`

    await resend.emails.send({
      from:    `${azienda} <${fromEmail}>`,
      to:      destinatario,
      subject: oggetto,
      html:    emailHtml,
      attachments: [{ filename, content: pdfBuffer.toString('base64') }],
    })

    // Aggiorna stato a 'inviato' se ancora bozza
    if (prev.stato === 'bozza') {
      await supabase.from('preventivi').update({ stato: 'inviato' }).eq('id', id)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[email/route] errore:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
