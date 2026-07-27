import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'
import { getSettings } from '@/actions/impostazioni'
import { formattaNumeroOrdine } from '@/lib/produzione'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: Request) {
  try {
    const { ordineId } = (await request.json()) as { ordineId: string }
    const supabase = await createClient()
    const orgId = await getOrgId()

    const { data: ordine } = await supabase
      .from('ordini_fornitore')
      .select('id, numero_ordine, pdf_path, fornitore_id, commessa_id')
      .eq('id', ordineId)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (!ordine) return NextResponse.json({ error: 'Ordine non trovato' }, { status: 404 })
    if (!ordine.pdf_path) {
      return NextResponse.json({ error: 'Genera prima il PDF dell\'ordine' }, { status: 400 })
    }
    if (!ordine.fornitore_id) {
      return NextResponse.json({ error: 'Ordine senza fornitore' }, { status: 400 })
    }

    const { data: fornitore } = await supabase
      .from('fornitori')
      .select('nome, email')
      .eq('id', ordine.fornitore_id)
      .maybeSingle()

    if (!fornitore?.email) {
      return NextResponse.json({ error: 'Il fornitore non ha un indirizzo email' }, { status: 400 })
    }

    const service = createServiceClient()
    const { data: file, error: downloadError } = await service.storage
      .from('commesse-docs')
      .download(ordine.pdf_path)
    if (downloadError || !file) {
      return NextResponse.json({ error: 'PDF non recuperabile' }, { status: 500 })
    }

    const settings = await getSettings()
    const azienda = settings?.denominazione || 'Azienda'
    const fromEmail = settings?.email || 'onboarding@resend.dev'

    const numeroOrdine = formattaNumeroOrdine(ordine.numero_ordine)

    const { error: sendError } = await resend.emails.send({
      from: `${azienda} <${fromEmail}>`,
      to: fornitore.email,
      subject: `Ordine ${numeroOrdine}`,
      text: `Buongiorno,\n\nin allegato l'ordine ${numeroOrdine}.\n\nCordiali saluti\n${azienda}`,
      attachments: [
        {
          filename: `${numeroOrdine || `ORD ${ordine.id.slice(0, 8)}`}.pdf`,
          content: Buffer.from(await file.arrayBuffer()),
        },
      ],
    })
    if (sendError) {
      return NextResponse.json({ error: sendError.message }, { status: 500 })
    }

    await supabase
      .from('ordini_fornitore')
      .update({
        inviato_at: new Date().toISOString(),
        stato: 'ordinato',
        updated_at: new Date().toISOString(),
      })
      .eq('id', ordineId)
      .eq('organization_id', orgId)

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore invio' },
      { status: 500 }
    )
  }
}
