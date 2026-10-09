'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getOrgId } from '@/lib/auth'
import { cartellaFileFornitore, validaFileFornitore } from '@/lib/conferme-ordine'
import { formattaNumeroOrdine } from '@/lib/produzione'
import { eliminaConfermeNonFirmate } from '@/lib/conferme-ordine-db'
import type { CaricamentoFallito, ConfermaDaFirmare, FileFornitoreOrdine } from '@/types/produzione'

const BUCKET = 'commesse-docs'

const COLONNE_FILE =
  'id, organization_id, ordine_id, tipo, storage_path, nome_file, content_type, dimensione, caricato_da, created_at, stato, firmata_path, firmata_at, note_firma, inviata_a, inviata_at, letta_at, aperture'

/** Il riquadro rosso del cruscotto: conferme caricate dal fornitore e non ancora firmate. */
export async function getConfermeDaFirmare(): Promise<ConfermaDaFirmare[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data: conferme } = await supabase
    .from('file_fornitore_ordine')
    .select('id, ordine_id, created_at')
    .eq('organization_id', orgId)
    .eq('stato', 'da_firmare')
    .order('created_at', { ascending: true })
  if (!conferme || conferme.length === 0) return []

  const { data: ordini } = await supabase
    .from('ordini_fornitore')
    .select('id, numero_ordine, commessa_id, fornitore_id, stato')
    .eq('organization_id', orgId)
    .in('id', [...new Set(conferme.map((c) => c.ordine_id))])
  const ordiniValidi = (ordini ?? []).filter((o) => o.stato !== 'annullato')

  const fornitoreIds = [...new Set(ordiniValidi.map((o) => o.fornitore_id).filter(Boolean))] as string[]
  const commessaIds = [...new Set(ordiniValidi.map((o) => o.commessa_id).filter(Boolean))] as string[]
  const [{ data: fornitori }, { data: commesse }] = await Promise.all([
    fornitoreIds.length
      ? supabase.from('fornitori').select('id, nome').in('id', fornitoreIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    commessaIds.length
      ? supabase.from('commesse').select('id, numero_commessa, cliente_nome').in('id', commessaIds)
      : Promise.resolve({ data: [] as { id: string; numero_commessa: string; cliente_nome: string }[] }),
  ])
  const perOrdine = new Map(ordiniValidi.map((o) => [o.id, o]))
  const nomeFornitore = new Map((fornitori ?? []).map((f) => [f.id, f.nome as string]))
  const datiCommessa = new Map((commesse ?? []).map((c) => [c.id, c]))

  return conferme.flatMap((c) => {
    const o = perOrdine.get(c.ordine_id)
    if (!o) return []
    const commessa = o.commessa_id ? datiCommessa.get(o.commessa_id) : undefined
    return [{
      id: c.id,
      ordine_id: o.id,
      commessa_id: o.commessa_id,
      numero_ordine: o.numero_ordine,
      fornitore_nome: o.fornitore_id ? nomeFornitore.get(o.fornitore_id) ?? null : null,
      numero_commessa: commessa?.numero_commessa ?? null,
      cliente_nome: commessa?.cliente_nome ?? null,
      created_at: c.created_at,
    }]
  })
}

/**
 * Il riquadro "Caricamenti non riusciti" del cruscotto: un elemento per
 * ordine e tipo di file, il piu' recente in alto.
 */
export async function getCaricamentiFalliti(): Promise<CaricamentoFallito[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data: tentativi } = await supabase
    .from('caricamenti_falliti_fornitore')
    .select('ordine_id, tipo, nome_file, errore, created_at')
    .eq('organization_id', orgId)
    .is('risolto_at', null)
    .order('created_at', { ascending: false })
  if (!tentativi || tentativi.length === 0) return []

  const { data: ordini } = await supabase
    .from('ordini_fornitore')
    .select('id, numero_ordine, commessa_id, fornitore_id, stato')
    .eq('organization_id', orgId)
    .in('id', [...new Set(tentativi.map((t) => t.ordine_id))])
  const ordiniValidi = (ordini ?? []).filter((o) => o.stato !== 'annullato')

  const fornitoreIds = [...new Set(ordiniValidi.map((o) => o.fornitore_id).filter(Boolean))] as string[]
  const commessaIds = [...new Set(ordiniValidi.map((o) => o.commessa_id).filter(Boolean))] as string[]
  const [{ data: fornitori }, { data: commesse }] = await Promise.all([
    fornitoreIds.length
      ? supabase.from('fornitori').select('id, nome').in('id', fornitoreIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    commessaIds.length
      ? supabase.from('commesse').select('id, numero_commessa, cliente_nome').in('id', commessaIds)
      : Promise.resolve({ data: [] as { id: string; numero_commessa: string; cliente_nome: string }[] }),
  ])
  const perOrdine = new Map(ordiniValidi.map((o) => [o.id, o]))
  const nomeFornitore = new Map((fornitori ?? []).map((f) => [f.id, f.nome as string]))
  const datiCommessa = new Map((commesse ?? []).map((c) => [c.id, c]))

  // tentativi e' gia' dal piu' recente: il primo di ogni gruppo e' l'ultimo.
  const gruppi = new Map<string, CaricamentoFallito>()
  for (const t of tentativi) {
    const o = perOrdine.get(t.ordine_id)
    if (!o) continue
    const chiave = `${t.ordine_id}:${t.tipo}`
    const gia = gruppi.get(chiave)
    if (gia) { gia.tentativi++; continue }
    const commessa = o.commessa_id ? datiCommessa.get(o.commessa_id) : undefined
    gruppi.set(chiave, {
      ordine_id: o.id,
      tipo: t.tipo as CaricamentoFallito['tipo'],
      commessa_id: o.commessa_id,
      numero_ordine: o.numero_ordine,
      fornitore_nome: o.fornitore_id ? nomeFornitore.get(o.fornitore_id) ?? null : null,
      numero_commessa: commessa?.numero_commessa ?? null,
      cliente_nome: commessa?.cliente_nome ?? null,
      tentativi: 1,
      ultimo_at: t.created_at,
      ultimo_nome_file: t.nome_file,
      ultimo_errore: t.errore,
    })
  }
  return [...gruppi.values()]
}

