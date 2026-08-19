// actions/calendario.ts
'use server'

import { randomUUID } from 'node:crypto'
import { Resend } from 'resend'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { getMyPermissions, requireAccesso } from '@/lib/permessi'
import { getSettings } from '@/actions/impostazioni'
import { aggiungiGiorni, espandiCatena, messaggioAppuntamento } from '@/lib/calendario'
import { filtraClienti } from '@/lib/ricerca-clienti'
import { ANNO_RICORRENTE, ORARI_LAVORO_DEFAULT } from '@/types/calendario'
import { STATI_COMMESSA_APERTI } from '@/types/produzione'
import type { CommessaOpzione } from '@/types/produzione'
import type {
  Chiusura,
  ChiusuraInput,
  OrariLavoro,
  OrarioGiorno,
  EventoConContesto,
  EventoInput,
} from '@/types/calendario'

const RE_ORA = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * Normalizza quello che arriva dal database o dal form in sette giorni validi.
 * Un JSON malformato non deve mai far esplodere il calendario: si ripiega
 * sui valori di partenza.
 */
function normalizzaOrari(grezzo: unknown): OrariLavoro {
  if (!Array.isArray(grezzo) || grezzo.length !== 7) return ORARI_LAVORO_DEFAULT
  return grezzo.map((g, i): OrarioGiorno => {
    const base = ORARI_LAVORO_DEFAULT[i]
    if (typeof g !== 'object' || g === null) return base
    const o = g as Record<string, unknown>
    const apertura = typeof o.apertura === 'string' && RE_ORA.test(o.apertura)
      ? o.apertura : base.apertura
    const chiusura = typeof o.chiusura === 'string' && RE_ORA.test(o.chiusura)
      ? o.chiusura : base.chiusura
    return {
      aperto: typeof o.aperto === 'boolean' ? o.aperto : base.aperto,
      apertura,
      chiusura: chiusura > apertura ? chiusura : base.chiusura,
    }
  })
}

export async function getOrariLavoro(): Promise<OrariLavoro> {
  const settings = await getSettings()
  return normalizzaOrari(settings?.orari_lavoro)
}

export async function setOrariLavoro(orari: OrariLavoro): Promise<void> {
  await requireAccesso('impostazioni', 'scrittura')
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error } = await supabase
    .from('settings')
    .upsert(
      { organization_id: orgId, orari_lavoro: normalizzaOrari(orari) },
      { onConflict: 'organization_id' }
    )
  if (error) throw new Error(error.message)

  revalidateTag(`settings-${orgId}`, {})
  revalidatePath('/impostazioni')
  revalidatePath('/produzione')
  revalidatePath('/calendario')
}

