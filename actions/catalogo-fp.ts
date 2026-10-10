'use server'

import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { getMyPermissions } from '@/lib/permessi'
import { pulisciRicerca, rigaAccessorio, rigaColore, rigaProfilo, rigaVetro } from '@/lib/fppro/catalogo'
import {
  TABELLE_CONTEGGIO,
  type CatalogoFpStato, type RichiestaPonte, type RigaCatalogo, type SerieFp, type TabellaConteggio, type TipoCatalogo,
} from '@/types/fppro'

const CAMPI_RICHIESTA = 'id, tipo, stato, automatica, created_at, iniziata_at, finita_at, errore, esito'
const LIMITE_RISULTATI = 50

export async function getCatalogoFpStato(): Promise<CatalogoFpStato> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const [stato, richieste, conteggi] = await Promise.all([
    supabase.from('fp_ponte_stato')
      .select('ultimo_segnale_at, ultima_sync_at, versione')
      .eq('organization_id', orgId).maybeSingle(),
    supabase.from('fp_ponte_richieste')
      .select(CAMPI_RICHIESTA)
      .eq('organization_id', orgId).order('created_at', { ascending: false }).limit(1),
    Promise.all(TABELLE_CONTEGGIO.map(t =>
      supabase.from(t).select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId).eq('presente', true),
    )),
  ])
  if (stato.error) throw new Error(stato.error.message)
  if (richieste.error) throw new Error(richieste.error.message)

  const perTabella = {} as Record<TabellaConteggio, number>
  TABELLE_CONTEGGIO.forEach((t, i) => { perTabella[t] = conteggi[i].count ?? 0 })

  return {
    ultimoSegnaleAt: stato.data?.ultimo_segnale_at ?? null,
    ultimaSyncAt: stato.data?.ultima_sync_at ?? null,
    versionePonte: stato.data?.versione ?? null,
    ultimaRichiesta: (richieste.data?.[0] as RichiestaPonte | undefined) ?? null,
    conteggi: perTabella,
  }
}

export async function getSerieFp(): Promise<SerieFp[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('fp_serie').select('fp_id, nome, descrizione')
    .eq('organization_id', orgId).eq('presente', true).order('nome')
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Una sola richiesta aperta alla volta (indice univoco): il secondo clic riceve quella gia' aperta. */
export async function richiediSincronizzazione(): Promise<{ richiesta: RichiestaPonte } | { errore: string }> {
  const { permessi } = await getMyPermissions()
  if (permessi.rilievo !== 'scrittura') return { errore: 'Non hai i permessi per sincronizzare il catalogo.' }

  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('fp_ponte_richieste').insert({ organization_id: orgId, tipo: 'sincronizza' })
    .select(CAMPI_RICHIESTA).single()
  if (!error) return { richiesta: data as RichiestaPonte }
  if (error.code !== '23505') return { errore: error.message }

  const { data: aperta, error: e2 } = await supabase
    .from('fp_ponte_richieste').select(CAMPI_RICHIESTA)
    .eq('organization_id', orgId).in('stato', ['in_attesa', 'in_corso']).maybeSingle()
  if (e2 || !aperta) return { errore: e2?.message ?? 'Richiesta gia\' in corso.' }
  return { richiesta: aperta as RichiestaPonte }
}

export async function cercaCatalogo(tipo: TipoCatalogo, testo: string): Promise<RigaCatalogo[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const q = pulisciRicerca(testo)
  const filtro = (campi: string[]) => campi.map(c => `${c}.ilike.%${q}%`).join(',')

  if (tipo === 'profili') {
    let query = supabase.from('fp_profili')
      .select('id, fp_id, codice, descrizione, kg_ml, serie_fp_id')
      .eq('organization_id', orgId).eq('presente', true).order('codice').limit(LIMITE_RISULTATI)
    if (q) query = query.or(filtro(['codice', 'descrizione']))
    const { data: profili, error } = await query
    if (error) throw new Error(error.message)
    if (!profili?.length) return []

    const [{ data: costi, error: e2 }, { data: serie, error: e3 }] = await Promise.all([
      supabase.from('fp_profili_costi').select('profilo_fp_id, costo_kg, costo_ml')
        .eq('organization_id', orgId).eq('presente', true)
        .in('profilo_fp_id', profili.map(p => p.fp_id)),
      supabase.from('fp_serie').select('fp_id, nome').eq('organization_id', orgId),
    ])
    if (e2) throw new Error(e2.message)
    if (e3) throw new Error(e3.message)
    const nomeSerie = new Map((serie ?? []).map(s => [s.fp_id, s.nome]))
    return profili.map(p => rigaProfilo(
      p,
      p.serie_fp_id === null ? null : nomeSerie.get(p.serie_fp_id) ?? null,
      (costi ?? []).filter(c => c.profilo_fp_id === p.fp_id),
    ))
  }

  if (tipo === 'accessori') {
    let query = supabase.from('fp_accessori')
      .select('id, codice, descrizione, serie, prezzo, unita_vendita')
      .eq('organization_id', orgId).eq('presente', true).order('codice').limit(LIMITE_RISULTATI)
    if (q) query = query.or(filtro(['codice', 'descrizione', 'serie']))
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data ?? []).map(rigaAccessorio)
  }

  if (tipo === 'vetri') {
    let query = supabase.from('fp_vetri')
      .select('id, codice, descrizione, prezzo_mq, min_fatt, spessore')
      .eq('organization_id', orgId).eq('presente', true).order('codice').limit(LIMITE_RISULTATI)
    if (q) query = query.or(filtro(['codice', 'descrizione']))
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data ?? []).map(rigaVetro)
  }

  let query = supabase.from('fp_colori')
    .select('id, descrizione, costo_kg, per_profili, per_accessori, per_vetri')
    .eq('organization_id', orgId).eq('presente', true).order('descrizione').limit(LIMITE_RISULTATI)
  if (q) query = query.ilike('descrizione', `%${q}%`)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(rigaColore)
}
