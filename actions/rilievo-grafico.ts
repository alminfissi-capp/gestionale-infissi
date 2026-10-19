'use server'

import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { selectAll } from '@/lib/supabase/paginate'
import type { DisegnoGrafico, ProfiloCatalogo, RilievoGrafico } from '@/types/rilievo-grafico'

// Solo gli utilizzi del profilo (utilizzo1..10 di FP PRO), non tutta la riga originale
const CAMPI_PROFILO = 'fp_id, serie_fp_id, codice, descrizione, u1:dati->>utilizzo1, u2:dati->>utilizzo2, u3:dati->>utilizzo3, u4:dati->>utilizzo4, u5:dati->>utilizzo5, u6:dati->>utilizzo6, u7:dati->>utilizzo7, u8:dati->>utilizzo8, u9:dati->>utilizzo9, u10:dati->>utilizzo10'

const messaggio = (e: unknown, riserva: string) => (e instanceof Error ? e.message : riserva)

type Riga = {
  id: string; nome: string; cliente: string; note: string; quantita: number; disegno: DisegnoGrafico
  creato_at: string; aggiornato_at: string
}
const daRiga = (r: Riga): RilievoGrafico => ({
  id: r.id, nome: r.nome, cliente: r.cliente, note: r.note, quantita: r.quantita, disegno: r.disegno,
  creatoAt: new Date(r.creato_at).toISOString(), aggiornatoAt: new Date(r.aggiornato_at).toISOString(),
})

/** Tutti i rilievi grafici dell'azienda (sono pochi: si scaricano interi) */
export async function elencoRilieviGrafici(): Promise<{ rilievi: RilievoGrafico[] } | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    const righe = await selectAll<Riga>((da, a) => supabase.from('rilievi_grafici')
      .select('id, nome, cliente, note, quantita, disegno, creato_at, aggiornato_at')
      .eq('organization_id', orgId).order('id').range(da, a))
    return { rilievi: righe.map(daRiga) }
  } catch (e) {
    return { errore: messaggio(e, 'Rilievi grafici non disponibili') }
  }
}

/**
 * Invio dal dispositivo: prima le eliminazioni, poi i rilievi dove il dispositivo ha la
 * modifica piu' recente (una copia vecchia non sovrascrive quella fatta in ufficio).
 */
export async function inviaRilieviGrafici(p: { rilievi: RilievoGrafico[]; eliminati: string[] }): Promise<{ ok: true } | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    if (p.eliminati.length > 0) {
      const { error } = await supabase.from('rilievi_grafici').delete().eq('organization_id', orgId).in('id', p.eliminati)
      if (error) return { errore: error.message }
    }
    if (p.rilievi.length === 0) return { ok: true }
    const { data, error } = await supabase.from('rilievi_grafici').select('id, aggiornato_at')
      .eq('organization_id', orgId).in('id', p.rilievi.map(r => r.id))
    if (error) return { errore: error.message }
    const server = new Map((data ?? []).map(d => [d.id as string, new Date(d.aggiornato_at as string).getTime()]))
    const nuovi = p.rilievi.filter(r => !server.has(r.id) || new Date(r.aggiornatoAt).getTime() > server.get(r.id)!)
    if (nuovi.length === 0) return { ok: true }
    const { error: e2 } = await supabase.from('rilievi_grafici').upsert(nuovi.map(r => ({
      id: r.id, organization_id: orgId, nome: r.nome, cliente: r.cliente, note: r.note,
      quantita: Math.max(1, Math.round(r.quantita || 1)), disegno: r.disegno,
      creato_at: r.creatoAt, aggiornato_at: r.aggiornatoAt, updated_at: new Date().toISOString(),
    })), { onConflict: 'id' })
    if (e2) return { errore: e2.message }
    return { ok: true }
  } catch (e) {
    return { errore: messaggio(e, 'Invio non riuscito') }
  }
}