export async function getChiusure(): Promise<Chiusura[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('chiusure')
    .select('*')
    .eq('organization_id', orgId)
    .order('data_inizio', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createChiusura(input: ChiusuraInput): Promise<void> {
  await requireAccesso('impostazioni', 'scrittura')
  // Una chiusura ricorrente puo' scavalcare il capodanno, quindi la fine che
  // precede l'inizio e' un errore solo per le chiusure di un anno preciso.
  if (!input.ricorrente && input.data_fine < input.data_inizio) {
    throw new Error('La data di fine non può precedere quella di inizio')
  }
  const supabase = await createClient()
  const orgId = await getOrgId()

  // Nelle ricorrenti l'anno non ha significato: si normalizza al segnaposto,
  // altrimenti due Natali salvati in anni diversi sembrerebbero due festivita'.
  const dati: ChiusuraInput = input.ricorrente
    ? {
        ...input,
        data_inizio: `${ANNO_RICORRENTE}-${input.data_inizio.slice(5)}`,
        data_fine: `${ANNO_RICORRENTE}-${input.data_fine.slice(5)}`,
      }
    : input

  const { error } = await supabase
    .from('chiusure')
    .insert({ organization_id: orgId, ...dati })
  if (error) throw new Error(error.message)

  revalidatePath('/impostazioni')
  revalidatePath('/produzione')
  revalidatePath('/calendario')
}

/**
 * Inserisce piu' chiusure in un colpo solo (il pulsante delle festivita'
 * italiane). Le descrizioni gia' presenti vengono saltate, cosi' premerlo due
 * volte non raddoppia l'elenco.
 */
export async function createChiusureMultiple(inputs: ChiusuraInput[]): Promise<number> {
  await requireAccesso('impostazioni', 'scrittura')
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data: esistenti, error: erroreLettura } = await supabase
    .from('chiusure')
    .select('descrizione')
    .eq('organization_id', orgId)
  if (erroreLettura) throw new Error(erroreLettura.message)

  const gia = new Set((esistenti ?? []).map((c) => c.descrizione.toLowerCase()))
  const nuove = inputs
    .filter((i) => !gia.has(i.descrizione.toLowerCase()))
    .map((i) => ({
      organization_id: orgId,
      descrizione: i.descrizione,
      ricorrente: i.ricorrente,
      data_inizio: i.ricorrente
        ? `${ANNO_RICORRENTE}-${i.data_inizio.slice(5)}`
        : i.data_inizio,
      data_fine: i.ricorrente
        ? `${ANNO_RICORRENTE}-${i.data_fine.slice(5)}`
        : i.data_fine,
    }))

  if (nuove.length === 0) return 0

  const { error } = await supabase.from('chiusure').insert(nuove)
  if (error) throw new Error(error.message)

  revalidatePath('/impostazioni')
  revalidatePath('/produzione')
  revalidatePath('/calendario')
  return nuove.length
}

export async function deleteChiusura(id: string): Promise<void> {
  await requireAccesso('impostazioni', 'scrittura')
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error } = await supabase
    .from('chiusure')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)

  revalidatePath('/impostazioni')
  revalidatePath('/produzione')
  revalidatePath('/calendario')
}

/** Colonne da leggere con i join che servono all'etichetta della barra. */
const SELECT_EVENTO = `
  *,
  commesse ( numero_commessa ),
  fornitori ( nome )
`

type RigaGrezza = Record<string, unknown> & {
  commesse: { numero_commessa: string } | null
  fornitori: { nome: string } | null
}

function appiattisci(riga: RigaGrezza): EventoConContesto {
  const { commesse, fornitori, ...evento } = riga
  return {
    ...(evento as unknown as EventoConContesto),
    numero_commessa: commesse?.numero_commessa ?? null,
    fornitore_nome: fornitori?.nome ?? null,
  }
}

/**
 * Eventi visibili alla Produzione in un intervallo di date.
 * Gli annullati restano nel database ma non si disegnano.
 */
export async function getEventiProduzione(
  dataInizio: string,
  dataFine: string
): Promise<EventoConContesto[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data, error } = await supabase
    .from('eventi_calendario')
    .select(SELECT_EVENTO)
    .eq('organization_id', orgId)
    .eq('visibile_produzione', true)
    .neq('stato', 'annullato')
    .gte('data', dataInizio)
    .lte('data', dataFine)
    .order('data', { ascending: true })
    .order('ora_inizio', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => appiattisci(r as unknown as RigaGrezza))
}

/**
 * Crea un evento. Con `giorni > 1` crea una catena: una riga per giorno
 * lavorativo, tutte con lo stesso catena_id, saltando i giorni chiusi.
 */
