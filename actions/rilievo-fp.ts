'use server'

import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { selectAll } from '@/lib/supabase/paginate'
import { alberoLeggero, type ArricchimentoAlbero, type GruppoFp } from '@/lib/fppro/rilievo-fp'
import { chiaveKit, gruppoDaDati, kitPerNome } from '@/lib/fppro/kit-catalogo'
import type { AccessorioAColore } from '@/lib/fppro/opzioni-voce'
import { accessoriDaCatalogo, type RigaKitCatalogo } from '@/lib/fppro/calcolo/accessori'
import type { NodoStruttura } from '@/lib/fppro/strutture-xml'
import type {
  EliminatoFp, PosizioneFp, PreferenzaFp, RilievoFp, TabellaCatalogoLocale, VoceFp, VoceFpDati,
} from '@/types/rilievo-fp'
import type { ClienteSnapshotRilievo } from '@/types/rilievo-veloce'
import { dimensionePagina } from '@/lib/fppro/scelta'

const BLOCCO_ID = 100
const messaggio = (e: unknown, riserva: string) => (e instanceof Error ? e.message : riserva)
const iso = (s: string) => new Date(s).toISOString()

// Profili di telaio (8050) e di anta (8090 battente, 8100 scorrevole) per gli elenchi della voce.
const UTILIZZI_PROFILI = [8050, 8090, 8100]
const UTILIZZO_PROFILI = Array.from({ length: 10 }, (_, i) => `dati->>utilizzo${i + 1}.in.(${UTILIZZI_PROFILI.join(',')})`).join(',')

const utilizziProfilo = (dati: Record<string, unknown> | null): number[] =>
  Array.from({ length: 10 }, (_, i) => Number(dati?.[`utilizzo${i + 1}`] ?? 0)).filter(u => u > 0)

const blocchi = <T,>(righe: T[], n: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < righe.length; i += n) out.push(righe.slice(i, i + n))
  return out
}

type ClientSupabase = Awaited<ReturnType<typeof createClient>>

/**
 * Dati del catalogo per l'albero del telefono (opzioni semplici della voce):
 * - righe dal catalogo per i kit senza righe nello STR (FP PRO scrive solo quelle del kit
 *   confermato), limitate alle serie della struttura;
 * - gruppo di alternative dei kit e degli accessori facoltativi, con nome e tipo (fp_kit_gruppi);
 * - quali accessori hanno un prezzo per colore (fp_accessori_a_colore).
 * I kit si cercano per nome senza maiuscole (kitPerNome).
 */
