import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'
import { getSettings } from '@/actions/impostazioni'
import { formattaNumeroOrdine } from '@/lib/produzione'
import { cartellaFileFornitore, noteInHtml } from '@/lib/conferme-ordine'

const resend = new Resend(process.env.RESEND_API_KEY)

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Rimanda al fornitore la conferma firmata. Il PDF firmato e' gia' su Storage
 * (lo prepara il browser con pdf-lib, come il PDF d'ordine): qui si controlla
 * il path, si spedisce l'email e si registra la firma.
 */
export async function POST(request: Request) {
  const service = createServiceClient()
  // Il PDF firmato caricato dal browser: se la firma non va in porto non deve
  // restare orfano su Storage.
  let pathFirmato: string | null = null
  const rifiuta = async (error: string, status: number) => {
    if (pathFirmato) await service.storage.from('commesse-docs').remove([pathFirmato])
    return NextResponse.json({ error }, { status })
  }
  try {
    const { confermaId, path, note } = (await request.json()) as {
      confermaId: string; path: string; note?: string
    }
    const supabase = await createClient()
    const orgId = await getOrgId()

    const { data: conferma } = await supabase
      .from('file_fornitore_ordine')
      .select('id, ordine_id, stato, tipo')
      .eq('organization_id', orgId)
      .eq('id', confermaId)
      .maybeSingle()
    if (!conferma || conferma.tipo !== 'conferma') {
      return NextResponse.json({ error: 'Conferma non trovata' }, { status: 404 })
    }

    const cartella = cartellaFileFornitore(orgId, conferma.ordine_id)
    const nomeOggetto = typeof path === 'string' ? path.slice(cartella.length) : ''
    if (!path?.startsWith(cartella) || !nomeOggetto.startsWith('firmata-') || nomeOggetto.includes('/')) {
      return NextResponse.json({ error: 'Percorso del PDF firmato non valido' }, { status: 400 })
    }
    pathFirmato = path

    if (conferma.stato !== 'da_firmare') {
      const motivo = conferma.stato === 'sostituita'
        ? 'Il fornitore ha caricato una conferma più recente: firma quella'
        : 'Questa conferma è già stata firmata'
      return await rifiuta(motivo, 409)
    }

    const { data: ordine } = await supabase
      .from('ordini_fornitore')
      .select('id, numero_ordine, tracking_token, fornitore_id, commessa_id')
      .eq('organization_id', orgId)
      .eq('id', conferma.ordine_id)
      .maybeSingle()
    if (!ordine?.tracking_token) return await rifiuta('Ordine non trovato', 404)

    const { data: fornitore } = ordine.fornitore_id
      ? await supabase.from('fornitori').select('nome, email').eq('id', ordine.fornitore_id).maybeSingle()
      : { data: null }
    const email = (fornitore as { email?: string | null } | null)?.email
    if (!email) return await rifiuta('Il fornitore non ha un indirizzo email in anagrafica', 400)

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) return await rifiuta('NEXT_PUBLIC_APP_URL non configurato', 500)

    const settings = await getSettings()
    const azienda = settings?.denominazione || 'Azienda'
    const fromEmail = settings?.email || 'onboarding@resend.dev'
    const numeroOrdine = formattaNumeroOrdine(ordine.numero_ordine)
    const link = `${appUrl}/o/${ordine.tracking_token}/conferma`
    const noteTesto = (note ?? '').trim().slice(0, 4000)

    const blocchiNote = noteTesto
      ? `<p style="margin:16px 0 4px;color:#6b7280">Note:</p><p style="margin:0 0 16px;padding:12px;background:#f3f4f6;border-radius:6px">${noteInHtml(noteTesto)}</p>`
      : ''
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;line-height:1.5">
  <p>Buongiorno,</p>
  <p>vi rimandiamo firmata la vostra conferma per l'ordine <strong>${escapeHtml(numeroOrdine)}</strong>.</p>
  ${blocchiNote}
  <p style="margin:24px 0">
    <a href="${link}" style="background:#0E8F9C;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block">Visualizza la conferma firmata</a>
  </p>
  <p style="font-size:12px;color:#6b7280">Se il pulsante non funziona, copiate questo indirizzo nel browser:<br>${link}</p>
  <p>Cordiali saluti<br>${escapeHtml(azienda)}</p>
</div>`
    const text = `Buongiorno,\n\nvi rimandiamo firmata la vostra conferma per l'ordine ${numeroOrdine}:\n${link}${noteTesto ? `\n\nNote:\n${noteTesto}` : ''}\n\nCordiali saluti\n${azienda}`

    // Prima si registra la firma, poi si spedisce: se il link arrivasse prima
    // della registrazione, il fornitore troverebbe una pagina vuota.
    const { data: { user } } = await supabase.auth.getUser()
    const firmataAt = new Date().toISOString()
    const { data: aggiornata, error: updError } = await supabase
      .from('file_fornitore_ordine')
      .update({
        stato: 'firmata',
        firmata_path: path,
        firmata_at: firmataAt,
        firmata_da: user?.id ?? null,
        note_firma: noteTesto || null,
      })
      .eq('id', conferma.id)
      .eq('stato', 'da_firmare')
      .select('id')
      .maybeSingle()
    if (updError || !aggiornata) {
      return await rifiuta(
        updError?.message ?? 'La conferma è cambiata nel frattempo: ricarica la pagina', 409
      )
    }

    let errore: string | null = null
    try {
      const result = await resend.emails.send({
        from: `${azienda} <${fromEmail}>`,
        to: email,
        subject: `Conferma d'ordine firmata - ${numeroOrdine}`,
        html,
        text,
      })
      errore = result.error?.message ?? null
    } catch (e) {
      errore = e instanceof Error ? e.message : 'errore invio email'
    }

    if (errore) {
      // L'email non e' partita: la conferma torna da firmare, il file firmato non serve.
      await supabase
        .from('file_fornitore_ordine')
        .update({ stato: 'da_firmare', firmata_path: null, firmata_at: null, firmata_da: null, note_firma: null })
        .eq('id', conferma.id)
      return await rifiuta(`Email non inviata: ${errore}`, 500)
    }
    // Da qui il file firmato e' quello consegnato: non va piu' rimosso.
    pathFirmato = null

    await supabase
      .from('file_fornitore_ordine')
      .update({ inviata_a: email, inviata_at: new Date().toISOString() })
      .eq('id', conferma.id)

    if (ordine.commessa_id) {
      const { error: docError } = await supabase.from('documenti_commessa').insert({
        commessa_id: ordine.commessa_id,
        organization_id: orgId,
        nome_file: `Conferma firmata ${numeroOrdine}.pdf`,
        storage_path: path,
        tipo_documento: 'conferma_ordine',
      })
      if (docError) console.error('[invia-conferma] documento commessa:', docError.message)
    }

    return NextResponse.json({ ok: true, destinatario: email })
  } catch (e) {
    return await rifiuta(e instanceof Error ? e.message : 'Errore invio', 500)
  }
}