export async function createEvento(input: EventoInput, giorni = 1): Promise<void> {
  await requireAccesso('produzione', 'scrittura')
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data: { user } } = await supabase.auth.getUser()

  let righe: Record<string, unknown>[]

  if (giorni > 1) {
    const [orari, chiusure] = await Promise.all([getOrariLavoro(), getChiusure()])
    const catenaId = randomUUID()
    righe = espandiCatena(
      input.data, giorni, input.ora_inizio, input.ora_fine, orari, chiusure
    ).map((g) => ({
      ...input,
      organization_id: orgId,
      created_by: user?.id ?? null,
      catena_id: catenaId,
      data: g.data,
      ora_inizio: g.ora_inizio,
      ora_fine: g.ora_fine,
    }))
  } else {
    righe = [{ ...input, organization_id: orgId, created_by: user?.id ?? null }]
  }

  // espandiCatena tronca in silenzio quando i giorni lavorativi non bastano.
  // Una catena piu' corta del richiesto si noterebbe solo contando le barre
  // sul Gantt, quindi qui diventa un errore visibile.
  if (righe.length === 0) {
    throw new Error('Nessun giorno lavorativo disponibile nel periodo scelto')
  }
  if (righe.length < giorni) {
    throw new Error(
      `Nel periodo scelto ci sono solo ${righe.length} giorni lavorativi invece di ${giorni}. ` +
      'Sposta la data di inizio o riduci i giorni.'
    )
  }

  const { error } = await supabase.from('eventi_calendario').insert(righe)
  if (error) throw new Error(error.message)

  revalidatePath('/produzione')
  revalidatePath('/calendario')
}

export async function updateEvento(
  id: string,
  patch: Partial<EventoInput>
): Promise<void> {
  await requireAccesso('produzione', 'scrittura')
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error } = await supabase
    .from('eventi_calendario')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)

  revalidatePath('/produzione')
  revalidatePath('/calendario')
}

/** Spostamento da trascinamento o ridimensionamento: tocca solo data e ore. */
export async function spostaEvento(
  id: string,
  data: string,
  oraInizio: string,
  oraFine: string
): Promise<void> {
  await requireAccesso('produzione', 'scrittura')
  if (oraFine <= oraInizio) throw new Error('La fine deve venire dopo l’inizio')

  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error } = await supabase
    .from('eventi_calendario')
    .update({
      data,
      ora_inizio: oraInizio,
      ora_fine: oraFine,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)

  revalidatePath('/produzione')
  revalidatePath('/calendario')
}

/**
 * Elimina un evento. Con `tuttaLaCatena` elimina tutti i giorni della
 * lavorazione continuativa a cui appartiene.
 */
export async function deleteEvento(id: string, tuttaLaCatena = false): Promise<void> {
  await requireAccesso('produzione', 'scrittura')
  const supabase = await createClient()
  const orgId = await getOrgId()

  if (tuttaLaCatena) {
    const { data: evento } = await supabase
      .from('eventi_calendario')
      .select('catena_id')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (evento?.catena_id) {
      const { error } = await supabase
        .from('eventi_calendario')
        .delete()
        .eq('catena_id', evento.catena_id)
        .eq('organization_id', orgId)
      if (error) throw new Error(error.message)
      revalidatePath('/produzione')
      revalidatePath('/calendario')
      return
    }
  }

  const { error } = await supabase
    .from('eventi_calendario')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)

  revalidatePath('/produzione')
  revalidatePath('/calendario')
}

/**
 * Le commesse aperte, per la colonna laterale del calendario e per la scelta
 * rapida da uno slot vuoto. Elenco piatto: una riga per commessa, non una per
 * attivita' mancante, altrimenti la colonna diventa illeggibile.
 */
export async function getCommesseAperte(): Promise<CommessaOpzione[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data, error } = await supabase
    .from('commesse')
    .select('id, numero_commessa, cliente_nome')
    .eq('organization_id', orgId)
    .in('stato', STATI_COMMESSA_APERTI)
    .order('numero_commessa', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as CommessaOpzione[]
}

/* ------------------------------------------------------------------ *
 * Vista Amministrazione                                              *
 * ------------------------------------------------------------------ */

/**
 * Eventi dell'agenda: solo quelli marcati come visibili in Amministrazione.
 * La visibilita' e' una proprieta' del singolo evento, non del calendario:
 * un'attivita' di produzione compare qui solo se qualcuno l'ha spuntata.
 */