/** "Risolto": il problema e' stato gestito (file ricevuto per email, fornitore richiamato). */
export async function segnaCaricamentiRisolti(
  ordineId: string,
  tipo: CaricamentoFallito['tipo']
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('caricamenti_falliti_fornitore')
    .update({ risolto_at: new Date().toISOString(), risolto_da: 'utente' })
    .eq('organization_id', orgId)
    .eq('ordine_id', ordineId)
    .eq('tipo', tipo)
    .is('risolto_at', null)
  if (error) return { error: 'Operazione non riuscita' }
  revalidatePath('/produzione', 'layout')
  return {}
}

/** File del fornitore per un gruppo di ordini; ogni id richiesto e' presente nella mappa. */
export async function getFileFornitorePerOrdini(
  ordineIds: string[]
): Promise<Record<string, FileFornitoreOrdine[]>> {
  const risultato: Record<string, FileFornitoreOrdine[]> = {}
  for (const id of ordineIds) risultato[id] = []
  if (ordineIds.length === 0) return risultato

  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data } = await supabase
    .from('file_fornitore_ordine')
    .select(COLONNE_FILE)
    .eq('organization_id', orgId)
    .in('ordine_id', ordineIds)
    .order('created_at', { ascending: true })
  for (const f of (data ?? []) as FileFornitoreOrdine[]) {
    risultato[f.ordine_id]?.push(f)
  }
  return risultato
}

/** URL temporaneo (1 ora) di un file del fornitore o di una conferma firmata. */
export async function getUrlFileFornitore(path: string): Promise<string | null> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!path.startsWith(`${orgId}/`)) return null
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

export type DatiFirmaConferma = {
  conferma: FileFornitoreOrdine
  ordine: {
    id: string
    numero_ordine: string
    commessa_id: string | null
    fornitore_nome: string | null
    fornitore_email: string | null
    numero_commessa: string | null
    cliente_nome: string | null
  }
  urlConferma: string | null
  urlOrdine: string | null
  /** La copia firmata, quando c'e'. */
  urlFirmata: string | null
  /** Timbro con la firma gia' sopra: un'immagine sola. */
  timbro: string | null
  /** Versioni precedenti della conferma dello stesso ordine, per il confronto. */
  altreVersioni: { id: string; nome_file: string; created_at: string; stato: string | null }[]
}

