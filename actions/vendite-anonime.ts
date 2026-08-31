'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getOrgId } from '@/lib/auth'
import { selectAll } from '@/lib/supabase/paginate'
import { scorporaIva, calcolaUtile } from '@/lib/vendite-anonime'
import type {
  CanaleVendita,
  MetodoPagamento,
  SezioneAnonima,
  SezioneConVendite,
  VenditaAnonima,
  VenditaAnonimaInput,
} from '@/types/commessa'

/**
 * Colonne di `commesse` che compongono una vendita anonima.
 *
 * Un solo literal, senza `+`: la concatenazione fra due stringhe restituisce
 * sempre il tipo largo `string`, e con quello Supabase non riesce a dedurre
 * la forma delle righe da `.select()` e ripiega su `GenericStringError`.
 */
const COLONNE_VENDITA =
  'id, sezione_anonima_id, data_conferma, note, canale, totale, imponibile, iva_totale, aliquota_iva, costo_materiali_manuale, costo_manodopera_manuale, utile_manuale'

/**
 * Sezione dell'organizzazione corrente, o errore.
 *
 * Serve anche il `gruppo_id` e il `nome`: la vendita eredita il blocco della
 * sezione e ci scrive dentro il nome come `cliente_nome`, cosi' una riga che
 * sfuggisse a un filtro si riconosce a colpo d'occhio invece di apparire senza
 * intestatario.
 */
async function sezionePropria(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sezioneId: string,
  orgId: string,
): Promise<SezioneAnonima> {
  const { data, error } = await supabase
    .from('sezioni_anonime')
    .select('*')
    .eq('id', sezioneId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Sezione non trovata')
  return data as SezioneAnonima
}

/** Sezioni di un blocco con dentro le loro vendite, dalla piu' recente. */
export async function getSezioniAnonime(gruppoId: string): Promise<SezioneConVendite[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data: sezioni, error } = await supabase
    .from('sezioni_anonime')
    .select('*')
    .eq('organization_id', orgId)
    .eq('gruppo_id', gruppoId)
    .order('ordine', { ascending: true })
  if (error) throw new Error(error.message)
  if (!sezioni || sezioni.length === 0) return []

  const idsSezioni = sezioni.map((s) => s.id)

  // selectAll: le vendite online sono tante per definizione e PostgREST
  // troncherebbe la lettura a 1000 righe senza dire nulla.
  const righe = await selectAll((da, a) =>
    supabase
      .from('commesse')
      .select(COLONNE_VENDITA)
      .eq('organization_id', orgId)
      .eq('anonima', true)
      .in('sezione_anonima_id', idsSezioni)
      .order('id')
      .range(da, a),
  )

  // Il metodo di pagamento sta sull'acconto, non sulla commessa.
  const idsCommesse = righe.map((r) => r.id)
  const acconti =
    idsCommesse.length === 0
      ? []
      : await selectAll((da, a) =>
          supabase
            .from('acconti_commessa')
            .select('commessa_id, metodo_pagamento')
            .eq('organization_id', orgId)
            .in('commessa_id', idsCommesse)
            .order('id')
            .range(da, a),
        )
  const metodoDi = new Map<string, MetodoPagamento>()
  for (const a of acconti) metodoDi.set(a.commessa_id, a.metodo_pagamento as MetodoPagamento)

  const perSezione = new Map<string, VenditaAnonima[]>()
  for (const r of righe) {
    if (!r.sezione_anonima_id) continue
    const lista = perSezione.get(r.sezione_anonima_id) ?? []
    lista.push({
      id: r.id,
      sezione_id: r.sezione_anonima_id,
      data: r.data_conferma,
      descrizione: r.note ?? '',
      canale: (r.canale ?? 'altro') as CanaleVendita,
      metodo_pagamento: metodoDi.get(r.id) ?? 'altro',
      lordo: Number(r.totale) || 0,
      aliquota_iva: Number(r.aliquota_iva) || 0,
      imponibile: Number(r.imponibile) || 0,
      iva: Number(r.iva_totale) || 0,
      materiale: Number(r.costo_materiali_manuale) || 0,
      manodopera: Number(r.costo_manodopera_manuale) || 0,
      utile: Number(r.utile_manuale) || 0,
    })
    perSezione.set(r.sezione_anonima_id, lista)
  }

  return sezioni.map((s) => ({
    ...(s as SezioneAnonima),
    vendite: (perSezione.get(s.id) ?? []).sort((a, b) => b.data.localeCompare(a.data)),
  }))
}