async function arricchimentoAlberi(supabase: ClientSupabase, orgId: string, alberi: NodoStruttura[][]): Promise<(serie: string[]) => ArricchimentoAlbero> {
  const tutti = (nodi: NodoStruttura[]): NodoStruttura[] => nodi.flatMap(n => [n, ...tutti(n.figli)])
  const nodi = alberi.flatMap(tutti)
  const nomi = new Set(nodi.flatMap(n => n.kit.map(k => chiaveKit(k.codice))))

  const tuttiKit = await selectAll<{ fp_id: number; nome: string; gruppo: string | null }>((da, a) =>
    supabase.from('fp_kit').select('fp_id, nome, gruppo:dati->>raggruppamentoid').eq('organization_id', orgId).eq('presente', true)
      .order('fp_id').range(da, a) as unknown as PromiseLike<{ data: { fp_id: number; nome: string; gruppo: string | null }[] | null; error: { message: string } | null }>)
  const perNome = kitPerNome(tuttiKit.filter(k => nomi.has(chiaveKit(k.nome))).map(k => ({ ...k, gruppo: gruppoDaDati({ raggruppamentoid: k.gruppo }) })))
  const gruppiFp = await selectAll<{ fp_id: number; descrizione: string | null; tipo: number | null }>((da, a) =>
    supabase.from('fp_kit_gruppi').select('fp_id, descrizione, tipo').eq('organization_id', orgId).eq('presente', true)
      .order('fp_id').range(da, a) as unknown as PromiseLike<{ data: { fp_id: number; descrizione: string | null; tipo: number | null }[] | null; error: { message: string } | null }>)
  const gruppo = new Map(gruppiFp.map(g => [g.fp_id, { id: g.fp_id, tipo: g.tipo, nome: g.descrizione }]))
  const gruppoDa = (id: number | null | undefined): GruppoFp | null => (id ? gruppo.get(id) ?? { id, tipo: null, nome: null } : null)

  // Righe dei kit (tutte: servono anche i codici a colore e i gruppi degli accessori dello STR).
  // Di dati solo i campi usati: fp_kit_righe.dati e' la meta' del peso del catalogo.
  const nomeDiId = new Map([...perNome.entries()].map(([nome, k]) => [k.fp_id, nome]))
  const perKit = new Map<string, (RigaKitCatalogo & { serie: string[] | null })[]>()
  for (const idBlocco of blocchi([...nomeDiId.keys()], BLOCCO_ID)) {
    type Riga = Omit<RigaKitCatalogo, 'dati'> & { kit_fp_id: number; gruppoid: string | null; descr: string | null; dim_calc: string | null; dimrifdist: string | null }
    const righe = await selectAll<Riga>((da, a) => supabase.from('fp_kit_righe')
      .select('fp_id, kit_fp_id, codice, tipo, quantita, opzionale, dim_rif, lim_inf, lim_sup, passo, formula_r, formula_dist, gruppoid:dati->>gruppoid, descr:dati->>descr, dim_calc:dati->>dim_calc, dimrifdist:dati->>dimrifdist')
      .eq('organization_id', orgId).eq('presente', true).in('kit_fp_id', idBlocco).order('fp_id').range(da, a) as unknown as PromiseLike<{ data: Riga[] | null; error: { message: string } | null }>)
    const serie = new Map<number, string[]>()
    for (const rb of blocchi(righe.map(r => r.fp_id), BLOCCO_ID)) {
      const { data: s, error: e3 } = await supabase.from('fp_kit_righe_serie').select('riga_fp_id, serie')
        .eq('organization_id', orgId).eq('presente', true).in('riga_fp_id', rb)
      if (e3) throw new Error(e3.message)
      for (const x of s ?? []) serie.set(x.riga_fp_id as number, [...(serie.get(x.riga_fp_id as number) ?? []), x.serie as string])
    }
    for (const r of righe) {
      const nome = nomeDiId.get(r.kit_fp_id)
      if (!nome) continue
      const { gruppoid, descr, dim_calc, dimrifdist, ...resto } = r
      const riga = { ...resto, dati: { gruppoid, descr, dim_calc, dimrifdist }, serie: serie.get(r.fp_id) ?? null }
      perKit.set(nome, [...(perKit.get(nome) ?? []), riga])
    }
  }

  // Accessori a colore tra quelli citati (STR e catalogo).
  const codici = new Set<string>()
  for (const n of nodi) {
    n.accessori.forEach(x => codici.add(x.codice))
    n.kit.forEach(k => k.accessori.forEach(x => codici.add(x.codice)))
  }
  for (const righe of perKit.values()) righe.forEach(r => codici.add(r.codice))
  const aColore = new Set<string>()
  for (const blocco of blocchi([...codici], BLOCCO_ID)) {
    const { data, error } = await supabase.from('fp_accessori_a_colore').select('codice').eq('organization_id', orgId).in('codice', blocco)
    if (error) throw new Error(error.message)
    for (const x of data ?? []) aColore.add(x.codice as string)
  }

  const gruppoRiga = new Map<string, number>()
  for (const [nome, righe] of perKit) {
    for (const r of righe) {
      const g = Number(r.dati?.gruppoid ?? 0)
      if (g > 0 && !gruppoRiga.has(`${nome}\u0000${r.codice}`)) gruppoRiga.set(`${nome}\u0000${r.codice}`, g)
    }
  }
  return (serieStruttura: string[]) => ({
    righeCatalogo: kit => accessoriDaCatalogo((perKit.get(chiaveKit(kit)) ?? []).filter(r => r.serie === null || r.serie.some(x => serieStruttura.includes(x)))),
    gruppoKit: kit => gruppoDa(perNome.get(chiaveKit(kit))?.gruppo),
    gruppoAccessorio: (kit, codice) => gruppoDa(gruppoRiga.get(`${chiaveKit(kit)}\u0000${codice}`)),
    aColore: codice => aColore.has(codice),
  })
}

