'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { getOrgId } from '@/lib/auth'
import type { Scadenza, ScadenzaInput } from '@/types/commessa'

const BUCKET = 'commesse-docs'

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Aggiunge `months` mesi a una data ISO (YYYY-MM-DD), troncando il giorno all'ultimo del mese target */
function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, 1))
  base.setUTCMonth(base.getUTCMonth() + months)
  const ty = base.getUTCFullYear()
  const tm = base.getUTCMonth() // 0-based
  const ultimoGiorno = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate()
  return `${ty}-${pad2(tm + 1)}-${pad2(Math.min(d, ultimoGiorno))}`
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  pdf: 'application/pdf',
}

export async function getScadenze(gruppoId: string): Promise<Scadenza[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('scadenze')
    .select('*')
    .eq('organization_id', orgId)
    .eq('gruppo_id', gruppoId)
    .order('data_scadenza', { ascending: true })
    .order('ordine', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((s) => ({ ...s, importo: Number(s.importo) })) as Scadenza[]
}

/** Singola scadenza con il nome del conto e del blocco (per la scheda di stampa) */
export async function getScadenzaScheda(id: string): Promise<{
  scadenza: Scadenza
  contoNome: string | null
  gruppoNome: string | null
  fotoUrl: string | null
} | null> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('scadenze')
    .select('*, conti_correnti(nome), gruppi_commesse(nome)')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null

  const { conti_correnti, gruppi_commesse, ...row } = data as typeof data & {
    conti_correnti: { nome: string } | null
    gruppi_commesse: { nome: string } | null
  }

  // Per i PDF si stampa l'anteprima: la scheda sa mostrare solo immagini
  const daMostrare = row.anteprima_path ?? row.foto_path
  let fotoUrl: string | null = null
  if (daMostrare) {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(daMostrare, 3600)
    fotoUrl = signed?.signedUrl ?? null
  }

  return {
    scadenza: { ...row, importo: Number(row.importo) } as Scadenza,
    contoNome: conti_correnti?.nome ?? null,
    gruppoNome: gruppi_commesse?.nome ?? null,
    fotoUrl,
  }
}

export async function createScadenza(input: ScadenzaInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  // Le nuove scadenze vanno in fondo: ordine = max(ordine)+1 nel blocco
  const { data: maxRow } = await supabase
    .from('scadenze')
    .select('ordine')
    .eq('organization_id', orgId)
    .eq('gruppo_id', input.gruppo_id)
    .order('ordine', { ascending: false })
    .limit(1)
    .maybeSingle()
  const ordine = (maxRow?.ordine ?? 0) + 1
  const { data, error } = await supabase
    .from('scadenze')
    .insert({ ...input, ordine, organization_id: orgId })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
  return { id: data.id }
}

/** Riassegna l'ordine alle scadenze nell'ordine dato (riordino manuale su/giù) */
export async function riordinaScadenze(ids: string[]): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  await Promise.all(
    ids.map((id, i) =>
      supabase
        .from('scadenze')
        .update({ ordine: i })
        .eq('id', id)
        .eq('organization_id', orgId)
    )
  )
  revalidatePath('/commesse', 'layout')
}

export async function updateScadenza(id: string, input: Partial<ScadenzaInput>): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('scadenze')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

