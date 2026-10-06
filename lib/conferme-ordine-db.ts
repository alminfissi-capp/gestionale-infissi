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
  const path = `${cartellaFileFornitore(ordine.organizationId, ordine.id)}${Date.now()}-${prefisso}-${nomeFileSicuro(nome)}`
  const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    return { ok: false, errore: 'Caricamento non disponibile, riprovate tra poco', status: 500 }
  }
  return { ok: true, path: data.path, uploadToken: data.token }
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

  if (tipo === 'conferma') {
    // Una conferma nuova prende il posto di quella che aspettava ancora la
    // firma: firmare la vecchia vorrebbe dire accettare condizioni superate.
    await service
      .from('file_fornitore_ordine')
      .update({ stato: 'sostituita' })
      .eq('ordine_id', ordine.id)
      .eq('tipo', 'conferma')
      .eq('stato', 'da_firmare')
  }

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

  // Nella commessa giusta: compare tra i documenti di Produzione.
  if (ordine.commessaId) {
    const numero = formattaNumeroOrdine(ordine.numeroOrdine)
    const etichetta = tipo === 'conferma' ? 'Conferma fornitore' : 'Documento fornitore'
    const { error: docError } = await service.from('documenti_commessa').insert({
      commessa_id: ordine.commessaId,
      organization_id: ordine.organizationId,
      nome_file: `${etichetta} ${numero} - ${nomeVisibile}`.slice(0, 250),
      storage_path: path,
      tipo_documento: tipo === 'conferma' ? 'conferma_ordine' : 'documento_fornitore',
    })
    if (docError) console.error('[file fornitore] documento commessa:', docError.message)
  }

  return { ok: true }
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
