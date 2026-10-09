/**
 * Caricamenti del fornitore dal link pubblico dell'ordine, con il service
 * role. NON e' un file 'use server': queste funzioni scrivono senza sessione
 * e non devono diventare endpoint. Importare solo da route handler e Server
 * Component.
 */
import { createServiceClient } from '@/lib/supabase/service'
import { formattaNumeroOrdine } from '@/lib/produzione'
import {
  cartellaFileFornitore,
  MAX_FILE_PER_ORDINE,
  nomeFileSicuro,
  validaFileFornitore,
} from '@/lib/conferme-ordine'
import type { TipoFileFornitore } from '@/types/produzione'

const BUCKET = 'commesse-docs'

type OrdinePubblico = {
  id: string
  organizationId: string
  commessaId: string | null
  numeroOrdine: string
  fornitoreNome: string | null
}

async function getOrdinePubblico(token: string): Promise<OrdinePubblico | null> {
  // Un token che non e' un uuid farebbe fallire la query con un errore di
  // tipo: meglio un "non trovato" pulito.
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null
  const service = createServiceClient()
  const { data } = await service
    .from('ordini_fornitore')
    .select('id, organization_id, commessa_id, numero_ordine, fornitore_id')
    .eq('tracking_token', token)
    .maybeSingle()
  if (!data) return null
  const { data: fornitore } = data.fornitore_id
    ? await service.from('fornitori').select('nome').eq('id', data.fornitore_id).maybeSingle()
    : { data: null }
  return {
    id: data.id,
    organizationId: data.organization_id,
    commessaId: data.commessa_id,
    numeroOrdine: data.numero_ordine,
    fornitoreNome: (fornitore as { nome?: string } | null)?.nome ?? null,
  }
}

export type EsitoPreparazione =
  | { ok: true; path: string; uploadToken: string }
  | { ok: false; errore: string; status: number }

type Errore = { ok: false; errore: string; status: number }

/** Controlli comuni alle due strade di caricamento e path del nuovo file. */
async function percorsoNuovoFile(
  token: string,
  tipo: TipoFileFornitore,
  nome: string,
  contentType: string,
  dimensione: number
): Promise<{ ok: true; path: string } | Errore> {
  const ordine = await getOrdinePubblico(token)
  if (!ordine) return { ok: false, errore: 'Ordine non trovato', status: 404 }

  const errore = validaFileFornitore(contentType, dimensione)
  if (errore) return { ok: false, errore, status: 400 }

  const service = createServiceClient()
  const { count } = await service
    .from('file_fornitore_ordine')
    .select('id', { count: 'exact', head: true })
    .eq('ordine_id', ordine.id)
  if ((count ?? 0) >= MAX_FILE_PER_ORDINE) {
    return { ok: false, errore: 'Troppi file per questo ordine: contattateci', status: 429 }
  }

  const prefisso = tipo === 'conferma' ? 'conferma' : 'documento'
  return {
    ok: true,
    path: `${cartellaFileFornitore(ordine.organizationId, ordine.id)}${Date.now()}-${prefisso}-${nomeFileSicuro(nome)}`,
  }
}

/**
 * Primo passo del caricamento: controlla formato e dimensione e restituisce
 * un URL di upload firmato. Il file va su Storage direttamente dal browser:
 * passando dalla function, sopra i ~4,5 MB la richiesta morirebbe in silenzio.
 */
export async function preparaCaricamento(
  token: string,
  tipo: TipoFileFornitore,
  nome: string,
  contentType: string,
  dimensione: number
): Promise<EsitoPreparazione> {
  const esito = await percorsoNuovoFile(token, tipo, nome, contentType, dimensione)
  if (!esito.ok) return esito

  const { data, error } = await createServiceClient()
    .storage.from(BUCKET)
    .createSignedUploadUrl(esito.path)
  if (error || !data) {
    return { ok: false, errore: 'Caricamento non disponibile, riprovate tra poco', status: 500 }
  }
  return { ok: true, path: data.path, uploadToken: data.token }
}

/**
 * Ripiego quando il browser non riesce a mandare il file direttamente a
 * Storage (rete aziendale che blocca il dominio di Supabase, browser che
 * interrompe l'invio): il file passa dal nostro server. Vale solo sotto i
 * ~4,5 MB del corpo di una function Vercel, il client lo sa e non ci prova
 * con file piu' grandi.
 */
