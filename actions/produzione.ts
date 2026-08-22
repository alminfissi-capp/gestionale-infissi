'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import {
  calcolaTotaleOrdine,
  isInRitardo,
  normalizzaNumeroOrdine,
  prossimoNumeroOrdine,
} from '@/lib/produzione'
import {
  STATI_COMMESSA_PRODUZIONE, STATO_COMMESSA_LIMBO, TIPI_DOCUMENTO_PRODUZIONE_VALUES,
} from '@/types/produzione'
import type {
  OrdineCompleto,
  OrdineConCommessa,
  OrdineConContesto,
  CommessaOpzione,
  OrdineInput,
  RigaOrdine,
  StatoOrdine,
  CommessaProduzione,
} from '@/types/produzione'
import type { StatoCommessa } from '@/types/commessa'
import { calcolaAvanzamento, AVANZAMENTO_VUOTO } from '@/lib/avanzamento'
import { getAspettiTipo } from '@/actions/calendario'

type FornitoreOpzione = { id: string; nome: string; email: string | null }

const numeraRighe = (righe: RigaOrdine[]): RigaOrdine[] =>
  righe.map((r) => ({
    ...r,
    quantita: Number(r.quantita),
    prezzo_unitario: r.prezzo_unitario === null ? null : Number(r.prezzo_unitario),
  }))

export async function getFornitoriPerOrdine(): Promise<FornitoreOpzione[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data } = await supabase
    .from('fornitori')
    .select('id, nome, email')
    .eq('organization_id', orgId)
    .order('nome', { ascending: true })
  return data ?? []
}

/** Descrizioni già usate per quel fornitore, più frequenti in cima. */
export async function getDescrizioniFornitore(fornitoreId: string): Promise<string[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data } = await supabase
    .from('righe_ordine_fornitore')
    .select('descrizione, ordini_fornitore!inner(fornitore_id)')
    .eq('organization_id', orgId)
    .eq('ordini_fornitore.fornitore_id', fornitoreId)
    .limit(500)

  const frequenze = new Map<string, number>()
  for (const riga of data ?? []) {
    const d = riga.descrizione.trim()
    if (!d) continue
    frequenze.set(d, (frequenze.get(d) ?? 0) + 1)
  }
  return [...frequenze.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([descrizione]) => descrizione)
}

function componiOrdini(
  ordini: {
    id: string
    fornitore_id: string | null
    data_consegna_prevista: string | null
    stato: StatoOrdine
    [k: string]: unknown
  }[],
  fornitori: FornitoreOpzione[],
  righePerOrdine: Map<string, RigaOrdine[]>
): OrdineCompleto[] {
  const nomeFornitore = new Map(fornitori.map((f) => [f.id, f.nome]))
  return ordini.map((o) => {
    const righe = righePerOrdine.get(o.id) ?? []
    return {
      ...(o as unknown as OrdineCompleto),
      righe,
      fornitore_nome: o.fornitore_id ? (nomeFornitore.get(o.fornitore_id) ?? null) : null,
      totale: calcolaTotaleOrdine(righe),
      in_ritardo: isInRitardo(o.data_consegna_prevista, o.stato),
    }
  })
}

export async function getOrdiniCommessa(commessaId: string): Promise<OrdineCompleto[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const [{ data: ordini }, fornitori] = await Promise.all([
    supabase
      .from('ordini_fornitore')
      .select('*')
      .eq('organization_id', orgId)
      .eq('commessa_id', commessaId)
      .order('data_ordine', { ascending: false }),
    getFornitoriPerOrdine(),
  ])
  if (!ordini || ordini.length === 0) return []

  const { data: righe } = await supabase
    .from('righe_ordine_fornitore')
    .select('*')
    .in('ordine_id', ordini.map((o) => o.id))
    .order('ordine', { ascending: true })

  const righePerOrdine = new Map<string, RigaOrdine[]>()
  for (const r of numeraRighe((righe ?? []) as RigaOrdine[])) {
    righePerOrdine.set(r.ordine_id, [...(righePerOrdine.get(r.ordine_id) ?? []), r])
  }
  return componiOrdini(ordini, fornitori, righePerOrdine)
}

/** Commesse selezionabili nel dialog ordine (dal magazzino). */
export async function getCommessePerOrdine(): Promise<CommessaOpzione[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data } = await supabase
    .from('commesse')
    .select('id, numero_commessa, cliente_nome')
    .eq('organization_id', orgId)
    .order('data_conferma', { ascending: false })
  return (data ?? []) as CommessaOpzione[]
}

/**
 * Tutti gli ordini dell'organizzazione (commessa + magazzino), con il
 * contesto commessa quando presente. Usato nell'elenco ordini del magazzino.
 */
