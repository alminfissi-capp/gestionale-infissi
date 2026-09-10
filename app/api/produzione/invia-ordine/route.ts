import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'
import { getSettings } from '@/actions/impostazioni'
import { formattaNumeroOrdine } from '@/lib/produzione'
import { registraEvento } from '@/lib/produzione-tracking-db'

const resend = new Resend(process.env.RESEND_API_KEY)

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

type Db = Awaited<ReturnType<typeof createClient>>

/**
 * Registra sull'ordine il motivo del fallimento e risponde all'admin.
 * L'errore resta scritto finché un invio riuscito non lo azzera: così il
 * motivo (tipicamente "email mancante") sopravvive al ricaricamento della
 * pagina, invece di sparire con il toast.
 */
async function fallisci(
  supabase: Db, ordineId: string, orgId: string, motivo: string, status: number
) {
  const { error } = await supabase
    .from('ordini_fornitore')
    .update({ errore_invio: motivo, errore_invio_at: new Date().toISOString() })
    .eq('id', ordineId)
    .eq('organization_id', orgId)
  if (error) console.error('[invia-ordine] errore_invio non registrato:', error.message)
  return NextResponse.json({ error: motivo }, { status })
}

export async function POST(request: Request) {
  try {
    const { ordineId } = (await request.json()) as { ordineId: string }
    const supabase = await createClient()
    const orgId = await getOrgId()

    const { data: ordine } = await supabase
      .from('ordini_fornitore')
      .select('id, numero_ordine, pdf_path, pdf_inviato_path, tracking_token, fornitore_id, commessa_id')
      .eq('id', ordineId)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (!ordine) return NextResponse.json({ error: 'Ordine non trovato' }, { status: 404 })
    if (!ordine.pdf_path) {
      return await fallisci(supabase, ordineId, orgId, 'PDF dell\'ordine non ancora generato', 400)
    }
    if (!ordine.fornitore_id) {
      return await fallisci(supabase, ordineId, orgId, 'Ordine senza fornitore', 400)
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) {
      return await fallisci(
        supabase, ordineId, orgId,
        'NEXT_PUBLIC_APP_URL non configurato: il link per il fornitore non sarebbe raggiungibile',
        500
      )
    }

    const { data: fornitore } = await supabase
      .from('fornitori')
      .select('nome, email')
      .eq('id', ordine.fornitore_id)
      .maybeSingle()

    if (!fornitore?.email) {
      const nome = fornitore?.nome ? ` (${fornitore.nome})` : ''
      return await fallisci(
        supabase, ordineId, orgId,
        `email mancante: il fornitore${nome} non ha un indirizzo email in anagrafica`,
        400
      )
    }

    const service = createServiceClient()
    const { data: file, error: downloadError } = await service.storage
      .from('commesse-docs')
      .download(ordine.pdf_path)
    if (downloadError || !file) {
      return await fallisci(supabase, ordineId, orgId, 'PDF non recuperabile dall\'archivio', 500)
    }

    // Copia congelata servita al fornitore: path distinto da quello gestito da
    // salvaPdfOrdine, che alla prossima Anteprima rimuoverebbe il file.
    const snapshotPath = `${orgId}/ordini/${ordineId}/inviato-${Date.now()}.pdf`
    const { error: snapshotError } = await service.storage
      .from('commesse-docs')
      .upload(snapshotPath, Buffer.from(await file.arrayBuffer()), {
        contentType: 'application/pdf',
      })
    if (snapshotError) {
      return await fallisci(
        supabase, ordineId, orgId,
        `copia per il fornitore non creata: ${snapshotError.message}`, 500
      )
    }

    const token = ordine.tracking_token ?? randomUUID()
    const linkOrdine = `${appUrl}/o/${token}`
    const pixel = `${appUrl}/api/track/ordine/${token}`

    const settings = await getSettings()
    const azienda = settings?.denominazione || 'Azienda'
    const fromEmail = settings?.email || 'onboarding@resend.dev'
    const numeroOrdine = formattaNumeroOrdine(ordine.numero_ordine)

    const aziendaHtml = escapeHtml(azienda)
    const numeroHtml = escapeHtml(numeroOrdine)

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;line-height:1.5">
  <p>Buongiorno,</p>
  <p>di seguito l'ordine <strong>${numeroHtml}</strong>.</p>
  <p style="margin:24px 0">
    <a href="${linkOrdine}" style="background:#0E8F9C;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block">Visualizza l'ordine</a>
  </p>
  <p style="font-size:12px;color:#6b7280">Se il pulsante non funziona, copiate questo indirizzo nel browser:<br>${linkOrdine}</p>
  <p>Cordiali saluti<br>${aziendaHtml}</p>
  <img src="${pixel}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">
</div>`

    const text = `Buongiorno,\n\ndi seguito l'ordine ${numeroOrdine}:\n${linkOrdine}\n\nCordiali saluti\n${azienda}`

    let sendError: { message: string } | null = null
    try {
      const result = await resend.emails.send({
        from: `${azienda} <${fromEmail}>`,
        to: fornitore.email,
        subject: `Ordine ${numeroOrdine}`,
        html,
        text,
      })
      sendError = result.error
    } catch (e) {
      // L'SDK ha lanciato invece di restituire { error }: lo snapshot va rimosso comunque.
      await service.storage.from('commesse-docs').remove([snapshotPath])
      return await fallisci(
        supabase, ordineId, orgId,
        e instanceof Error ? e.message : 'errore invio email', 500
      )
    }
    if (sendError) {
      // L'email non è partita: lo snapshot appena caricato non serve.
      await service.storage.from('commesse-docs').remove([snapshotPath])
      return await fallisci(supabase, ordineId, orgId, sendError.message, 500)
    }

    const { error: updateError } = await supabase
      .from('ordini_fornitore')
      .update({
        inviato_at: new Date().toISOString(),
        tracking_token: token,
        pdf_inviato_path: snapshotPath,
        stato: 'ordinato',
        updated_at: new Date().toISOString(),
        // L'invio è riuscito: l'avviso di fallimento precedente non ha più ragione di esserci
        errore_invio: null,
        errore_invio_at: null,
      })
      .eq('id', ordineId)
      .eq('organization_id', orgId)

    if (updateError) {
      // L'email è già partita: non mentire all'admin dicendo che tutto è andato bene,
      // e non toccare il vecchio snapshot perché il DB continua a puntare a quello.
      console.error('[invia-ordine] update ordine:', updateError.message)
      return NextResponse.json(
        { error: 'Email inviata, ma il tracking non è stato registrato: ' + updateError.message },
        { status: 500 }
      )
    }

    await registraEvento(ordineId, orgId, 'inviato', {
      destinatario: fornitore.email,
      pdfPath: snapshotPath,
    })

    // Le copie congelate degli invii precedenti NON vengono rimosse, di proposito:
    // ogni evento 'inviato' nel registro deve continuare a puntare al documento
    // che è stato davvero consegnato quel giorno. Il path porta già un timestamp,
    // quindi i vari snapshot non collidono mai tra loro. Da questa modifica in poi,
    // ogni evento 'inviato' porta anche il proprio pdf_path: la copia congelata
    // resta ricollegabile all'invio esatto che l'ha prodotta, anche dopo un reinvio.

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore invio' },
      { status: 500 }
    )
  }
}