export async function caricaDalServer(
  token: string,
  tipo: TipoFileFornitore,
  nome: string,
  contentType: string,
  contenuto: ArrayBuffer
): Promise<{ ok: true } | Errore> {
  const esito = await percorsoNuovoFile(token, tipo, nome, contentType, contenuto.byteLength)
  if (!esito.ok) return esito

  const { error } = await createServiceClient()
    .storage.from(BUCKET)
    .upload(esito.path, contenuto, { contentType, upsert: false })
  if (error) {
    console.error('[file fornitore] upload dal server:', error.message)
    return { ok: false, errore: 'Caricamento non riuscito, riprovate tra poco', status: 500 }
  }
  return registraCaricamento(token, tipo, esito.path, nome)
}

/**
 * Secondo passo: il file e' su Storage, lo si registra sull'ordine.
 * Il path deve stare nella cartella del fornitore di QUESTO ordine e il
 * file deve esistere davvero: dimensione e formato si rileggono da Storage,
 * non si prendono per buoni dal browser.
 */
export async function registraCaricamento(
  token: string,
  tipo: TipoFileFornitore,
  path: string,
  nome: string
): Promise<{ ok: true } | { ok: false; errore: string; status: number }> {
  const ordine = await getOrdinePubblico(token)
  if (!ordine) return { ok: false, errore: 'Ordine non trovato', status: 404 }

  const cartella = cartellaFileFornitore(ordine.organizationId, ordine.id)
  const nomeOggetto = path.slice(cartella.length)
  if (!path.startsWith(cartella) || !nomeOggetto || nomeOggetto.includes('/')) {
    return { ok: false, errore: 'Percorso non valido', status: 400 }
  }

  const service = createServiceClient()
  const { data: elenco } = await service.storage
    .from(BUCKET)
    .list(cartella.slice(0, -1), { search: nomeOggetto, limit: 5 })
  const oggetto = (elenco ?? []).find((o) => o.name === nomeOggetto)
  if (!oggetto) return { ok: false, errore: 'File non arrivato, riprovate', status: 400 }

  const meta = (oggetto.metadata ?? {}) as { size?: number; mimetype?: string }
  const contentType = meta.mimetype ?? 'application/octet-stream'
  const dimensione = Number(meta.size ?? 0)
  const errore = validaFileFornitore(contentType, dimensione)
  if (errore) {
    await service.storage.from(BUCKET).remove([path])
    return { ok: false, errore, status: 400 }
  }

  // Doppio invio dello stesso file (doppio click, rete che ritenta): una riga sola.
  const { data: gia } = await service
    .from('file_fornitore_ordine')
    .select('id')
    .eq('ordine_id', ordine.id)
    .eq('storage_path', path)
    .maybeSingle()
  if (gia) return { ok: true }

  const nomeVisibile = nome.trim().slice(0, 200) || nomeOggetto

  const { error } = await service.from('file_fornitore_ordine').insert({
    organization_id: ordine.organizationId,
    ordine_id: ordine.id,
    tipo,
    storage_path: path,
    nome_file: nomeVisibile,
    content_type: contentType,
    dimensione,
    caricato_da: 'fornitore',
    stato: tipo === 'conferma' ? 'da_firmare' : null,
  })
  if (error) {
    console.error('[file fornitore] insert:', error.message)
    return { ok: false, errore: 'Registrazione non riuscita, riprovate', status: 500 }
  }

  if (tipo === 'conferma') {
    // Una conferma nuova prende il posto di quella che aspettava ancora la
    // firma: firmare la vecchia vorrebbe dire accettare condizioni superate.
    // Le superate non servono a nessuno e si cancellano subito.
    const { data: inserita } = await service
      .from('file_fornitore_ordine')
      .select('id')
      .eq('ordine_id', ordine.id)
      .eq('storage_path', path)
      .maybeSingle()
    if (inserita) await eliminaConfermeNonFirmate(ordine.id, inserita.id)
  }

  // Solo DDT e documenti entrano subito tra i documenti della commessa: la
  // conferma ci entra una volta firmata, ed e' l'unica copia che resta.
  if (tipo === 'documento' && ordine.commessaId) {
    const numero = formattaNumeroOrdine(ordine.numeroOrdine)
    const { error: docError } = await service.from('documenti_commessa').insert({
      commessa_id: ordine.commessaId,
      organization_id: ordine.organizationId,
      nome_file: `Documento fornitore ${numero} - ${nomeVisibile}`.slice(0, 250),
      storage_path: path,
      tipo_documento: 'documento_fornitore',
    })
    if (docError) console.error('[file fornitore] documento commessa:', docError.message)
  }

  return { ok: true }
}

