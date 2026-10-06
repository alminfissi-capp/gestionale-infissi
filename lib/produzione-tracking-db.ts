/**
 * Accesso al tracking con il service role. NON è un file 'use server':
 * `registraEvento` scrive eventi e non deve essere esposta come endpoint
 * pubblico. Importare solo da route handler e Server Component.
 */
import { createServiceClient } from '@/lib/supabase/service'
import { formattaNumeroOrdine } from '@/lib/produzione'
import type { TipoEventoTracking } from '@/types/produzione'

export type OrdinePerToken = {
  id: string
  organizationId: string
  numeroOrdine: string
  pdfInviatoPath: string | null
}

export type DatiPaginaOrdine = {
  ordineId: string
  organizationId: string
  numeroOrdine: string
  dataOrdine: string
  fornitoreNome: string
  denominazione: string
  logoUrl: string | null
  pdfDisponibile: boolean
  /** L'ordine chiede al fornitore di caricare la conferma d'ordine. */
  richiedeConferma: boolean
  /** File gia' caricati dal fornitore: solo cio' che serve a mostrarglieli. */
  fileCaricati: { tipo: 'conferma' | 'documento'; nome: string; caricatoAt: string }[]
  /** C'e' una conferma firmata da scaricare. */
  confermaFirmata: boolean
}

type DatiEvento = {
  destinatario?: string | null
  userAgent?: string | null
  ip?: string | null
  /** Path storage della copia congelata inviata in questo evento (solo tipo='inviato'). */
  pdfPath?: string | null
  /** Se valorizzato, non scrive se esiste già lo stesso evento entro N secondi. */
  dedupSecondi?: number
}

/**
 * Scrive un evento. Non solleva mai: un errore qui non deve impedire al
 * fornitore di vedere il documento.
 */
export async function registraEvento(
  ordineId: string,
  organizationId: string,
  tipo: TipoEventoTracking,
  dati: DatiEvento = {}
): Promise<void> {
  try {
    const service = createServiceClient()

    if (dati.dedupSecondi && dati.dedupSecondi > 0) {
      const soglia = new Date(Date.now() - dati.dedupSecondi * 1000).toISOString()
      const { data: recenti } = await service
        .from('tracking_email_ordine')
        .select('id')
        .eq('ordine_id', ordineId)
        .eq('tipo', tipo)
        .gte('avvenuto_at', soglia)
        .limit(1)
      if (recenti && recenti.length > 0) return
    }

    const { error } = await service.from('tracking_email_ordine').insert({
      ordine_id: ordineId,
      organization_id: organizationId,
      tipo,
      destinatario: dati.destinatario ?? null,
      user_agent: dati.userAgent ?? null,
      ip: dati.ip ?? null,
      pdf_path: dati.pdfPath ?? null,
    })
    if (error) console.error('[tracking ordine] insert:', error.message)
  } catch (e) {
    console.error('[tracking ordine] eccezione:', e instanceof Error ? e.message : e)
  }
}

export async function getOrdinePerToken(token: string): Promise<OrdinePerToken | null> {
  const service = createServiceClient()
  const { data } = await service
    .from('ordini_fornitore')
    .select('id, organization_id, numero_ordine, pdf_inviato_path')
    .eq('tracking_token', token)
    .maybeSingle()

  if (!data) return null
  return {
    id: data.id,
    organizationId: data.organization_id,
    numeroOrdine: data.numero_ordine,
    pdfInviatoPath: data.pdf_inviato_path,
  }
}

/** Tutto ciò che serve alla pagina pubblica, senza sessione utente. */
export async function getDatiPaginaOrdine(token: string): Promise<DatiPaginaOrdine | null> {
  const service = createServiceClient()

  const { data: ordine } = await service
    .from('ordini_fornitore')
    .select('id, organization_id, numero_ordine, data_ordine, pdf_inviato_path, fornitore_id, richiede_conferma')
    .eq('tracking_token', token)
    .maybeSingle()
  if (!ordine) return null

  const [{ data: fornitore }, { data: settings }, { data: file }] = await Promise.all([
    ordine.fornitore_id
      ? service.from('fornitori').select('nome').eq('id', ordine.fornitore_id).maybeSingle()
      : Promise.resolve({ data: null }),
    service
      .from('settings')
      .select('denominazione, logo_url')
      .eq('organization_id', ordine.organization_id)
      .maybeSingle(),
    // Solo i file del fornitore: la conferma caricata a mano dall'utente
    // non lo riguarda.
    service
      .from('file_fornitore_ordine')
      .select('tipo, nome_file, created_at, stato, caricato_da')
      .eq('ordine_id', ordine.id)
      .order('created_at', { ascending: true }),
  ])

  let logoUrl: string | null = null
  if (settings?.logo_url) {
    const { data: firmato } = await service.storage
      .from('logos')
      .createSignedUrl(settings.logo_url, 3600)
    logoUrl = firmato?.signedUrl ?? null
  }

  return {
    ordineId: ordine.id,
    organizationId: ordine.organization_id,
    numeroOrdine: formattaNumeroOrdine(ordine.numero_ordine),
    dataOrdine: ordine.data_ordine,
    fornitoreNome: fornitore?.nome ?? '',
    denominazione: settings?.denominazione ?? 'A.L.M. Infissi',
    logoUrl,
    pdfDisponibile: Boolean(ordine.pdf_inviato_path),
    richiedeConferma: Boolean(ordine.richiede_conferma),
    fileCaricati: (file ?? [])
      .filter((f) => f.caricato_da === 'fornitore')
      .map((f) => ({
        tipo: f.tipo as 'conferma' | 'documento',
        nome: f.nome_file as string,
        caricatoAt: f.created_at as string,
      })),
    confermaFirmata: (file ?? []).some((f) => f.stato === 'firmata'),
  }
}
