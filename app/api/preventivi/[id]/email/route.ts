import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { destinatario, oggetto, messaggio, pdfBase64, filename } = await req.json()

    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

    // Verifica che il preventivo appartenga all'org dell'utente
    const { data: prev } = await supabase
      .from('preventivi')
      .select('id, stato, numero')
      .eq('id', id)
      .single()

    if (!prev) return NextResponse.json({ error: 'Preventivo non trovato' }, { status: 404 })

    // Impostazioni azienda (per reply-to e firma)
    const { data: settings } = await supabase
      .from('settings')
      .select('denominazione, telefono, email, indirizzo')
      .maybeSingle()

    const azienda = settings?.denominazione || 'Azienda'

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
          <!-- Header -->
          <tr>
            <td style="background:#0E8F9C;padding:24px 32px;">
              <p style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">${azienda}</p>
            </td>
          </tr>
          <!-- Body -->
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
</body>
</html>`

    await resend.emails.send({
      from: 'Preventivi <onboarding@resend.dev>',
      to: destinatario,
      ...(settings?.email ? { replyTo: settings.email } : {}),
      subject: oggetto,
      html: emailHtml,
      attachments: [
        {
          filename: filename || 'preventivo.pdf',
          content: pdfBase64,
        },
      ],
    })

    // Aggiorna stato a 'inviato' se ancora in bozza
    if (prev.stato === 'bozza') {
      await supabase
        .from('preventivi')
        .update({ stato: 'inviato' })
        .eq('id', id)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[email/route] errore:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
