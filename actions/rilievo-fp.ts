'use server'

import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { selectAll } from '@/lib/supabase/paginate'
import { alberoLeggero } from '@/lib/fppro/rilievo-fp'
import type { NodoStruttura } from '@/lib/fppro/strutture-xml'
import type { EliminatoFp, PreferenzaFp, RilievoFp, TabellaCatalogoLocale, VoceFp, VoceFpDati } from '@/types/rilievo-fp'
import type { ClienteSnapshotRilievo } from '@/types/rilievo-veloce'

const PAGINA = 200
const messaggio = (e: unknown, riserva: string) => (e instanceof Error ? e.message : riserva)

const UTILIZZO_TELAIO = Array.from({ length: 10 }, (_, i) => `dati->>utilizzo${i + 1}.eq.8050`).join(',')

/** Catalogo per il telefono, a pagine e solo righe cambiate dopo `dopo`. */
export async function scaricaCatalogo(
  tabella: TabellaCatalogoLocale,
  dopo: string | null,
  da: number,
): Promise<{ righe: unknown[]; fine: boolean } | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    const base = (nome: string, campi: string) => {
      let q = supabase.from(nome).select(campi).eq('organization_id', orgId)
      if (dopo) q = q.gt('sincronizzato_at', dopo)
      return q
    }
    const query =
      tabella === 'fp_strutture'
        ? base('fp_strutture', 'id, percorso, cartella, nome, codice, descrizione, serie, l_nominale, h_nominale, albero, poligoni, immagine, presente, sincronizzato_at').is('errore', null)
        : tabella === 'fp_colori'
          ? base('fp_colori', 'fp_id, descrizione, presente, sincronizzato_at').eq('per_profili', true)
          : tabella === 'fp_vetri'
            ? base('fp_vetri', 'fp_id, codice, descrizione, presente, sincronizzato_at')
            : tabella === 'fp_telai'
              ? base('fp_profili', 'fp_id, serie_fp_id, codice, descrizione, presente, sincronizzato_at').or(UTILIZZO_TELAIO)
              : base('fp_serie', 'fp_id, nome, descrizione, presente, sincronizzato_at')
    const chiave = tabella === 'fp_strutture' ? 'id' : 'fp_id'
    const { data, error } = await query.order('sincronizzato_at').order(chiave).range(da, da + PAGINA - 1)
    if (error) return { errore: error.message }
    const righe = tabella === 'fp_strutture'
      ? ((data ?? []) as unknown as { albero: NodoStruttura[] }[]).map(r => ({ ...r, albero: alberoLeggero(r.albero) }))
      : (data ?? [])
    return { righe, fine: (data ?? []).length < PAGINA }
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

type RigaRilievo = { id: string; cliente_snapshot: ClienteSnapshotRilievo; note: string | null; created_at: string; updated_at: string }
type RigaVoce = { id: string; rilievo_id: string; ordine: number; voce: string | null; quantita: number; note: string | null; fp: VoceFpDati; updated_at: string }

/** Invio dal telefono: upsert per id, vince il piu' recente; poi le eliminazioni. */
export async function inviaRilieviFp(p: { rilievi: RilievoFp[]; voci: VoceFp[]; eliminati: EliminatoFp[] }): Promise<{ ok: true } | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()

    const piuRecenti = async <T extends { id: string; aggiornatoAt: string }>(tabella: string, righe: T[]) => {
      if (righe.length === 0) return righe
      const { data, error } = await supabase.from(tabella).select('id, updated_at').in('id', righe.map(r => r.id))
      if (error) throw new Error(error.message)
      const server = new Map((data ?? []).map(d => [d.id as string, d.updated_at as string]))
      return righe.filter(r => !server.has(r.id) || new Date(r.aggiornatoAt) > new Date(server.get(r.id)!))
    }

    const rilievi = await piuRecenti('rilievi_veloci', p.rilievi)
    if (rilievi.length > 0) {
      const { error } = await supabase.from('rilievi_veloci').upsert(rilievi.map(r => ({
        id: r.id, organization_id: orgId, cliente_snapshot: r.cliente, note: r.note || null,
        created_at: r.creatoAt, updated_at: r.aggiornatoAt,
      })))
      if (error) return { errore: error.message }
    }
    const voci = await piuRecenti('rilievo_veloce_voci', p.voci)
    if (voci.length > 0) {
      const { error } = await supabase.from('rilievo_veloce_voci').upsert(voci.map(v => ({
        id: v.id, rilievo_id: v.rilievoId, organization_id: orgId, ordine: v.ordine, voce: v.posizione || null,
        quantita: v.quantita, note: v.note || null, fp: v.fp, updated_at: v.aggiornatoAt,
      })))
      if (error) return { errore: error.message }
    }
    const vociEliminate = p.eliminati.filter(e => e.tipo === 'voce').map(e => e.id)
    if (vociEliminate.length > 0) {
      const { error } = await supabase.from('rilievo_veloce_voci').delete().eq('organization_id', orgId).in('id', vociEliminate)
      if (error) return { errore: error.message }
    }
    const rilieviEliminati = p.eliminati.filter(e => e.tipo === 'rilievo').map(e => e.id)
    if (rilieviEliminati.length > 0) {
      const { error } = await supabase.from('rilievi_veloci').delete().eq('organization_id', orgId).in('id', rilieviEliminati)
      if (error) return { errore: error.message }
    }
    return { ok: true }
  } catch (e) {
    return { errore: messaggio(e, 'Invio non riuscito') }
  }
}

/** Rilievi e voci (solo quelle nuove, con fp) cambiati dopo `dopo`, per il telefono. */
export async function getRilieviFp(dopo: string | null): Promise<{ rilievi: RilievoFp[]; voci: VoceFp[] } | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    const rilievi = await selectAll<RigaRilievo>((da, a) => {
      let q = supabase.from('rilievi_veloci').select('id, cliente_snapshot, note, created_at, updated_at').eq('organization_id', orgId)
      if (dopo) q = q.gt('updated_at', dopo)
      return q.order('id').range(da, a)
    })
    const voci = await selectAll<RigaVoce>((da, a) => {
      let q = supabase.from('rilievo_veloce_voci').select('id, rilievo_id, ordine, voce, quantita, note, fp, updated_at')
        .eq('organization_id', orgId).not('fp', 'is', null)
      if (dopo) q = q.gt('updated_at', dopo)
      return q.order('id').range(da, a)
    })
    return {
      rilievi: rilievi.map(r => ({ id: r.id, cliente: r.cliente_snapshot, note: r.note ?? '', creatoAt: r.created_at, aggiornatoAt: r.updated_at })),
      voci: voci.map(v => ({ id: v.id, rilievoId: v.rilievo_id, ordine: v.ordine, posizione: v.voce ?? '', quantita: v.quantita, note: v.note ?? '', fp: v.fp, aggiornatoAt: v.updated_at })),
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
    const { error } = attiva
      ? await supabase.from('fp_preferenze').upsert({ organization_id: orgId, tipo, rif }, { onConflict: 'organization_id,tipo,rif' })
      : await supabase.from('fp_preferenze').delete().eq('organization_id', orgId).eq('tipo', tipo).eq('rif', rif)
    if (error) return { errore: error.message }
    return { ok: true }
  } catch (e) {
    return { errore: messaggio(e, 'Preferenza non salvata') }
  }
}