/**
 * Catalogo per il telefono, a pagine, in ordine di segno del server (scritto da un trigger
 * a ogni modifica). `da` = dove ripartire: con `chiave` null si rilegge da quel segno in
 * poi (margine), altrimenti si continua dopo l'ultima riga letta (segno, chiave).
 */
export async function scaricaCatalogo(
  tabella: TabellaCatalogoLocale,
  da: PosizioneFp | null,
): Promise<{ righe: unknown[]; ultima: PosizioneFp | null; fine: boolean; adesso: string } | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    const chiave = tabella === 'fp_strutture' ? 'id' : 'fp_id'
    const base = (nome: string, campi: string) => {
      let q = supabase.from(nome).select(`${campi}, segno_server`).eq('organization_id', orgId)
      if (da && da.chiave === null) q = q.gte('segno_server', da.segno)
      if (da && da.chiave !== null) {
        q = q.or(`segno_server.gt."${da.segno}",and(segno_server.eq."${da.segno}",${chiave}.gt."${da.chiave}")`)
      }
      return q
    }
    const query =
      tabella === 'fp_strutture'
        ? base('fp_strutture', 'id, percorso, cartella, nome, codice, descrizione, serie, l_nominale, h_nominale, albero, poligoni, immagine, tempi, presente').is('errore', null)
        : tabella === 'fp_colori'
          ? base('fp_colori', 'fp_id, descrizione, per_profili, per_accessori, presente').or('per_profili.eq.true,per_accessori.eq.true')
          : tabella === 'fp_vetri'
            ? base('fp_vetri', 'fp_id, codice, descrizione, presente')
            : tabella === 'fp_pannelli'
              ? base('fp_pannelli', 'fp_id, codice, descrizione, presente')
            : tabella === 'fp_telai'
              ? base('fp_profili', 'fp_id, serie_fp_id, codice, descrizione, presente, dati').or(UTILIZZO_PROFILI)
              : tabella === 'fp_sezioni'
                ? base('fp_profili_sezioni', 'fp_id, codice, anteprima, presente').not('anteprima', 'is', null)
                : base('fp_serie', 'fp_id, nome, descrizione, presente')
    const { data, error } = await query.order('segno_server').order(chiave).limit(dimensionePagina(tabella))
    if (error) return { errore: error.message }
    const grezze = (data ?? []) as unknown as (Record<string, unknown> & { segno_server: string })[]
    const arricchisci = tabella === 'fp_strutture' ? await arricchimentoAlberi(supabase, orgId, grezze.map(r => r.albero as NodoStruttura[])) : null
    const righe = tabella === 'fp_strutture'
      ? grezze.map(r => ({ ...r, albero: alberoLeggero(r.albero as NodoStruttura[], arricchisci!(r.serie as string[])) }))
      : tabella === 'fp_telai'
        // Al telefono non serve tutto `dati`: solo gli utilizzi del profilo.
        ? grezze.map(({ dati, ...r }) => ({ ...r, utilizzi: utilizziProfilo(dati as Record<string, unknown> | null) }))
        : grezze
    const ultima = grezze.length > 0
      ? { segno: grezze[grezze.length - 1].segno_server, chiave: String(grezze[grezze.length - 1][chiave]) }
      : null
    return { righe, ultima, fine: grezze.length < dimensionePagina(tabella), adesso: new Date().toISOString() }
  } catch (e) {
    return { errore: messaggio(e, 'Scaricamento non riuscito') }
  }
}

