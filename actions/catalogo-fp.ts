'use server'

import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { getMyPermissions } from '@/lib/permessi'
import { selectAll } from '@/lib/supabase/paginate'
import { pulisciRicerca, rigaAccessorio, rigaColore, rigaProfilo, rigaVetro } from '@/lib/fppro/catalogo'
import {
  TABELLE_CONTEGGIO,
  type CatalogoFpStato, type FiltriStrutture, type RichiestaPonte, type RigaCatalogo, type SerieFp,
  type StrutturaFpDettaglio, type StrutturaFpRiga, type TabellaConteggio, type TipoCatalogo,
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

/** Gli errori tornano come testo: un'eccezione arriverebbe al browser come messaggio generico. */
export async function cercaCatalogo(
  tipo: TipoCatalogo,
  testo: string,
): Promise<{ righe: RigaCatalogo[] } | { errore: string }> {
  try {
    return { righe: await cerca(tipo, testo) }
  } catch (e) {
    return { errore: e instanceof Error ? e.message : 'Ricerca non riuscita' }
  }
}

async function cerca(tipo: TipoCatalogo, testo: string): Promise<RigaCatalogo[]> {
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

    // 50 profili x fino a ~20 colori sfiorano il tetto di 1000 righe di PostgREST:
    // senza paginare i prezzi tornerebbero troncati in silenzio.
    const ids = profili.map(p => p.fp_id)
    const [costi, { data: serie, error: e3 }] = await Promise.all([
      selectAll<{ profilo_fp_id: number; costo_kg: number | null; costo_ml: number | null }>((da, a) =>
        supabase.from('fp_profili_costi').select('id, profilo_fp_id, costo_kg, costo_ml')
          .eq('organization_id', orgId).eq('presente', true)
          .in('profilo_fp_id', ids).order('id').range(da, a),
      ),
      supabase.from('fp_serie').select('fp_id, nome').eq('organization_id', orgId),
    ])
    if (e3) throw new Error(e3.message)
    const nomeSerie = new Map((serie ?? []).map(s => [s.fp_id, s.nome]))
    return profili.map(p => rigaProfilo(
      p,
      p.serie_fp_id === null ? null : nomeSerie.get(p.serie_fp_id) ?? null,
      costi.filter(c => c.profilo_fp_id === p.fp_id),
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

const CAMPI_STRUTTURA = 'id, percorso, cartella, nome, codice, descrizione, serie, l_nominale, h_nominale, immagine, errore'
const LIMITE_STRUTTURE = 60

type RigaStrutturaDb = Omit<StrutturaFpRiga, 'immagineUrl'> & { immagine: string | null }

async function conImmagini(righe: RigaStrutturaDb[]): Promise<StrutturaFpRiga[]> {
  const supabase = await createClient()
  const percorsi = righe.map(r => r.immagine).filter((p): p is string => p !== null)
  const url = new Map<string, string>()
  if (percorsi.length > 0) {
    const { data, error } = await supabase.storage.from('fp-strutture').createSignedUrls(percorsi, 3600)
    if (error) throw new Error(error.message)
    for (const d of data ?? []) if (d.path && d.signedUrl) url.set(d.path, d.signedUrl)
  }
  return righe.map(({ immagine, ...r }) => ({ ...r, immagineUrl: immagine ? url.get(immagine) ?? null : null }))
}

export async function getFiltriStrutture(): Promise<FiltriStrutture> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const [serie, cartelle] = await Promise.all([
    supabase.from('fp_strutture_serie').select('serie, strutture').eq('organization_id', orgId).order('serie'),
    supabase.from('fp_strutture_cartelle').select('cartella, strutture').eq('organization_id', orgId).order('cartella'),
  ])
  if (serie.error) throw new Error(serie.error.message)
  if (cartelle.error) throw new Error(cartelle.error.message)
  return { serie: serie.data ?? [], cartelle: cartelle.data ?? [] }
}

export async function cercaStrutture(
  f: { serie: string | null; cartella: string | null; testo: string },
): Promise<{ strutture: StrutturaFpRiga[] } | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    let query = supabase.from('fp_strutture').select(CAMPI_STRUTTURA)
      .eq('organization_id', orgId).eq('presente', true).order('nome').limit(LIMITE_STRUTTURE)
    if (f.serie) query = query.contains('serie', [f.serie])
    if (f.cartella) query = query.eq('cartella', f.cartella)
    const q = pulisciRicerca(f.testo)
    if (q) query = query.or(['nome', 'codice', 'descrizione', 'percorso'].map(c => `${c}.ilike.%${q}%`).join(','))
    const { data, error } = await query
    if (error) return { errore: error.message }
    return { strutture: await conImmagini((data ?? []) as RigaStrutturaDb[]) }
  } catch (e) {
    return { errore: e instanceof Error ? e.message : 'Ricerca non riuscita' }
  }
}

export async function getStrutturaFp(id: string): Promise<{ struttura: StrutturaFpDettaglio } | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    const { data, error } = await supabase.from('fp_strutture')
      .select(`${CAMPI_STRUTTURA}, albero, poligoni`)
      .eq('organization_id', orgId).eq('id', id).single()
    if (error) return { errore: error.message }
    const { albero, poligoni, ...riga } = data as RigaStrutturaDb & Pick<StrutturaFpDettaglio, 'albero' | 'poligoni'>
    const [conUrl] = await conImmagini([riga])
    return { struttura: { ...conUrl, albero, poligoni } }
  } catch (e) {
    return { errore: e instanceof Error ? e.message : 'Struttura non trovata' }
  }
}