export async function getEventiAmministrazione(
  dataInizio: string,
  dataFine: string
): Promise<EventoConContesto[]> {
  await requireAccesso('calendario')
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data, error } = await supabase
    .from('eventi_calendario')
    .select(SELECT_EVENTO)
    .eq('organization_id', orgId)
    .eq('visibile_amministrazione', true)
    .neq('stato', 'annullato')
    .gte('data', dataInizio)
    .lte('data', dataFine)
    .order('data', { ascending: true })
    .order('ora_inizio', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => appiattisci(r as unknown as RigaGrezza))
}

/**
 * Un evento di tipo 'scadenza' e' lo specchio di una riga di `scadenze`: si
 * governa dalla spunta in Commesse, non dall'agenda. Toccarlo di qua lo
 * farebbe divergere dalla scadenza vera.
 */
async function vietaSeScadenza(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  orgId: string
): Promise<void> {
  const { data } = await supabase
    .from('eventi_calendario')
    .select('tipo')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (data?.tipo === 'scadenza') {
    throw new Error(
      'Le scadenze si modificano in Commesse: qui sono in sola lettura'
    )
  }
}

export async function createEventoAdmin(input: EventoInput): Promise<void> {
  await requireAccesso('calendario', 'scrittura')
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('eventi_calendario')
    .insert({ ...input, organization_id: orgId, created_by: user?.id ?? null })
  if (error) throw new Error(error.message)

  revalidatePath('/calendario')
  revalidatePath('/produzione')
  revalidatePath('/')
}

export async function updateEventoAdmin(
  id: string,
  patch: Partial<EventoInput>
): Promise<void> {
  await requireAccesso('calendario', 'scrittura')
  const supabase = await createClient()
  const orgId = await getOrgId()
  await vietaSeScadenza(supabase, id, orgId)

  const { error } = await supabase
    .from('eventi_calendario')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)

  revalidatePath('/calendario')
  revalidatePath('/produzione')
  revalidatePath('/')
}

export async function deleteEventoAdmin(id: string): Promise<void> {
  await requireAccesso('calendario', 'scrittura')
  const supabase = await createClient()
  const orgId = await getOrgId()
  await vietaSeScadenza(supabase, id, orgId)

  const { error } = await supabase
    .from('eventi_calendario')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)

  revalidatePath('/calendario')
  revalidatePath('/produzione')
  revalidatePath('/')
}