export async function firmeImmagini(paths: string[]): Promise<{ url: Record<string, string> } | { errore: string }> {
  try {
    if (paths.length === 0) return { url: {} }
    const supabase = await createClient()
    const { data, error } = await supabase.storage.from('fp-strutture').createSignedUrls(paths.slice(0, 200), 3600)
    if (error) return { errore: error.message }
    const url: Record<string, string> = {}
    for (const d of data ?? []) if (d.path && d.signedUrl) url[d.path] = d.signedUrl
    return { url }
  } catch (e) {
    return { errore: messaggio(e, 'Immagini non disponibili') }
  }
}

type RigaRilievo = { id: string; cliente_snapshot: ClienteSnapshotRilievo; note: string | null; data_rilievo: string | null; created_at: string; updated_at: string; segno_server: string }
type RigaVoce = { id: string; rilievo_id: string; ordine: number; voce: string | null; quantita: number; note: string | null; fp: VoceFpDati; updated_at: string; segno_server: string }
type RigaEliminato = { id: string; tipo: 'rilievo' | 'voce'; rilievo_id: string | null; segno_server: string }

/**
 * Invio dal telefono (di solito un rilievo con le sue voci): prima le eliminazioni, poi
 * upsert per id dove il telefono e' piu' recente. Righe gia' eliminate altrove non
 * vengono ricreate: tornano in `saltati` e il telefono le toglie.
 */
export async function inviaRilieviFp(p: { rilievi: RilievoFp[]; voci: VoceFp[]; eliminati: EliminatoFp[] }): Promise<{ ok: true; saltati: string[] } | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()

    for (const blocco of blocchi(p.eliminati, BLOCCO_ID)) {
      const { error: e1 } = await supabase.from('fp_rilievi_eliminati').upsert(
        blocco.map(e => ({ id: e.id, organization_id: orgId, tipo: e.tipo })),
        { onConflict: 'id', ignoreDuplicates: true },
      )
      if (e1) return { errore: e1.message }
      const voci = blocco.filter(e => e.tipo === 'voce').map(e => e.id)
      const rilievi = blocco.filter(e => e.tipo === 'rilievo').map(e => e.id)
      if (voci.length > 0) {
        const { error } = await supabase.from('rilievo_veloce_voci').delete().eq('organization_id', orgId).in('id', voci)
        if (error) return { errore: error.message }
      }
      if (rilievi.length > 0) {
        // Le voci se ne vanno con il rilievo (ON DELETE CASCADE).
        const { error } = await supabase.from('rilievi_veloci').delete().eq('organization_id', orgId).in('id', rilievi)
        if (error) return { errore: error.message }
      }
    }

    const ids = [...new Set([...p.rilievi.map(r => r.id), ...p.voci.map(v => v.id), ...p.voci.map(v => v.rilievoId)])]
    const eliminatiAltrove = new Set<string>()
    for (const blocco of blocchi(ids, BLOCCO_ID)) {
      const { data, error } = await supabase.from('fp_rilievi_eliminati').select('id').eq('organization_id', orgId).in('id', blocco)
      if (error) return { errore: error.message }
      for (const d of data ?? []) eliminatiAltrove.add(d.id)
    }
    const rilieviVivi = p.rilievi.filter(r => !eliminatiAltrove.has(r.id))
    const vociVive = p.voci.filter(v => !eliminatiAltrove.has(v.id) && !eliminatiAltrove.has(v.rilievoId))

    const piuRecenti = async <T extends { id: string; aggiornatoAt: string }>(tabella: string, righe: T[]) => {
      const server = new Map<string, string>()
      for (const blocco of blocchi(righe, BLOCCO_ID)) {
        const { data, error } = await supabase.from(tabella).select('id, updated_at').eq('organization_id', orgId).in('id', blocco.map(r => r.id))
        if (error) throw new Error(error.message)
        for (const d of data ?? []) server.set(d.id as string, d.updated_at as string)
      }
      return righe.filter(r => !server.has(r.id) || Date.parse(r.aggiornatoAt) > Date.parse(server.get(r.id)!))
    }

    const rilievi = await piuRecenti('rilievi_veloci', rilieviVivi)
    if (rilievi.length > 0) {
      const { error } = await supabase.from('rilievi_veloci').upsert(rilievi.map(r => ({
        id: r.id, organization_id: orgId, cliente_snapshot: r.cliente, note: r.note || null, data_rilievo: r.dataRilievo ?? null,
        created_at: r.creatoAt, updated_at: r.aggiornatoAt,
      })))
      if (error) return { errore: error.message }
    }
    const voci = await piuRecenti('rilievo_veloce_voci', vociVive)
    if (voci.length > 0) {
      const { error } = await supabase.from('rilievo_veloce_voci').upsert(voci.map(v => ({
        id: v.id, rilievo_id: v.rilievoId, organization_id: orgId, ordine: v.ordine, voce: v.posizione || null,
        quantita: Math.max(1, Math.round(v.quantita)), note: v.note || null, fp: v.fp, updated_at: v.aggiornatoAt,
      })))
      if (error) return { errore: error.message }
    }
    const saltati = [...p.rilievi.filter(r => !rilieviVivi.includes(r)), ...p.voci.filter(v => !vociVive.includes(v))].map(x => x.id)
    return { ok: true, saltati }
  } catch (e) {
    return { errore: messaggio(e, 'Invio non riuscito') }
  }
}

