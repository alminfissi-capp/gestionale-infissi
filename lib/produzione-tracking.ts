import type { EventoTracking, TipoEventoTracking, TrackingOrdine } from '@/types/produzione'

export const TRACKING_VUOTO: TrackingOrdine = {
  stato: 'non_inviato',
  inviatoAt: null,
  destinatario: null,
  emailApertaAt: null,
  paginaApertaAt: null,
  pdfScaricatoAt: null,
  aperture: 0,
  invii: 0,
}

/**
 * Stato corrente a partire dallo storico completo. Contano solo gli eventi
 * successivi all'ultimo invio: un reinvio riporta l'indicatore a "inviato"
 * senza cancellare ciò che era successo prima.
 */
export function riassumiEventi(eventi: EventoTracking[]): TrackingOrdine {
  const ordinati = [...eventi].sort(
    (a, b) => Date.parse(a.avvenuto_at) - Date.parse(b.avvenuto_at)
  )
  const invii = ordinati.filter((e) => e.tipo === 'inviato')
  const ultimoInvio = invii[invii.length - 1]
  if (!ultimoInvio) return { ...TRACKING_VUOTO }

  const soglia = Date.parse(ultimoInvio.avvenuto_at)
  const letture = ordinati.filter(
    (e) => e.tipo !== 'inviato' && Date.parse(e.avvenuto_at) >= soglia
  )

  const primo = (tipo: TipoEventoTracking): string | null =>
    letture.find((e) => e.tipo === tipo)?.avvenuto_at ?? null

  return {
    stato: letture.length > 0 ? 'letto' : 'inviato',
    inviatoAt: ultimoInvio.avvenuto_at,
    destinatario: ultimoInvio.destinatario,
    emailApertaAt: primo('email_aperta'),
    paginaApertaAt: primo('pagina_aperta'),
    pdfScaricatoAt: primo('pdf_scaricato'),
    aperture: letture.filter(
      (e) => e.tipo === 'pagina_aperta' || e.tipo === 'pdf_scaricato'
    ).length,
    invii: invii.length,
  }
}

/**
 * Gli ordini spediti prima di questa funzione hanno `inviato_at` ma nessun
 * evento: vanno comunque mostrati come inviati, senza dati di lettura.
 */
export function conFallbackInvio(
  t: TrackingOrdine,
  inviatoAt: string | null
): TrackingOrdine {
  if (t.stato !== 'non_inviato' || !inviatoAt) return t
  return { ...t, stato: 'inviato', inviatoAt, invii: 1 }
}

/**
 * Data e ora in ora italiana. Fuso esplicito perché il server gira in UTC e
 * il documento è una prova di consegna: deve leggere l'ora di casa.
 */
export function formattaDataOra(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const parti = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const p = (tipo: string): string => parti.find((x) => x.type === tipo)?.value ?? ''
  return `${p('day')}/${p('month')}/${p('year')} ${p('hour')}:${p('minute')}`
}

const rigaInvio = (t: TrackingOrdine): string =>
  t.destinatario
    ? `Inviato a ${t.destinatario} il ${formattaDataOra(t.inviatoAt)}`
    : `Inviato il ${formattaDataOra(t.inviatoAt)}`

/** Righe del tooltip sull'icona di stato: il dettaglio completo. */
export function righeTooltip(t: TrackingOrdine): string[] {
  if (t.stato === 'non_inviato') return ['Non inviato']

  const righe = [rigaInvio(t)]
  if (t.emailApertaAt) righe.push(`Email aperta il ${formattaDataOra(t.emailApertaAt)}`)
  if (t.paginaApertaAt) righe.push(`Pagina aperta il ${formattaDataOra(t.paginaApertaAt)}`)
  if (t.pdfScaricatoAt) righe.push(`PDF scaricato il ${formattaDataOra(t.pdfScaricatoAt)}`)
  if (t.aperture > 1) righe.push(`Aperto ${t.aperture} volte`)
  if (t.invii > 1) righe.push(`Inviato ${t.invii} volte in tutto`)
  return righe
}

/**
 * Vero se l'ordine è stato modificato dopo l'ultimo invio. Si basa sulle righe
 * perché `updateOrdine` le ricrea tutte a ogni salvataggio, mentre `updated_at`
 * della testata viene toccato anche dalla semplice Anteprima.
 */
export function isModificatoDopoInvio(
  righeCreatedAt: string[],
  inviatoAt: string | null
): boolean {
  if (!inviatoAt) return false
  const soglia = Date.parse(inviatoAt)
  return righeCreatedAt.some((c) => Date.parse(c) > soglia)
}

/** Righe del footer sul PDF: la ricevuta di consegna, sintetica. */
export function righeFooterPdf(t: TrackingOrdine, modificatoDopoInvio = false): string[] {
  if (t.stato === 'non_inviato' || !t.inviatoAt) return []

  const righe = [rigaInvio(t)]

  const apertureDocumento = [t.paginaApertaAt, t.pdfScaricatoAt].filter(
    (v): v is string => v !== null
  )
  if (apertureDocumento.length > 0) {
    const prima = apertureDocumento.sort((a, b) => Date.parse(a) - Date.parse(b))[0]
    righe.push(`Documento aperto dal destinatario il ${formattaDataOra(prima)}`)
  } else if (t.emailApertaAt) {
    righe.push(`Email aperta dal destinatario il ${formattaDataOra(t.emailApertaAt)}`)
  }

  if (modificatoDopoInvio) {
    righe.push(`Documento modificato dopo l'invio: le date si riferiscono alla versione spedita`)
  }

  return righe
}
