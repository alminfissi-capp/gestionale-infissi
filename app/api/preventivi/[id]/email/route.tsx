import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { renderToBuffer } from '@react-pdf/renderer'
import sharp from 'sharp'
import { createClient } from '@/lib/supabase/server'
import { getLogoSignedUrl } from '@/actions/impostazioni'
import PreventivoPdf from '@/lib/pdf/preventivoPdf'
import type { PreventivoCompleto } from '@/types/preventivo'
import type { Settings } from '@/types/impostazioni'

const resend = new Resend(process.env.RESEND_API_KEY)

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

/** Scarica un'immagine da URL e la restituisce come data URL base64 (JPEG/PNG).
 *  I formati non supportati da @react-pdf (es. WebP) vengono convertiti in JPEG via sharp. */
const SUPPORTED_IMG = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const ct = (res.headers.get('content-type') || 'image/png').split(';')[0].trim()
    const buf = Buffer.from(await res.arrayBuffer())
    if (SUPPORTED_IMG.includes(ct)) {
      return `data:${ct};base64,${buf.toString('base64')}`
    }
    // Converti formati non supportati (WebP, AVIF, ecc.) in JPEG
    const jpegBuf = await sharp(buf).jpeg({ quality: 85 }).toBuffer()
    return `data:image/jpeg;base64,${jpegBuf.toString('base64')}`
  } catch {
    return null
  }
}

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

    const settings = settingsRaw as Settings | null

    // Converti logo in base64 (i signed URL Supabase non hanno estensione riconoscibile)
    const rawLogoUrl = settings?.logo_url ? await getLogoSignedUrl(settings.logo_url) : null
    const logoData   = rawLogoUrl ? await toDataUrl(rawLogoUrl) : null

    // Converti immagini articoli in base64
    const articoliConImg = await Promise.all(
      (articoli ?? []).map(async (a) => {
        if (!a.immagine_url) return a
        const imgData = await toDataUrl(a.immagine_url)
        return { ...a, immagine_url: imgData }
      })
    )

    const preventivo: PreventivoCompleto = {
      ...prev,
      articoli:                articoliConImg,
      cataloghi_allegati_data: [],
      allegati_calcoli_data:   [],
    }

    // ── Genera PDF server-side ──
    const pdfBuffer = await renderToBuffer(
      <PreventivoPdf preventivo={preventivo} settings={settings} logoUrl={logoData} />
    )
    const filename = prev.numero ? `preventivo-${prev.numero}.pdf` : 'preventivo.pdf'

    // ── Share token: usa quello esistente o ne genera uno nuovo ──
    const azienda   = settings?.denominazione || 'Azienda'
    const fromEmail = settings?.email || 'onboarding@resend.dev'

    let shareToken = prev.share_token
    if (!shareToken) {
      shareToken = crypto.randomUUID()
      await supabase
        .from('preventivi')
        .update({ share_token: shareToken, condiviso_at: new Date().toISOString(), visualizzato_at: null, visualizzato_via: null })
        .eq('id', id)
    }
    const viewUrl = `${BASE_URL}/p/${shareToken}?ref=email`

    // ── Email HTML con link "Visualizza online" ──
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
              <p style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">${esc(azienda)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:#374151;font-size:15px;line-height:1.6;">
              ${esc(messaggio).replace(/\n/g, '<br>')}
              <p style="margin-top:24px;">
                <a href="${viewUrl}" style="display:inline-block;background:#0E8F9C;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:bold;">Visualizza preventivo online</a>
              </p>
              <p style="margin-top:24px;padding-top:24px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">
                ${esc(azienda)}${settings?.indirizzo ? `<br>${esc(settings.indirizzo)}` : ''}${settings?.telefono ? `<br>Tel: ${esc(settings.telefono)}` : ''}${settings?.email ? `<br>${esc(settings.email)}` : ''}
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
      from:    `${azienda} <${fromEmail}>`,
      to:      destinatario,
      subject: oggetto,
      html:    emailHtml,
      attachments: [{ filename, content: pdfBuffer.toString('base64') }],
    })

    // Aggiorna stato a 'inviato' se era in bozza
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