/**
 * Cancella file e righe delle conferme non firmate di un ordine (da firmare o
 * superate), tranne `tenere`. In archivio deve restare solo la copia firmata:
 * gli originali del fornitore occuperebbero spazio senza servire a niente.
 */
export async function eliminaConfermeNonFirmate(ordineId: string, tenere: string | null): Promise<void> {
  const service = createServiceClient()
  const { data } = await service
    .from('file_fornitore_ordine')
    .select('id, storage_path')
    .eq('ordine_id', ordineId)
    .eq('tipo', 'conferma')
    .in('stato', ['da_firmare', 'sostituita'])
  const daTogliere = (data ?? []).filter((r) => r.id !== tenere)
  if (daTogliere.length === 0) return
  await togliFile(daTogliere.map((r) => r.storage_path as string))
  const { error } = await service
    .from('file_fornitore_ordine')
    .delete()
    .in('id', daTogliere.map((r) => r.id))
  if (error) console.error('[conferme] eliminazione righe:', error.message)
}

/**
 * Dopo la firma: via l'originale del fornitore, la riga punta alla copia
 * firmata. Via anche le altre conferme non firmate dello stesso ordine.
 */
export async function teniSoloFirmata(confermaId: string, pathFirmato: string): Promise<void> {
  const service = createServiceClient()
  const { data } = await service
    .from('file_fornitore_ordine')
    .select('ordine_id, storage_path')
    .eq('id', confermaId)
    .maybeSingle()
  if (!data) return
  if (data.storage_path !== pathFirmato) {
    await togliFile([data.storage_path as string])
    const { error } = await service
      .from('file_fornitore_ordine')
      .update({ storage_path: pathFirmato, content_type: 'application/pdf' })
      .eq('id', confermaId)
    if (error) console.error('[conferme] riga firmata:', error.message)
  }
  await eliminaConfermeNonFirmate(data.ordine_id as string, confermaId)
}

/** File via da Storage, con le eventuali voci tra i documenti di commessa. */
async function togliFile(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const service = createServiceClient()
  const { error } = await service.storage.from(BUCKET).remove(paths)
  if (error) console.error('[conferme] rimozione file:', error.message)
  await service.from('documenti_commessa').delete().in('storage_path', paths)
}

export type ConfermaFirmataPubblica = {
  id: string
  organizationId: string
  numeroOrdine: string
  firmataPath: string
  firmataAt: string | null
  note: string | null
  denominazione: string
}

/** L'ultima conferma firmata dal gestionale, per la pagina del fornitore. */
export async function getConfermaFirmataPubblica(token: string): Promise<ConfermaFirmataPubblica | null> {
  const ordine = await getOrdinePubblico(token)
  if (!ordine) return null
  const service = createServiceClient()
  const [{ data }, { data: settings }] = await Promise.all([
    service
      .from('file_fornitore_ordine')
      .select('id, firmata_path, firmata_at, note_firma')
      .eq('ordine_id', ordine.id)
      .eq('stato', 'firmata')
      .order('firmata_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    service
      .from('settings')
      .select('denominazione')
      .eq('organization_id', ordine.organizationId)
      .maybeSingle(),
  ])
  if (!data?.firmata_path) return null
  return {
    id: data.id,
    organizationId: ordine.organizationId,
    numeroOrdine: formattaNumeroOrdine(ordine.numeroOrdine),
    firmataPath: data.firmata_path,
    firmataAt: data.firmata_at,
    note: data.note_firma,
    denominazione: settings?.denominazione ?? 'A.L.M. Infissi',
  }
}

/**
 * Il fornitore ha aperto la conferma firmata. Si chiama solo dal beacon
 * client-side o dal download: i filtri antispam che visitano i link senza
 * eseguire JavaScript non devono produrre letture mai avvenute.
 */
export async function registraAperturaConferma(confermaId: string): Promise<void> {
  try {
    const service = createServiceClient()
    const { data } = await service
      .from('file_fornitore_ordine')
      .select('letta_at, aperture')
      .eq('id', confermaId)
      .maybeSingle()
    if (!data) return
    await service
      .from('file_fornitore_ordine')
      .update({
        letta_at: data.letta_at ?? new Date().toISOString(),
        aperture: (data.aperture ?? 0) + 1,
      })
      .eq('id', confermaId)
  } catch (e) {
    console.error('[conferma firmata] apertura:', e instanceof Error ? e.message : e)
  }
}
