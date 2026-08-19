// actions/calendario.ts
'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { requireAccesso } from '@/lib/permessi'
import { getSettings } from '@/actions/impostazioni'
import { espandiCatena } from '@/lib/calendario'
import { ORARI_LAVORO_DEFAULT } from '@/types/calendario'
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
  if (input.data_fine < input.data_inizio) {
    throw new Error('La data di fine non può precedere quella di inizio')
  }
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error } = await supabase
    .from('chiusure')
    .insert({ organization_id: orgId, ...input })
  if (error) throw new Error(error.message)

  revalidatePath('/impostazioni')
  revalidatePath('/produzione')
  revalidatePath('/calendario')
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