export async function getTuttiGliOrdini(): Promise<OrdineConContesto[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const [{ data: ordini }, fornitori] = await Promise.all([
    supabase
      .from('ordini_fornitore')
      .select('*')
      .eq('organization_id', orgId)
      .order('data_ordine', { ascending: false }),
    getFornitoriPerOrdine(),
  ])
  if (!ordini || ordini.length === 0) return []

  const { data: righe } = await supabase
    .from('righe_ordine_fornitore')
    .select('*')
    .in('ordine_id', ordini.map((o) => o.id))
    .order('ordine', { ascending: true })

  const righePerOrdine = new Map<string, RigaOrdine[]>()
  for (const r of numeraRighe((righe ?? []) as RigaOrdine[])) {
    righePerOrdine.set(r.ordine_id, [...(righePerOrdine.get(r.ordine_id) ?? []), r])
  }

  const commessaIds = [...new Set(ordini.map((o) => o.commessa_id).filter((v): v is string => !!v))]
  const commesseMap = new Map<string, { numero_commessa: string; cliente_nome: string }>()
  if (commessaIds.length > 0) {
    const { data: commesse } = await supabase
      .from('commesse')
      .select('id, numero_commessa, cliente_nome')
      .eq('organization_id', orgId)
      .in('id', commessaIds)
    for (const c of commesse ?? []) {
      commesseMap.set(c.id, { numero_commessa: c.numero_commessa, cliente_nome: c.cliente_nome })
    }
  }

  const completi = componiOrdini(ordini, fornitori, righePerOrdine)
  return completi.map((o) => {
    const ctx = o.commessa_id ? commesseMap.get(o.commessa_id) : undefined
    return {
      ...o,
      numero_commessa: ctx?.numero_commessa ?? null,
      cliente_nome: ctx?.cliente_nome ?? null,
    }
  })
}

export async function getCruscottoProduzione(
  stati: StatoCommessa[] = STATI_COMMESSA_PRODUZIONE,
  archiviate = false
): Promise<{ daFare: OrdineConCommessa[]; commesse: CommessaProduzione[] }> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  // In vista archivio si mostrano tutte le commesse archiviate (ogni stato);
  // altrimenti solo quelle attive filtrate per stato.
  let query = supabase
    .from('commesse')
    .select('id, numero_commessa, cliente_nome, stato, data_conferma')
    .eq('organization_id', orgId)
    .eq('archiviata', archiviate)
    // Il limbo non entra in Produzione da nessuna porta, nemmeno passando
    // uno `stati` che lo comprende: finche' non c'e' l'acconto non si parte.
    .neq('stato', STATO_COMMESSA_LIMBO)
  if (!archiviate) query = query.in('stato', stati)
  const { data: commesse } = await query.order('data_conferma', { ascending: false })

  if (!commesse || commesse.length === 0) return { daFare: [], commesse: [] }
  const commessaIds = commesse.map((c) => c.id)

  const [{ data: ordini }, { data: documenti }, { data: attivita }, aspetti, fornitori] = await Promise.all([
    supabase
      .from('ordini_fornitore')
      .select('*')
      .eq('organization_id', orgId)
      .in('commessa_id', commessaIds)
      .neq('stato', 'annullato'),
    supabase
      .from('documenti_commessa')
      .select('commessa_id, tipo_documento')
      .eq('organization_id', orgId)
      .in('commessa_id', commessaIds),
    // Le fasi programmate: l'anello di avanzamento sulla card nasce da qui.
    supabase
      .from('eventi_calendario')
      .select('commessa_id, tipo, stato')
      .eq('organization_id', orgId)
      .in('commessa_id', commessaIds)
      .neq('stato', 'annullato')
      .order('data', { ascending: true })
      .order('ora_inizio', { ascending: true }),
    getAspettiTipo(),
    getFornitoriPerOrdine(),
  ])

  const listaOrdini = ordini ?? []
  const { data: righe } = listaOrdini.length
    ? await supabase
        .from('righe_ordine_fornitore')
        .select('*')
        .in('ordine_id', listaOrdini.map((o) => o.id))
        .order('ordine', { ascending: true })
    : { data: [] }

  const righePerOrdine = new Map<string, RigaOrdine[]>()
  for (const r of numeraRighe((righe ?? []) as RigaOrdine[])) {
    righePerOrdine.set(r.ordine_id, [...(righePerOrdine.get(r.ordine_id) ?? []), r])
  }
  const completi = componiOrdini(listaOrdini, fornitori, righePerOrdine)
  const datiCommessa = new Map(commesse.map((c) => [c.id, c]))

  const daFare: OrdineConCommessa[] = archiviate
    ? []
    : completi
        .filter((o) => o.stato === 'da_ordinare' || o.in_ritardo)
        .map((o) => {
          const c = datiCommessa.get(o.commessa_id)
          return {
            ...o,
            numero_commessa: c?.numero_commessa ?? '',
            cliente_nome: c?.cliente_nome ?? '',
          }
        })
        .sort((a, b) => Number(b.in_ritardo) - Number(a.in_ritardo))

  const attivitaPerCommessa = new Map<string, { tipo: string; stato: string }[]>()
  for (const a of attivita ?? []) {
    if (!a.commessa_id) continue
    const precedenti = attivitaPerCommessa.get(a.commessa_id) ?? []
    precedenti.push({ tipo: a.tipo, stato: a.stato })
    attivitaPerCommessa.set(a.commessa_id, precedenti)
  }

  const docProduzione = (documenti ?? []).filter((d) =>
    TIPI_DOCUMENTO_PRODUZIONE_VALUES.includes(d.tipo_documento)
  )

  const cards: CommessaProduzione[] = commesse.map((c) => {
    const suoi = completi.filter((o) => o.commessa_id === c.id)
    return {
      id: c.id,
      numero_commessa: c.numero_commessa,
      cliente_nome: c.cliente_nome,
      stato: c.stato as StatoCommessa,
      data_conferma: c.data_conferma ?? null,
      ordini_aperti: suoi.filter((o) => o.stato !== 'arrivato').length,
      ordini_in_ritardo: suoi.filter((o) => o.in_ritardo).length,
      documenti: docProduzione.filter((d) => d.commessa_id === c.id).length,
      avanzamento: attivitaPerCommessa.has(c.id)
        ? calcolaAvanzamento(attivitaPerCommessa.get(c.id) ?? [], aspetti)
        : AVANZAMENTO_VUOTO,
    }
  })

  return { daFare, commesse: cards }
}