/**
 * Rilievi, voci (solo quelle nuove, con fp) ed eliminazioni con segno del server >= `da`.
 * `ultimoSegno` = segno piu' alto ricevuto: il telefono riparte da li' (meno un margine).
 */
export async function getRilieviFp(da: string | null): Promise<{
  rilievi: RilievoFp[]
  voci: VoceFp[]
  eliminati: { id: string; tipo: 'rilievo' | 'voce'; rilievoId: string | null }[]
  ultimoSegno: string | null
  adesso: string
} | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    const dal = <Q extends { gte: (c: string, v: string) => Q }>(q: Q) => (da ? q.gte('segno_server', da) : q)
    const rilievi = await selectAll<RigaRilievo>((a, b) =>
      dal(supabase.from('rilievi_veloci').select('id, cliente_snapshot, note, data_rilievo, created_at, updated_at, segno_server').eq('organization_id', orgId))
        .order('id').range(a, b))
    const voci = await selectAll<RigaVoce>((a, b) =>
      dal(supabase.from('rilievo_veloce_voci').select('id, rilievo_id, ordine, voce, quantita, note, fp, updated_at, segno_server')
        .eq('organization_id', orgId).not('fp', 'is', null))
        .order('id').range(a, b))
    const eliminati = await selectAll<RigaEliminato>((a, b) =>
      dal(supabase.from('fp_rilievi_eliminati').select('id, tipo, rilievo_id, segno_server').eq('organization_id', orgId))
        .order('id').range(a, b))
    const segni = [...rilievi, ...voci, ...eliminati].map(r => r.segno_server)
    const ultimoSegno = segni.reduce<string | null>((m, s) => (!m || Date.parse(s) > Date.parse(m) ? s : m), null)
    return {
      rilievi: rilievi.map(r => ({ id: r.id, cliente: r.cliente_snapshot, note: r.note ?? '', dataRilievo: r.data_rilievo ?? null, creatoAt: iso(r.created_at), aggiornatoAt: iso(r.updated_at) })),
      voci: voci.map(v => ({ id: v.id, rilievoId: v.rilievo_id, ordine: v.ordine, posizione: v.voce ?? '', quantita: v.quantita, note: v.note ?? '', fp: v.fp, aggiornatoAt: iso(v.updated_at) })),
      eliminati: eliminati.map(e => ({ id: e.id, tipo: e.tipo, rilievoId: e.rilievo_id })),
      ultimoSegno,
      adesso: new Date().toISOString(),
    }
  } catch (e) {
    return { errore: messaggio(e, 'Rilievi non disponibili') }
  }
}

