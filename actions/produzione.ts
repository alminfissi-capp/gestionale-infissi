'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { calcolaTotaleOrdine, isInRitardo, prossimoNumeroOrdine } from '@/lib/produzione'
import { STATI_COMMESSA_APERTI, TIPI_DOCUMENTO_PRODUZIONE_VALUES } from '@/types/produzione'
import type {
  OrdineCompleto,
  OrdineConCommessa,
  OrdineInput,
  RigaOrdine,
  StatoOrdine,
  CommessaProduzione,
} from '@/types/produzione'
import type { StatoCommessa } from '@/types/commessa'

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

export async function getCruscottoProduzione(
  stati: StatoCommessa[] = STATI_COMMESSA_APERTI
): Promise<{ daFare: OrdineConCommessa[]; commesse: CommessaProduzione[] }> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data: commesse } = await supabase
    .from('commesse')
    .select('id, numero_commessa, cliente_nome, stato')
    .eq('organization_id', orgId)
    .in('stato', stati)
    .order('data_conferma', { ascending: false })

  if (!commesse || commesse.length === 0) return { daFare: [], commesse: [] }
  const commessaIds = commesse.map((c) => c.id)

  const [{ data: ordini }, { data: documenti }, fornitori] = await Promise.all([
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

  const daFare: OrdineConCommessa[] = completi
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
      ordini_aperti: suoi.filter((o) => o.stato !== 'arrivato').length,
      ordini_in_ritardo: suoi.filter((o) => o.in_ritardo).length,
      documenti: docProduzione.filter((d) => d.commessa_id === c.id).length,
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
    .insert({ ...testata, organization_id: orgId })
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
    .update({ ...testata, updated_at: new Date().toISOString() })
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
