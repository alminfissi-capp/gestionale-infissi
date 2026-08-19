// actions/calendario.ts
'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { getMyPermissions, requireAccesso } from '@/lib/permessi'
import { getSettings } from '@/actions/impostazioni'
import { aggiungiGiorni, espandiCatena } from '@/lib/calendario'
import {
  ANNO_RICORRENTE, ORARI_LAVORO_DEFAULT, RICEZIONE_PER_CATEGORIA,
} from '@/types/calendario'
import { STATI_COMMESSA_APERTI } from '@/types/produzione'
import type {
  CategoriaFornitore,
  TipoEventoProduzione,
  VoceDaPianificare,
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

/** I tre tipi che una commessa deve avere collocati per uscire dalla coda. */
const TIPI_ATTESI_COMMESSA: TipoEventoProduzione[] = ['lavorazione', 'posa', 'carico']

/**
 * Cosa aspetta di essere collocato sul calendario: commesse aperte senza
 * lavorazione, posa o carico, e ordini in arrivo senza ricezione.
 * Non crea nulla: propone soltanto.
 */
export async function getVociDaPianificare(): Promise<VoceDaPianificare[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const [commesseRes, eventiRes, ordiniRes] = await Promise.all([
    supabase
      .from('commesse')
      .select('id, numero_commessa, cliente_nome')
      .eq('organization_id', orgId)
      .in('stato', STATI_COMMESSA_APERTI)
      .order('numero_commessa', { ascending: true }),
    supabase
      .from('eventi_calendario')
      .select('commessa_id, tipo, ordine_id')
      .eq('organization_id', orgId)
      .neq('stato', 'annullato'),
    supabase
      .from('ordini_fornitore')
      .select(
        'id, numero_ordine, fornitore_id, data_consegna_prevista, fornitori ( nome, categoria_calendario )'
      )
      .eq('organization_id', orgId)
      .eq('stato', 'ordinato')
      .not('data_consegna_prevista', 'is', null)
      .order('data_consegna_prevista', { ascending: true }),
  ])

  if (commesseRes.error) throw new Error(commesseRes.error.message)
  if (eventiRes.error) throw new Error(eventiRes.error.message)
  if (ordiniRes.error) throw new Error(ordiniRes.error.message)

  // Quali tipi sono gia' collocati, per commessa; e quali ordini hanno una ricezione.
  const tipiPerCommessa = new Map<string, Set<string>>()
  const ordiniCollocati = new Set<string>()
  for (const e of eventiRes.data ?? []) {
    if (e.ordine_id) ordiniCollocati.add(e.ordine_id as string)
    if (!e.commessa_id) continue
    const chiave = e.commessa_id as string
    if (!tipiPerCommessa.has(chiave)) tipiPerCommessa.set(chiave, new Set())
    tipiPerCommessa.get(chiave)!.add(e.tipo as string)
  }

  const voci: VoceDaPianificare[] = []

  for (const c of commesseRes.data ?? []) {
    const presenti = tipiPerCommessa.get(c.id) ?? new Set<string>()
    const mancanti = TIPI_ATTESI_COMMESSA.filter((t) => !presenti.has(t))
    if (mancanti.length === 0) continue
    voci.push({
      genere: 'commessa',
      id: c.id,
      numero_commessa: c.numero_commessa,
      cliente_nome: c.cliente_nome,
      tipi_mancanti: mancanti,
    })
  }

  for (const o of ordiniRes.data ?? []) {
    if (ordiniCollocati.has(o.id)) continue
    const fornitore = o.fornitori as unknown as
      { nome: string; categoria_calendario: CategoriaFornitore | null } | null
    const categoria = fornitore?.categoria_calendario ?? null
    voci.push({
      genere: 'ordine',
      id: o.id,
      numero_ordine: o.numero_ordine,
      fornitore_id: o.fornitore_id,
      fornitore_nome: fornitore?.nome ?? null,
      data_consegna_prevista: o.data_consegna_prevista as string,
      tipo_ricezione: categoria ? RICEZIONE_PER_CATEGORIA[categoria] : 'ricez_accessori',
      categoria_mancante: categoria === null,
    })
  }

  return voci
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