export async function getPreferenzeFp(): Promise<PreferenzaFp[] | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    const { data, error } = await supabase.from('fp_preferenze').select('tipo, rif, ordine').eq('organization_id', orgId)
    if (error) return { errore: error.message }
    return (data ?? []).map(p => ({ id: `${p.tipo}:${p.rif}`, tipo: p.tipo as PreferenzaFp['tipo'], rif: p.rif, ordine: p.ordine }))
  } catch (e) {
    return { errore: messaggio(e, 'Preferenze non disponibili') }
  }
}

export async function impostaPreferenzaFp(tipo: PreferenzaFp['tipo'], rif: string, attiva: boolean): Promise<{ ok: true } | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    // ignoreDuplicates: una stella gia' messa (es. dal PC) non passa per un UPDATE, che le RLS non permettono.
    const { error } = attiva
      ? await supabase.from('fp_preferenze').upsert({ organization_id: orgId, tipo, rif }, { onConflict: 'organization_id,tipo,rif', ignoreDuplicates: true })
      : await supabase.from('fp_preferenze').delete().eq('organization_id', orgId).eq('tipo', tipo).eq('rif', rif)
    if (error) return { errore: error.message }
    return { ok: true }
  } catch (e) {
    return { errore: messaggio(e, 'Preferenza non salvata') }
  }
}

export interface SerieAccessoriFp { marca: string; serie: string; accessori: number }
export interface AccessorioCatalogoFp { codice: string; descrizione: string | null; serie: string | null }

/** Marchi e serie degli accessori di FP PRO (vista fp_accessori_serie), per "Aggiungi accessorio". */
export async function getSerieAccessoriFp(): Promise<SerieAccessoriFp[] | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    const righe = await selectAll<SerieAccessoriFp>((da, a) => supabase.from('fp_accessori_serie').select('marca, serie, accessori')
      .eq('organization_id', orgId).order('marca').order('serie').range(da, a) as unknown as PromiseLike<{ data: SerieAccessoriFp[] | null; error: { message: string } | null }>)
    return righe
  } catch (e) {
    return { errore: messaggio(e, 'Serie degli accessori non disponibili') }
  }
}

/**
 * Accessori del catalogo di FP PRO per marchio/serie e/o testo (codice o descrizione), al
 * massimo 100. Serve la rete: il catalogo degli accessori (~21.000) non sta nel telefono.
 */
export async function cercaAccessoriFp(f: { marca?: string | null; serie?: string | null; testo?: string }): Promise<AccessorioCatalogoFp[] | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    let q = supabase.from('fp_accessori').select('codice, descrizione, serie').eq('organization_id', orgId).eq('presente', true)
    if (f.serie) q = q.eq('serie', f.serie)
    if (f.marca) q = q.eq('dati->>marca_nome', f.marca)
    // Virgole e parentesi romperebbero il filtro "or" di PostgREST.
    const testo = (f.testo ?? '').replace(/[,()*%]/g, ' ').trim()
    if (testo) q = q.or(`codice.ilike.*${testo}*,descrizione.ilike.*${testo}*`)
    if (!f.serie && !f.marca && !testo) return []
    const { data, error } = await q.order('codice').limit(100)
    if (error) throw new Error(error.message)
    return (data ?? []) as AccessorioCatalogoFp[]
  } catch (e) {
    return { errore: messaggio(e, 'Ricerca accessori non riuscita') }
  }
}

/**
 * Accessori con un prezzo per colore accessori (vista fp_accessori_a_colore), per il telefono:
 * nella voce si mostrano solo i colori che esistono per gli accessori di quel serramento.
 * ~5.500 righe piccole: si scaricano intere a ogni aggiornamento del catalogo.
 */
export async function getAccessoriAColoreFp(): Promise<AccessorioAColore[] | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    return await selectAll<AccessorioAColore>((da, a) => supabase.from('fp_accessori_a_colore').select('codice, colori, generale')
      .eq('organization_id', orgId).order('codice').range(da, a) as unknown as PromiseLike<{ data: AccessorioAColore[] | null; error: { message: string } | null }>)
  } catch (e) {
    return { errore: messaggio(e, 'Colori degli accessori non disponibili') }
  }
}