export async function getDatiFirmaConferma(confermaId: string): Promise<DatiFirmaConferma | null> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { data: conferma } = await supabase
    .from('file_fornitore_ordine')
    .select(COLONNE_FILE)
    .eq('organization_id', orgId)
    .eq('id', confermaId)
    .eq('tipo', 'conferma')
    .maybeSingle()
  if (!conferma) return null

  const { data: ordine } = await supabase
    .from('ordini_fornitore')
    .select('id, numero_ordine, commessa_id, fornitore_id, pdf_inviato_path, pdf_path')
    .eq('organization_id', orgId)
    .eq('id', conferma.ordine_id)
    .maybeSingle()
  if (!ordine) return null

  const [{ data: fornitore }, { data: commessa }, { data: settings }, { data: versioni }] = await Promise.all([
    ordine.fornitore_id
      ? supabase.from('fornitori').select('nome, email').eq('id', ordine.fornitore_id).maybeSingle()
      : Promise.resolve({ data: null }),
    ordine.commessa_id
      ? supabase.from('commesse').select('numero_commessa, cliente_nome').eq('id', ordine.commessa_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('settings').select('timbro_conferme').eq('organization_id', orgId).maybeSingle(),
    supabase
      .from('file_fornitore_ordine')
      .select('id, nome_file, created_at, stato')
      .eq('organization_id', orgId)
      .eq('ordine_id', ordine.id)
      .eq('tipo', 'conferma')
      .neq('id', confermaId)
      .order('created_at', { ascending: false }),
  ])

  // Il fornitore ha in mano la copia congelata all'invio: e' quella da confrontare.
  const pathOrdine = (ordine.pdf_inviato_path ?? ordine.pdf_path) as string | null
  const [urlConferma, urlOrdine, urlFirmata] = await Promise.all([
    getUrlFileFornitore(conferma.storage_path),
    pathOrdine ? getUrlFileFornitore(pathOrdine) : Promise.resolve(null),
    conferma.firmata_path ? getUrlFileFornitore(conferma.firmata_path) : Promise.resolve(null),
  ])

  const f = fornitore as { nome?: string; email?: string | null } | null
  const c = commessa as { numero_commessa?: string; cliente_nome?: string } | null
  return {
    conferma: conferma as FileFornitoreOrdine,
    ordine: {
      id: ordine.id,
      numero_ordine: ordine.numero_ordine,
      commessa_id: ordine.commessa_id,
      fornitore_nome: f?.nome ?? null,
      fornitore_email: f?.email ?? null,
      numero_commessa: c?.numero_commessa ?? null,
      cliente_nome: c?.cliente_nome ?? null,
    },
    urlConferma,
    urlOrdine,
    urlFirmata,
    timbro: settings?.timbro_conferme ?? null,
    altreVersioni: versioni ?? [],
  }
}

/**
 * Conferma gia' firmata e spedita fuori dal gestionale (il fornitore l'ha
 * mandata per email): la si archivia come firmata, senza inviare nulla.
 * Il file arriva gia' su Storage dal browser, qui si controlla solo il path.
 */
export async function registraConfermaManuale(
  ordineId: string,
  file: { path: string; nome: string; contentType: string; dimensione: number }
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const cartella = cartellaFileFornitore(orgId, ordineId)
  if (!file.path.startsWith(cartella) || file.path.slice(cartella.length).includes('/')) {
    return { error: 'Percorso non valido' }
  }
  const errore = validaFileFornitore(file.contentType, file.dimensione)
  if (errore) return { error: errore }

  const { data: ordine } = await supabase
    .from('ordini_fornitore')
    .select('id, commessa_id, numero_ordine')
    .eq('organization_id', orgId)
    .eq('id', ordineId)
    .maybeSingle()
  if (!ordine) return { error: 'Ordine non trovato' }

  const { data: { user } } = await supabase.auth.getUser()
  const adesso = new Date().toISOString()

  const { error } = await supabase.from('file_fornitore_ordine').insert({
    organization_id: orgId,
    ordine_id: ordineId,
    tipo: 'conferma',
    storage_path: file.path,
    nome_file: file.nome.slice(0, 200),
    content_type: file.contentType,
    dimensione: file.dimensione,
    caricato_da: 'utente',
    stato: 'firmata_manuale',
    firmata_path: file.path,
    firmata_at: adesso,
    firmata_da: user?.id ?? null,
  })
  if (error) return { error: error.message }

  // Quella caricata a mano chiude la partita: gli originali che aspettavano
  // la firma non servono piu' e in archivio resta solo la firmata.
  await eliminaConfermeNonFirmate(ordineId, null)

  if (ordine.commessa_id) {
    await supabase.from('documenti_commessa').insert({
      commessa_id: ordine.commessa_id,
      organization_id: orgId,
      nome_file: `Conferma firmata ${formattaNumeroOrdine(ordine.numero_ordine)} - ${file.nome}`.slice(0, 250),
      storage_path: file.path,
      tipo_documento: 'conferma_ordine',
    })
  }

  revalidatePath('/produzione', 'layout')
  return {}
}

/** Data URL del timbro con firma per le conferme; null toglie l'immagine. */
export async function salvaTimbroConferme(valore: string | null): Promise<void> {
  if (valore !== null && !/^data:image\/(png|jpeg);base64,/.test(valore)) {
    throw new Error('Immagine non valida: usa PNG o JPG')
  }
  // ~700 KB di immagine: un timbro non ha bisogno di piu'.
  if (valore !== null && valore.length > 1_000_000) {
    throw new Error("Immagine troppo grande: riducila sotto i 700 KB")
  }
  const supabase = await createClient()
  const orgId = await getOrgId()
  const { error } = await supabase
    .from('settings')
    .upsert({ organization_id: orgId, timbro_conferme: valore }, { onConflict: 'organization_id' })
  if (error) throw new Error(error.message)
  revalidateTag(`settings-${orgId}`, {})
  revalidatePath('/impostazioni')
}