export async function createSezioneAnonima(gruppoId: string, nome: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { count } = await supabase
    .from('sezioni_anonime')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('gruppo_id', gruppoId)

  const { error } = await supabase.from('sezioni_anonime').insert({
    organization_id: orgId,
    gruppo_id: gruppoId,
    nome,
    ordine: count ?? 0,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

/**
 * Rinomina la sezione e riallinea il `cliente_nome` delle sue vendite: quel
 * campo e' una copia del nome, e lasciarlo indietro renderebbe irriconoscibili
 * le righe gia' registrate.
 */
export async function renameSezioneAnonima(id: string, nome: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error } = await supabase
    .from('sezioni_anonime')
    .update({ nome, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)

  const { error: errCommesse } = await supabase
    .from('commesse')
    .update({ cliente_nome: nome })
    .eq('organization_id', orgId)
    .eq('sezione_anonima_id', id)
  if (errCommesse) throw new Error(errCommesse.message)

  revalidatePath('/commesse', 'layout')
}

export async function deleteSezioneAnonima(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  // La FK e' ON DELETE CASCADE: senza questo controllo un clic distratto
  // porterebbe via mesi di incassi senza chiedere niente.
  const { count } = await supabase
    .from('commesse')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('sezione_anonima_id', id)
  if ((count ?? 0) > 0)
    throw new Error('La sezione contiene vendite. Eliminale prima di eliminare la sezione.')

  const { error } = await supabase
    .from('sezioni_anonime')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

export async function createVenditaAnonima(input: VenditaAnonimaInput): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const sezione = await sezionePropria(supabase, input.sezione_id, orgId)

  const { imponibile, iva } = scorporaIva(input.lordo, input.aliquota_iva)
  const utile = calcolaUtile(imponibile, input.materiale, input.manodopera)

  const { data: commessa, error } = await supabase
    .from('commesse')
    .insert({
      organization_id: orgId,
      gruppo_id: sezione.gruppo_id,
      anonima: true,
      sezione_anonima_id: sezione.id,
      canale: input.canale,
      cliente_nome: sezione.nome,
      note: input.descrizione,
      data_conferma: input.data,
      totale: input.lordo,
      imponibile,
      iva_totale: iva,
      aliquota_iva: input.aliquota_iva,
      costo_materiali_manuale: input.materiale,
      costo_manodopera_manuale: input.manodopera,
      // Scritto in colonna perche' e' da li' che il grafico costi/utile lo legge.
      // Ricalcolato a ogni salvataggio: non e' un campo che l'utente puo' forzare.
      utile_manuale: utile,
      stato: 'concluso',
      numero_commessa: '',
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  const { error: errAcconto } = await supabase.from('acconti_commessa').insert({
    commessa_id: commessa.id,
    organization_id: orgId,
    importo: input.lordo,
    data_pagamento: input.data,
    metodo_pagamento: input.metodo_pagamento,
  })
  if (errAcconto) {
    // PostgREST non da' transazioni: se l'incasso non entra, la vendita non puo'
    // restare a meta'. Senza acconto risulterebbe un credito aperto per l'intero
    // importo, e sporcherebbe il riepilogo crediti/debiti.
    await supabase.from('commesse').delete().eq('id', commessa.id).eq('organization_id', orgId)
    throw new Error(errAcconto.message)
  }

  revalidatePath('/commesse', 'layout')
}

export async function updateVenditaAnonima(
  id: string,
  input: VenditaAnonimaInput,
): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const sezione = await sezionePropria(supabase, input.sezione_id, orgId)

  const { imponibile, iva } = scorporaIva(input.lordo, input.aliquota_iva)
  const utile = calcolaUtile(imponibile, input.materiale, input.manodopera)

  const { error } = await supabase
    .from('commesse')
    .update({
      canale: input.canale,
      cliente_nome: sezione.nome,
      note: input.descrizione,
      data_conferma: input.data,
      totale: input.lordo,
      imponibile,
      iva_totale: iva,
      aliquota_iva: input.aliquota_iva,
      costo_materiali_manuale: input.materiale,
      costo_manodopera_manuale: input.manodopera,
      utile_manuale: utile,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)
    .eq('anonima', true)
  if (error) throw new Error(error.message)

  // La vendita ha un solo acconto: si aggiorna, non si ricrea, altrimenti
  // cambierebbe id e gli anticipi che lo avessero agganciato lo perderebbero.
  const { error: errAcconto } = await supabase
    .from('acconti_commessa')
    .update({
      importo: input.lordo,
      data_pagamento: input.data,
      metodo_pagamento: input.metodo_pagamento,
    })
    .eq('commessa_id', id)
    .eq('organization_id', orgId)
  if (errAcconto) throw new Error(errAcconto.message)

  revalidatePath('/commesse', 'layout')
}

export async function deleteVenditaAnonima(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  // `anonima = true` nel filtro: questa action non deve poter cancellare
  // una commessa vera nemmeno ricevendo un id sbagliato.
  const { error } = await supabase
    .from('commesse')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
    .eq('anonima', true)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}