export async function getCommessaProduzione(commessaId: string): Promise<{
  id: string
  numero_commessa: string
  cliente_nome: string
  stato: StatoCommessa
} | null> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data } = await supabase
    .from('commesse')
    .select('id, numero_commessa, cliente_nome, stato')
    .eq('id', commessaId)
    .eq('organization_id', orgId)
    .maybeSingle()
  return data as { id: string; numero_commessa: string; cliente_nome: string; stato: StatoCommessa } | null
}

export async function getProssimoNumeroOrdine(): Promise<string> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const anno = new Date().getFullYear()
  const { data } = await supabase
    .from('ordini_fornitore')
    .select('numero_ordine')
    .eq('organization_id', orgId)
  return prossimoNumeroOrdine((data ?? []).map((o) => o.numero_ordine), anno)
}

async function salvaRighe(ordineId: string, orgId: string, righe: OrdineInput['righe']) {
  const supabase = await createClient()
  await supabase.from('righe_ordine_fornitore').delete().eq('ordine_id', ordineId)
  const valide = righe.filter((r) => r.descrizione.trim() !== '')
  if (valide.length === 0) return
  const { error } = await supabase.from('righe_ordine_fornitore').insert(
    valide.map((r, i) => ({
      ordine_id: ordineId,
      organization_id: orgId,
      descrizione: r.descrizione.trim(),
      codice_articolo: r.codice_articolo?.trim() || null,
      finitura: r.finitura?.trim() || null,
      quantita: r.quantita,
      unita_misura: r.unita_misura,
      prezzo_unitario: r.prezzo_unitario,
      ordine: i,
    }))
  )
  if (error) throw new Error(error.message)
}

export async function createOrdine(input: OrdineInput): Promise<string> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { righe, ...testata } = input
  const { data, error } = await supabase
    .from('ordini_fornitore')
    .insert({
      ...testata,
      numero_ordine: normalizzaNumeroOrdine(testata.numero_ordine),
      organization_id: orgId,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Errore creazione ordine')
  await salvaRighe(data.id, orgId, righe)
  revalidatePath('/produzione', 'layout')
  return data.id
}

export async function updateOrdine(id: string, input: OrdineInput): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { righe, ...testata } = input
  const { error } = await supabase
    .from('ordini_fornitore')
    .update({
      ...testata,
      numero_ordine: normalizzaNumeroOrdine(testata.numero_ordine),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  await salvaRighe(id, orgId, righe)
  revalidatePath('/produzione', 'layout')
}

export async function setStatoOrdine(id: string, stato: StatoOrdine): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('ordini_fornitore')
    .update({ stato, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/produzione', 'layout')
}

export async function deleteOrdine(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('ordini_fornitore')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/produzione', 'layout')
}

/** Archivia / ripristina una commessa (usato dal lato Produzione). */
export async function setArchiviataCommessa(commessaId: string, archiviata: boolean): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('commesse')
    .update({ archiviata })
    .eq('id', commessaId)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/produzione', 'layout')
}