/** I prossimi impegni dell'agenda, per il riquadro in dashboard. */
export async function getProssimiImpegni(giorni = 7): Promise<EventoConContesto[]> {
  const { isAdmin, permessi } = await getMyPermissions()
  if (!isAdmin && permessi.calendario === 'nessuno') return []

  const oggi = new Date()
  const da = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${String(oggi.getDate()).padStart(2, '0')}`
  const a = aggiungiGiorni(da, giorni)

  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data, error } = await supabase
    .from('eventi_calendario')
    .select(SELECT_EVENTO)
    .eq('organization_id', orgId)
    .eq('visibile_amministrazione', true)
    .neq('stato', 'annullato')
    .gte('data', da)
    .lte('data', a)
    .order('data', { ascending: true })
    .order('ora_inizio', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => appiattisci(r as unknown as RigaGrezza))
}

/* ------------------------------------------------------------------ *
 * Scadenze mostrate in agenda                                        *
 * ------------------------------------------------------------------ */

/** Riga di `scadenze` che serve a comporre l'evento specchio. */
type ScadenzaSpecchio = {
  data_scadenza: string | null
  descrizione: string
  fornitore: string
  importo: number
}

function eventoDaScadenza(s: ScadenzaSpecchio): Record<string, unknown> {
  const importo = s.importo
    ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(s.importo)
    : null
  return {
    tipo: 'scadenza',
    titolo: [s.descrizione, s.fornitore].filter(Boolean).join(' — '),
    data: s.data_scadenza,
    ora_inizio: '08:00',
    ora_fine: '19:00',
    tutto_il_giorno: true,
    note: importo,
    visibile_produzione: false,
    visibile_amministrazione: true,
    updated_at: new Date().toISOString(),
  }
}

/** Gli id delle scadenze che hanno gia' un evento in agenda. */
export async function getScadenzeInCalendario(): Promise<string[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data, error } = await supabase
    .from('eventi_calendario')
    .select('scadenza_id')
    .eq('organization_id', orgId)
    .not('scadenza_id', 'is', null)

  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => r.scadenza_id as string)
}

/**
 * Mostra o toglie una scadenza dall'agenda. L'evento e' uno specchio in sola
 * lettura: nasce qui, si aggiorna con la scadenza e sparisce togliendo la
 * spunta (o cancellando la scadenza, per via del vincolo ON DELETE CASCADE).
 */
export async function toggleScadenzaInCalendario(
  scadenzaId: string,
  mostra: boolean
): Promise<void> {
  await requireAccesso('commesse', 'scrittura')
  const supabase = await createClient()
  const orgId = await getOrgId()

  if (!mostra) {
    const { error } = await supabase
      .from('eventi_calendario')
      .delete()
      .eq('scadenza_id', scadenzaId)
      .eq('organization_id', orgId)
    if (error) throw new Error(error.message)
  } else {
    const { data: scadenza, error: erroreLettura } = await supabase
      .from('scadenze')
      .select('data_scadenza, descrizione, fornitore, importo')
      .eq('id', scadenzaId)
      .eq('organization_id', orgId)
      .single()
    if (erroreLettura) throw new Error(erroreLettura.message)

    // Una scadenza "da programmare" non ha data: sul calendario non ha un posto.
    if (!scadenza.data_scadenza) {
      throw new Error('Assegna prima una data alla scadenza')
    }

    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('eventi_calendario').insert({
      ...eventoDaScadenza(scadenza as ScadenzaSpecchio),
      organization_id: orgId,
      scadenza_id: scadenzaId,
      created_by: user?.id ?? null,
    })
    if (error) throw new Error(error.message)
  }

  revalidatePath('/commesse', 'layout')
  revalidatePath('/calendario')
  revalidatePath('/')
}

/**
 * Riallinea l'evento specchio dopo una modifica alla scadenza. Non crea nulla:
 * se la scadenza non e' in agenda non deve entrarci da sola.
 */
export async function sincronizzaEventoScadenza(scadenzaId: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data: evento } = await supabase
    .from('eventi_calendario')
    .select('id')
    .eq('scadenza_id', scadenzaId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (!evento) return

  const { data: scadenza } = await supabase
    .from('scadenze')
    .select('data_scadenza, descrizione, fornitore, importo')
    .eq('id', scadenzaId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (!scadenza) return

  // Se la scadenza torna senza data esce dall'agenda: non c'e' giorno su cui
  // disegnarla.
  if (!scadenza.data_scadenza) {
    await supabase
      .from('eventi_calendario')
      .delete()
      .eq('id', evento.id)
      .eq('organization_id', orgId)
    revalidatePath('/calendario')
    return
  }

  await supabase
    .from('eventi_calendario')
    .update(eventoDaScadenza(scadenza as ScadenzaSpecchio))
    .eq('id', evento.id)
    .eq('organization_id', orgId)

  revalidatePath('/calendario')
}

/* ------------------------------------------------------------------ *
 * Notifiche al cliente                                               *
 * ------------------------------------------------------------------ */

export type RecapitiAppuntamento = {
  email: string | null
  telefono: string | null
  /** Testo gia' composto, uguale per email e WhatsApp. */
  messaggio: string
  avvisato_email_at: string | null
  avvisato_whatsapp_at: string | null
}

/**
 * Recapiti e testo per avvisare il cliente di un appuntamento. I recapiti si
 * cercano in anagrafica dal nome scritto sull'evento: un cliente puo' non
 * essere in `clienti` (succede spesso), e in quel caso si compilano a mano.
 */
export async function getRecapitiAppuntamento(
  eventoId: string
): Promise<RecapitiAppuntamento> {
  await requireAccesso('calendario')
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data: evento, error } = await supabase
    .from('eventi_calendario')
    .select(
      'tipo, titolo, data, ora_inizio, ora_fine, tutto_il_giorno, cliente_id, cliente_nome, note, avvisato_email_at, avvisato_whatsapp_at'
    )
    .eq('id', eventoId)
    .eq('organization_id', orgId)
    .single()
  if (error) throw new Error(error.message)

  const settings = await getSettings()

  let email: string | null = null
  let telefono: string | null = null

  if (evento.cliente_id) {
    const { data: cliente } = await supabase
      .from('clienti')
      .select('email, telefono')
      .eq('id', evento.cliente_id)
      .eq('organization_id', orgId)
      .maybeSingle()
    email = cliente?.email ?? null
    telefono = cliente?.telefono ?? null
  } else if (evento.cliente_nome) {
    const { data: clienti } = await supabase
      .from('clienti')
      .select('tipo, ragione_sociale, nome, cognome, telefono, email, cf_piva, cantiere')
      .eq('organization_id', orgId)
    // Un solo risultato e' una corrispondenza; due o piu' sono un'omonimia, e
    // indovinare a chi scrivere non e' un rischio che vale la pena correre.
    const trovati = filtraClienti(clienti ?? [], evento.cliente_nome)
    if (trovati.length === 1) {
      email = trovati[0].email ?? null
      telefono = trovati[0].telefono ?? null
    }
  }

  return {
    email,
    telefono,
    messaggio: messaggioAppuntamento({
      titolo: evento.titolo,
      data: evento.data,
      ora_inizio: evento.ora_inizio,
      ora_fine: evento.ora_fine,
      tutto_il_giorno: evento.tutto_il_giorno,
      cliente_nome: evento.cliente_nome,
      note: evento.note,
      azienda: settings?.denominazione || 'Azienda',
      telefonoAzienda: settings?.telefono ?? null,
    }),
    avvisato_email_at: evento.avvisato_email_at,
    avvisato_whatsapp_at: evento.avvisato_whatsapp_at,
  }
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Avvisa il cliente via email. A comando: nessun invio automatico, cosi'
 * correggere l'orario di un appuntamento non genera email a raffica.
 */
export async function inviaEmailAppuntamento(
  eventoId: string,
  email: string
): Promise<void> {
  await requireAccesso('calendario', 'scrittura')
  const destinatario = email.trim()
  if (!destinatario.includes('@')) throw new Error('Indirizzo email non valido')

  const { messaggio } = await getRecapitiAppuntamento(eventoId)
  const settings = await getSettings()
  const azienda = settings?.denominazione || 'Azienda'
  const mittente = settings?.email || 'onboarding@resend.dev'

  const resend = new Resend(process.env.RESEND_API_KEY)
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;line-height:1.6">${
    escapeHtml(messaggio).split('\n').join('<br>')
  }</div>`

  const { error } = await resend.emails.send({
    from: `${azienda} <${mittente}>`,
    to: destinatario,
    subject: 'Promemoria appuntamento',
    html,
    text: messaggio,
  })
  if (error) throw new Error(error.message)

  const supabase = await createClient()
  const orgId = await getOrgId()
  await supabase
    .from('eventi_calendario')
    .update({ avvisato_email_at: new Date().toISOString() })
    .eq('id', eventoId)
    .eq('organization_id', orgId)

  revalidatePath('/calendario')
}

/**
 * Registra che il cliente e' stato avvisato su WhatsApp. Il messaggio parte
 * dal telefono di chi lo manda (wa.me), quindi qui resta solo la data.
 */
export async function registraAvvisoWhatsapp(eventoId: string): Promise<void> {
  await requireAccesso('calendario', 'scrittura')
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error } = await supabase
    .from('eventi_calendario')
    .update({ avvisato_whatsapp_at: new Date().toISOString() })
    .eq('id', eventoId)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)

  revalidatePath('/calendario')
}