export async function setPagatoScadenza(id: string, pagato: boolean): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('scadenze')
    .update({ pagato, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

/**
 * Annulla (o ripristina) una scadenza.
 *
 * La riga non viene toccata: restano importo, allegato, rata e conto. Cambia
 * solo il fatto che non entra piu' in nessun totale. Annullando si toglie anche
 * la stella dei Calcoli, altrimenti resterebbe appesa in una lista da cui e'
 * comunque esclusa.
 */
export async function setAnnullataScadenza(id: string, annullata: boolean): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('scadenze')
    .update({
      annullata,
      ...(annullata ? { in_calcoli: false } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

export async function deleteScadenza(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data: row } = await supabase
    .from('scadenze')
    .select('foto_path')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (row?.foto_path) {
    await createServiceClient().storage.from(BUCKET).remove([row.foto_path])
  }
  const { error } = await supabase.from('scadenze').delete().eq('id', id).eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

/**
 * Registra un allegato gia' caricato sul bucket dal browser: qui passano solo i
 * percorsi, non il file. E' la strada normale, perche' il file non attraversa le
 * funzioni Vercel e non incontra il limite sul corpo della richiesta (~4,5 MB)
 * che fa fallire in silenzio le foto scattate col telefono.
 * Ripulisce l'allegato precedente per non lasciare file orfani.
 */
export async function setAllegatoScadenza(
  scadenzaId: string,
  fotoPath: string,
  anteprimaPath: string | null,
): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data: prev } = await supabase
    .from('scadenze')
    .select('foto_path, anteprima_path')
    .eq('id', scadenzaId)
    .eq('organization_id', orgId)
    .maybeSingle()

  const { error } = await supabase
    .from('scadenze')
    .update({
      foto_path: fotoPath,
      anteprima_path: anteprimaPath,
      updated_at: new Date().toISOString(),
    })
    .eq('id', scadenzaId)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)

  const vecchi = [prev?.foto_path, prev?.anteprima_path].filter(
    (p): p is string => !!p && p !== fotoPath && p !== anteprimaPath
  )
  if (vecchi.length > 0) {
    await createServiceClient().storage.from(BUCKET).remove(vecchi)
  }

  revalidatePath('/commesse', 'layout')
}

/** Percorso su cui il browser deve caricare l'allegato di una scadenza */
export async function getPathAllegatoScadenza(scadenzaId: string): Promise<string> {
  const orgId = await getOrgId()
  return `${orgId}/scadenze/${scadenzaId}/${Date.now()}`
}

// Ripiego: upload passando dal server (service role). Serve su iOS e Android,
// dove dentro un Dialog il client browser puo' non avere la sessione. Qui il
// file attraversa la funzione e resta soggetto al limite di dimensione.
// `anteprima` e' l'immagine della prima pagina, presente solo per i PDF:
// anteprima a schermo e scheda di stampa sanno mostrare solo immagini.
export async function uploadFotoScadenza(
  formData: FormData,
): Promise<{ error?: string; path?: string; anteprimaPath?: string | null }> {
  const file = formData.get('file') as File | null
  const anteprima = formData.get('anteprima') as File | null
  const scadenzaId = formData.get('scadenzaId') as string

  if (!file || file.size === 0) return { error: 'Nessun file selezionato' }
  if (file.size > 20 * 1024 * 1024) return { error: 'File troppo grande (max 20 MB)' }

  const orgId = await getOrgId()
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const base = `${orgId}/scadenze/${scadenzaId}/${Date.now()}`
  const storagePath = `${base}.${ext}`
  const contentType =
    file.type && file.type !== 'application/octet-stream'
      ? file.type
      : (MIME_BY_EXT[ext] ?? 'image/jpeg')

  const service = createServiceClient()

  // Rimuovi l'allegato precedente (se presente) per non lasciare orfani
  const supabase = await createClient()
  const { data: prev } = await supabase
    .from('scadenze')
    .select('foto_path, anteprima_path')
    .eq('id', scadenzaId)
    .eq('organization_id', orgId)
    .maybeSingle()

  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType })
  if (uploadError) return { error: uploadError.message }

  // L'anteprima e' un di piu': se fallisce resta il PDF, non si annulla tutto
  let anteprimaPath: string | null = null
  if (anteprima && anteprima.size > 0) {
    const p = `${base}.anteprima.jpg`
    const { error } = await service.storage
      .from(BUCKET)
      .upload(p, anteprima, { contentType: 'image/jpeg' })
    if (!error) anteprimaPath = p
  }

  const { error: dbError } = await supabase
    .from('scadenze')
    .update({
      foto_path: storagePath,
      anteprima_path: anteprimaPath,
      updated_at: new Date().toISOString(),
    })
    .eq('id', scadenzaId)
    .eq('organization_id', orgId)
  if (dbError) {
    const daPulire = anteprimaPath ? [storagePath, anteprimaPath] : [storagePath]
    await service.storage.from(BUCKET).remove(daPulire)
    return { error: dbError.message }
  }

  const vecchi = [prev?.foto_path, prev?.anteprima_path].filter(
    (p): p is string => !!p && p !== storagePath && p !== anteprimaPath
  )
  if (vecchi.length > 0) await service.storage.from(BUCKET).remove(vecchi)

  revalidatePath('/commesse', 'layout')
  return { path: storagePath, anteprimaPath }
}

export async function removeFotoScadenza(scadenzaId: string, path: string): Promise<void> {
  const orgId = await getOrgId()
  const supabase = await createClient()

  // Rileggo l'anteprima dal database: il chiamante conosce solo il file principale
  const { data: row } = await supabase
    .from('scadenze')
    .select('anteprima_path')
    .eq('id', scadenzaId)
    .eq('organization_id', orgId)
    .maybeSingle()

  const daRimuovere = [path, row?.anteprima_path].filter((p): p is string => !!p)
  await createServiceClient().storage.from(BUCKET).remove(daRimuovere)

  const { error } = await supabase
    .from('scadenze')
    .update({ foto_path: null, anteprima_path: null, updated_at: new Date().toISOString() })
    .eq('id', scadenzaId)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

export async function getFotoScadenzaUrl(path: string): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

/** Aggiunge/rimuove una scadenza dallo slot "Calcoli" */
export async function toggleCalcoliScadenza(id: string, value: boolean): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('scadenze')
    .update({ in_calcoli: value })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/commesse', 'layout')
}

