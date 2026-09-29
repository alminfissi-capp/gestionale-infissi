'use server'

import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { selectAll } from '@/lib/supabase/paginate'
import type { FatturaFornitore } from '@/types/fatture-fornitori'

// fic_dati resta fuori di proposito: e' il documento FiC intero, pesante e inutile all'elenco.
const COLONNE =
  'id, fic_id, tipo, numero, data, descrizione, categoria, elettronica, fornitore_fic_id, fornitore_nome, fornitore_piva, importo_netto, importo_iva, ritenuta, altra_ritenuta, importo_lordo, prossima_scadenza, ha_allegato, sincronizzata_at, rate:fatture_fornitori_rate(id, fattura_id, fic_id, importo, scadenza, stato, pagata_il, conto_fic_id, conto_nome, ordine)'

export async function getFattureFornitori(anno: number): Promise<FatturaFornitore[]> {
  const orgId = await getOrgId()
  const supabase = await createClient()
  const righe = await selectAll<FatturaFornitore>((da, a) =>
    supabase
      .from('fatture_fornitori')
      .select(COLONNE)
      .eq('organization_id', orgId)
      .gte('data', `${anno}-01-01`)
      .lte('data', `${anno}-12-31`)
      .order('data', { ascending: false })
      .order('id')
      .range(da, a),
  )
  // numeric e bigint possono arrivare come stringhe da PostgREST: si normalizzano qui.
  return righe.map((f) => ({
    ...f,
    fic_id: Number(f.fic_id),
    fornitore_fic_id: f.fornitore_fic_id === null ? null : Number(f.fornitore_fic_id),
    importo_netto: Number(f.importo_netto),
    importo_iva: Number(f.importo_iva),
    ritenuta: Number(f.ritenuta),
    altra_ritenuta: Number(f.altra_ritenuta),
    importo_lordo: Number(f.importo_lordo),
    rate: [...(f.rate ?? [])]
      .map((r) => ({ ...r, importo: Number(r.importo) }))
      .sort((x, y) => x.ordine - y.ordine),
  }))
}

export async function getAnniFattureFornitori(): Promise<number[]> {
  const orgId = await getOrgId()
  const supabase = await createClient()
  const righe = await selectAll<{ data: string }>((da, a) =>
    supabase.from('fatture_fornitori').select('data').eq('organization_id', orgId).order('id').range(da, a),
  )
  const anni = new Set(righe.map((r) => Number(r.data.slice(0, 4))))
  anni.add(new Date().getFullYear())
  return [...anni].sort((a, b) => b - a)
}