export interface SerieCatalogo { fpId: number; nome: string; descrizione: string | null }
export interface VetroCatalogo { fpId: number; codice: string; descrizione: string | null; spessore: number | null }

/** Serie, vetri e pannelli per l'ufficio (con la rete) */
export async function catalogoUfficio(): Promise<{ serie: SerieCatalogo[]; vetri: VetroCatalogo[]; pannelli: string[] } | { errore: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    const [serie, vetri, pannelli] = await Promise.all([
      selectAll<{ fp_id: number; nome: string; descrizione: string | null }>((da, a) => supabase.from('fp_serie')
        .select('fp_id, nome, descrizione').eq('organization_id', orgId).eq('presente', true).eq('visibile', true).order('fp_id').range(da, a)),
      selectAll<{ fp_id: number; codice: string; descrizione: string | null; spessore: unknown }>((da, a) => supabase.from('fp_vetri')
        .select('fp_id, codice, descrizione, spessore:dati->>spessore').eq('organization_id', orgId).eq('presente', true).order('fp_id').range(da, a)),
      supabase.rpc('fp_pannelli_strutture'),
    ])
    if (pannelli.error) return { errore: pannelli.error.message }
    return {
      serie: serie.map(s => ({ fpId: s.fp_id, nome: s.nome, descrizione: s.descrizione })).sort((a, b) => a.nome.localeCompare(b.nome)),
      vetri: vetri.map(v => {
        const sp = Number(v.spessore)
        return { fpId: v.fp_id, codice: v.codice, descrizione: v.descrizione, spessore: Number.isFinite(sp) ? sp : null }
      }).sort((a, b) => a.codice.localeCompare(b.codice)),
      // "PANELS\40MM.DXF" -> "40MM"
      pannelli: ((pannelli.data ?? []) as { dxf: string }[])
        .map(p => p.dxf.slice(p.dxf.lastIndexOf('\\') + 1).replace(/\.dxf$/i, ''))
        .filter((x, i, a) => a.indexOf(x) === i),
    }
  } catch (e) {
    return { errore: messaggio(e, 'Catalogo non disponibile') }
  }
}

/** Tutti i profili delle serie scelte, con gli utilizzi FP PRO e la miniatura della sezione */
export async function profiliDelleSerie(serie: number[]): Promise<{ profili: ProfiloCatalogo[] } | { errore: string }> {
  try {
    if (serie.length === 0) return { profili: [] }
    const supabase = await createClient()
    const orgId = await getOrgId()
    const righe = await selectAll<{ fp_id: number; serie_fp_id: number | null; codice: string; descrizione: string | null } & Record<string, unknown>>((da, a) =>
      supabase.from('fp_profili').select(CAMPI_PROFILO)
        .eq('organization_id', orgId).eq('presente', true).in('serie_fp_id', serie).order('fp_id').range(da, a)
        .overrideTypes<({ fp_id: number; serie_fp_id: number | null; codice: string; descrizione: string | null } & Record<string, unknown>)[], { merge: false }>())
    const ids = righe.map(r => r.fp_id)
    const anteprime = new Map<number, { viewBox: string; d: string }>()
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase.from('fp_profili_sezioni').select('fp_id, anteprima')
        .eq('organization_id', orgId).in('fp_id', ids.slice(i, i + 200)).not('anteprima', 'is', null)
      if (error) return { errore: error.message }
      for (const d of data ?? []) anteprime.set(d.fp_id as number, d.anteprima as { viewBox: string; d: string })
    }
    return {
      profili: righe.map(r => ({
        fpId: r.fp_id, serieFpId: r.serie_fp_id, codice: r.codice, descrizione: r.descrizione,
        utilizzi: Array.from({ length: 10 }, (_, i) => Number(r[`u${i + 1}`] ?? 0)).filter(u => u > 0),
        anteprima: anteprime.get(r.fp_id) ?? null,
      })),
    }
  } catch (e) {
    return { errore: messaggio(e, 'Profili non disponibili') }
  }
}