/** Trova il blocco scadenze dell'anno indicato (per nome), creandolo se non esiste. Ritorna il gruppo_id. */
async function resolveGruppoScadenzeAnno(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  anno: number,
): Promise<string> {
  const nome = String(anno)
  const { data: existing } = await supabase
    .from('gruppi_commesse')
    .select('id')
    .eq('organization_id', orgId)
    .eq('tipo', 'scadenze')
    .eq('nome', nome)
    .maybeSingle()
  if (existing) return existing.id

  const { data: maxRow } = await supabase
    .from('gruppi_commesse')
    .select('ordine')
    .eq('organization_id', orgId)
    .order('ordine', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrdine = (maxRow?.ordine ?? -1) + 1
  const { data: created, error } = await supabase
    .from('gruppi_commesse')
    .insert({ nome, organization_id: orgId, ordine: nextOrdine, tipo: 'scadenze' })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return created.id
}

/**
 * Copia una scadenza rateale nei periodi successivi.
 * - `cadenzaMesi`: 1 = mensile, 3 = trimestrale
 * - `count`: quante nuove rate creare (1 = copia singola; N = genera piano)
 * - `totaleRate`: opzionale, sovrascrive il totale rate su tutte le nuove righe
 * Le rate che cadono in un anno diverso finiscono nel blocco di quell'anno (creato se manca).
 */
export async function copiaScadenzaRate(params: {
  origineId: string
  cadenzaMesi: number
  count: number
  totaleRate?: number | null
}): Promise<{ creati: number }> {
  const { origineId, cadenzaMesi, count } = params
  if (count < 1) return { creati: 0 }

  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data: orig, error: e1 } = await supabase
    .from('scadenze')
    .select('*')
    .eq('id', origineId)
    .eq('organization_id', orgId)
    .single()
  if (e1 || !orig) throw new Error(e1?.message ?? 'Scadenza non trovata')

  const baseRata = orig.numero_rata != null ? Number(orig.numero_rata) : null
  const totaleRate = params.totaleRate !== undefined ? params.totaleRate : orig.totale_rate

  // Date e numeri di rata delle nuove scadenze
  const nuove = Array.from({ length: count }, (_, i) => {
    const k = i + 1
    return {
      data_scadenza: addMonths(orig.data_scadenza, cadenzaMesi * k),
      numero_rata: baseRata != null ? baseRata + k : null,
    }
  })

  // Risolvi i blocchi per anno e inizializza l'ordine corrente di ognuno
  const gruppoPerAnno = new Map<number, string>()
  const ordineCorrente = new Map<string, number>()
  for (const n of nuove) {
    const anno = Number(n.data_scadenza.slice(0, 4))
    if (gruppoPerAnno.has(anno)) continue
    const gid = await resolveGruppoScadenzeAnno(supabase, orgId, anno)
    gruppoPerAnno.set(anno, gid)
    const { data: maxRow } = await supabase
      .from('scadenze')
      .select('ordine')
      .eq('organization_id', orgId)
      .eq('gruppo_id', gid)
      .order('ordine', { ascending: false })
      .limit(1)
      .maybeSingle()
    ordineCorrente.set(gid, maxRow?.ordine ?? 0)
  }

  const inserts = nuove.map((n) => {
    const anno = Number(n.data_scadenza.slice(0, 4))
    const gid = gruppoPerAnno.get(anno)!
    const ord = (ordineCorrente.get(gid) ?? 0) + 1
    ordineCorrente.set(gid, ord)
    return {
      organization_id: orgId,
      gruppo_id: gid,
      data_scadenza: n.data_scadenza,
      descrizione: orig.descrizione,
      fornitore: orig.fornitore,
      importo: orig.importo,
      pagato: false,
      categoria: orig.categoria,
      numero_rata: n.numero_rata,
      totale_rate: totaleRate ?? null,
      conto_id: orig.conto_id,
      foto_path: null,
      in_calcoli: false,
      ordine: ord,
    }
  })

  const { error: e2 } = await supabase.from('scadenze').insert(inserts)
  if (e2) throw new Error(e2.message)
  revalidatePath('/commesse', 'layout')
  return { creati: inserts.length }
}

/** Scadenze selezionate per i Calcoli (tutti i blocchi); le annullate non contano */
export async function getScadenzeCalcoli(): Promise<Scadenza[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data, error } = await supabase
    .from('scadenze')
    .select('*')
    .eq('organization_id', orgId)
    .eq('in_calcoli', true)
    .eq('annullata', false)
    .order('data_scadenza', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((s) => ({ ...s, importo: Number(s.importo) })) as Scadenza[]
}
