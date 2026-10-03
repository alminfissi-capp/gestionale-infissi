'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getOrgId } from '@/lib/auth'
import { getMyPermissions } from '@/lib/permessi'
import { selectAll } from '@/lib/supabase/paginate'
import { creaClientFic, FicNonAutorizzato, FicTroppeRichieste } from '@/lib/fic/client'
import { sincronizza, messaggioParziale, type ArchivioFatture } from '@/lib/fic/sincronizza'
import type { VoceLocale } from '@/lib/fic/confronto'
import { salvaDocumenti } from '@/lib/fic/salvataggio'
import { tabelleSupabase } from '@/lib/fic/tabelle-supabase'
import { erroreAnticipo, erroreDataSincronizzaDal } from '@/lib/fic/validazione'
import { oggiRoma } from '@/lib/fic/stato-pagamento'
import {
  CONTEGGI_VUOTI,
  type AziendaFic,
  type CollegamentoFic,
  type EsitoSincronizzazione,
} from '@/types/fatture-fornitori'

export type RisultatoVerificaFic = { ok: true; aziende: AziendaFic[] } | { ok: false; errore: string }
export type RisultatoFic = { ok: true } | { ok: false; errore: string; richiedeConferma?: boolean }

/** Sotto le 300 chiamate ogni 5 minuti di FiC, con margine per l'elenco. */
const BUDGET_CHIAMATE = 250
/** Sotto il maxDuration (300 s) della pagina da cui parte la sincronizzazione. */
const LIMITE_MS = 240_000
/** Oltre questo tempo un blocco rimasto appeso (funzione uccisa) si considera scaduto. */
const BLOCCO_MS = 5 * 60_000
const LOTTO_DB = 200

const COLONNE_COLLEGAMENTO =
  'fic_company_id, fic_company_nome, token_finale, sincronizza_dal, stato, sync_in_corso_da, ultima_sync_at, ultimo_esito, ultimo_esito_at, ultimo_messaggio, ultimi_conteggi'

async function erroreSeNonPuoiModificareImpostazioni(): Promise<string | null> {
  const { permessi } = await getMyPermissions()
  return permessi.impostazioni === 'scrittura' ? null : 'Non autorizzato a modificare le impostazioni'
}

/** Il token esce dal Vault solo qui, lato server, e solo per l'organizzazione dell'utente. */
async function leggiToken(svc: SupabaseClient, orgId: string): Promise<string> {
  const { data, error } = await svc.rpc('fic_leggi_token', { p_org: orgId })
  if (error) throw new Error(error.message)
  if (!data) throw new FicNonAutorizzato()
  return data as string
}

function messaggioErrore(e: unknown): string {
  if (e instanceof FicNonAutorizzato) return 'Token non valido, revocato o senza i permessi necessari'
  if (e instanceof FicTroppeRichieste) return 'Troppe richieste a Fatture in Cloud: riprova fra qualche minuto'
  return e instanceof Error ? e.message : 'Errore sconosciuto'
}

function blocchi<T>(xs: T[], n: number): T[][] {
  return Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))
}

// ── Collegamento ────────────────────────────────────────────────────────────

export async function getCollegamentoFic(): Promise<CollegamentoFic | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('fic_collegamenti').select(COLONNE_COLLEGAMENTO).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return { ...(data as CollegamentoFic), fic_company_id: Number(data.fic_company_id) }
}

export async function verificaTokenFic(token: string): Promise<RisultatoVerificaFic> {
  const vietato = await erroreSeNonPuoiModificareImpostazioni()
  if (vietato) return { ok: false, errore: vietato }
  const pulito = token.trim()
  if (!pulito) return { ok: false, errore: 'Incolla il token generato su Fatture in Cloud' }
  try {
    const aziende = await creaClientFic(pulito).aziende()
    if (aziende.length === 0) return { ok: false, errore: 'Il token non dà accesso a nessuna azienda' }
    return { ok: true, aziende }
  } catch (e) {
    return { ok: false, errore: messaggioErrore(e) }
  }
}

export async function salvaCollegamentoFic(input: {
  token: string
  companyId: number
  sincronizzaDal: string
  confermaCambioAzienda: boolean
}): Promise<RisultatoFic> {
  const vietato = await erroreSeNonPuoiModificareImpostazioni()
  if (vietato) return { ok: false, errore: vietato }
  const token = input.token.trim()
  const erroreDal = erroreDataSincronizzaDal(input.sincronizzaDal, oggiRoma())
  if (erroreDal) return { ok: false, errore: `Sincronizza dal: ${erroreDal}` }

  // Il server non si fida di nome e id arrivati dal browser: riverifica il token.
  const verifica = await verificaTokenFic(token)
  if (!verifica.ok) return verifica
  const azienda = verifica.aziende.find((a) => a.id === input.companyId)
  if (!azienda) return { ok: false, errore: "L'azienda scelta non è raggiungibile con questo token" }

  const orgId = await getOrgId()
  const svc = createServiceClient()
  const { data: esistente, error: errLettura } = await svc
    .from('fic_collegamenti')
    .select('fic_company_id, sincronizza_dal, ultima_sync_at')
    .eq('organization_id', orgId)
    .maybeSingle()
  if (errLettura) return { ok: false, errore: errLettura.message }

  // Gli id FiC di aziende diverse non si mescolano: cambiare azienda svuota la copia locale.
  const cambioAzienda = esistente !== null && Number(esistente.fic_company_id) !== azienda.id
  if (cambioAzienda && !input.confermaCambioAzienda) {
    return {
      ok: false,
      richiedeConferma: true,
      errore: `Il token è di un'altra azienda (${azienda.nome}). Le fatture scaricate dall'azienda precedente verranno eliminate.`,
    }
  }

  const { data: secretId, error: errVault } = await svc.rpc('fic_salva_token', { p_org: orgId, p_token: token })
  if (errVault) return { ok: false, errore: errVault.message }

  if (cambioAzienda) {
    const { error } = await svc.from('fatture_fornitori').delete().eq('organization_id', orgId)
    if (error) return { ok: false, errore: error.message }
  }

  // "Sincronizza dal" non si cambia dopo la prima sincronizzazione completata della stessa azienda.
  const mantieniDal = esistente !== null && !cambioAzienda && esistente.ultima_sync_at !== null
  const { error: errSalva } = await svc.from('fic_collegamenti').upsert(
    {
      organization_id: orgId,
      vault_secret_id: secretId as string,
      token_finale: token.slice(-4),
      fic_company_id: azienda.id,
      fic_company_nome: azienda.nome,
      sincronizza_dal: mantieniDal ? esistente!.sincronizza_dal : input.sincronizzaDal,
      stato: 'attivo',
      updated_at: new Date().toISOString(),
      ...(cambioAzienda
        ? { ultima_sync_at: null, ultimo_esito: null, ultimo_esito_at: null, ultimo_messaggio: null, ultimi_conteggi: null }
        : {}),
    },
    { onConflict: 'organization_id' },
  )
  if (errSalva) return { ok: false, errore: errSalva.message }

  revalidatePath('/impostazioni')
  revalidatePath('/fatture-fornitori')
  return { ok: true }
}

export async function aggiornaSincronizzaDal(data: string): Promise<RisultatoFic> {
  const vietato = await erroreSeNonPuoiModificareImpostazioni()
  if (vietato) return { ok: false, errore: vietato }
  const erroreDal = erroreDataSincronizzaDal(data, oggiRoma())
  if (erroreDal) return { ok: false, errore: erroreDal }
  const orgId = await getOrgId()
  const svc = createServiceClient()
  const { data: aggiornate, error } = await svc
    .from('fic_collegamenti')
    .update({ sincronizza_dal: data, updated_at: new Date().toISOString() })
    .eq('organization_id', orgId)
    .is('ultima_sync_at', null)
    .select('organization_id')
  if (error) return { ok: false, errore: error.message }
  if (!aggiornate?.length) return { ok: false, errore: 'Non modificabile dopo la prima sincronizzazione' }
  revalidatePath('/impostazioni')
  return { ok: true }
}

/**
 * "Scarica fatture dal": porta indietro la data da cui si sincronizza, per
 * scaricare gli anni precedenti. Solo indietro: posticiparla farebbe sembrare
 * eliminate su FiC le fatture piu' vecchie, e la sincronizzazione le toglierebbe.
 * Le fatture nuove arrivano col prossimo "Sincronizza".
 */
export async function anticipaSincronizzaDal(data: string): Promise<RisultatoFic> {
  const { permessi } = await getMyPermissions()
  if (permessi.fatture_fornitori !== 'scrittura') return { ok: false, errore: 'Non autorizzato a sincronizzare' }
  const orgId = await getOrgId()
  const svc = createServiceClient()
  const { data: coll, error: errColl } = await svc
    .from('fic_collegamenti').select('sincronizza_dal').eq('organization_id', orgId).maybeSingle()
  if (errColl) return { ok: false, errore: errColl.message }
  if (!coll) return { ok: false, errore: "Fatture in Cloud non e' collegato" }

  const errore = erroreAnticipo(data, coll.sincronizza_dal as string, oggiRoma())
  if (errore) return { ok: false, errore }

  const [a, m, g] = data.split('-')
  const { error } = await svc
    .from('fic_collegamenti')
    .update({
      sincronizza_dal: data,
      // "Ultima sincronizzazione" resta quella vera; l'esito dice che manca un giro.
      ultimo_esito: 'parziale',
      ultimo_esito_at: new Date().toISOString(),
      ultimo_messaggio: `Data anticipata al ${g}/${m}/${a}: premi Sincronizza per scaricare le fatture precedenti`,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', orgId)
    .gt('sincronizza_dal', data)
  if (error) return { ok: false, errore: error.message }
  revalidatePath('/fatture-fornitori')
  revalidatePath('/impostazioni')
  return { ok: true }
}

export async function scollegaFic(): Promise<RisultatoFic> {
  const vietato = await erroreSeNonPuoiModificareImpostazioni()
  if (vietato) return { ok: false, errore: vietato }
  const orgId = await getOrgId()
  const svc = createServiceClient()
  const { error: errVault } = await svc.rpc('fic_elimina_token', { p_org: orgId })
  if (errVault) return { ok: false, errore: errVault.message }
  const { error } = await svc.from('fic_collegamenti').delete().eq('organization_id', orgId)
  if (error) return { ok: false, errore: error.message }
  revalidatePath('/impostazioni')
  revalidatePath('/fatture-fornitori')
  return { ok: true }
}

// ── Sincronizzazione ────────────────────────────────────────────────────────

function archivioSupabase(svc: SupabaseClient, orgId: string): ArchivioFatture {
  return {
    vociLocali: async () => {
      const righe = await selectAll<{ fic_id: number | string; fic_updated_at: string }>((da, a) =>
        svc
          .from('fatture_fornitori')
          .select('fic_id, fic_updated_at')
          .eq('organization_id', orgId)
          .order('fic_id')
          .range(da, a),
      )
      return righe.map((r): VoceLocale => ({ fic_id: Number(r.fic_id), fic_updated_at: r.fic_updated_at }))
    },

    salva: (documenti) => salvaDocumenti(tabelleSupabase(svc), orgId, documenti),

    async elimina(ficIds) {
      for (const blocco of blocchi(ficIds, LOTTO_DB)) {
        const { error } = await svc
          .from('fatture_fornitori')
          .delete()
          .eq('organization_id', orgId)
          .in('fic_id', blocco)
        if (error) throw new Error(error.message)
      }
    },
  }
}

export async function sincronizzaFattureFornitori(): Promise<EsitoSincronizzazione> {
  const errore = (messaggio: string): EsitoSincronizzazione => ({ esito: 'errore', messaggio, conteggi: CONTEGGI_VUOTI })

  const { permessi } = await getMyPermissions()
  if (permessi.fatture_fornitori !== 'scrittura') return errore('Non autorizzato a sincronizzare')

  const orgId = await getOrgId()
  const svc = createServiceClient()
  const { data: coll, error: errColl } = await svc
    .from('fic_collegamenti')
    .select('fic_company_id, sincronizza_dal, stato')
    .eq('organization_id', orgId)
    .maybeSingle()
  if (errColl) return errore(errColl.message)
  if (!coll) return errore('Fatture in Cloud non è collegato: vai in Impostazioni → Fatture in Cloud')
  if (coll.stato !== 'attivo') {
    return errore('Il collegamento va rinnovato: sostituisci il token in Impostazioni → Fatture in Cloud')
  }

  // Blocco anti doppio clic: si prende solo se libero o scaduto, con un update condizionato.
  const inizio = new Date()
  const scaduto = new Date(inizio.getTime() - BLOCCO_MS).toISOString()
  const { data: preso, error: errBlocco } = await svc
    .from('fic_collegamenti')
    .update({ sync_in_corso_da: inizio.toISOString() })
    .eq('organization_id', orgId)
    .or(`sync_in_corso_da.is.null,sync_in_corso_da.lt.${scaduto}`)
    .select('organization_id')
  if (errBlocco) return errore(errBlocco.message)
  if (!preso?.length) return errore('Sincronizzazione già in corso')

  let esito: EsitoSincronizzazione
  let tokenRifiutato = false
  try {
    const token = await leggiToken(svc, orgId)
    const r = await sincronizza({
      client: creaClientFic(token),
      archivio: archivioSupabase(svc, orgId),
      companyId: Number(coll.fic_company_id),
      dal: coll.sincronizza_dal as string,
      budgetChiamate: BUDGET_CHIAMATE,
      limiteMs: LIMITE_MS,
    })
    esito = r.completa
      ? { esito: 'ok', messaggio: '', conteggi: r.conteggi }
      : { esito: 'parziale', messaggio: messaggioParziale(r), conteggi: r.conteggi }
  } catch (e) {
    tokenRifiutato = e instanceof FicNonAutorizzato
    esito = e instanceof FicTroppeRichieste
      ? { esito: 'parziale', messaggio: messaggioErrore(e), conteggi: CONTEGGI_VUOTI }
      : errore(messaggioErrore(e))
  }

  // Rilascio del blocco ed esito: gira sempre, perche' il catch sopra intercetta ogni errore.
  // "Ultima sincronizzazione" = partenza dell'ultima completata: parziali ed errori non la toccano.
  const { error: errEsito } = await svc
    .from('fic_collegamenti')
    .update({
      sync_in_corso_da: null,
      ultimo_esito: esito.esito,
      ultimo_esito_at: new Date().toISOString(),
      ultimo_messaggio: esito.messaggio || null,
      ultimi_conteggi: esito.conteggi,
      updated_at: new Date().toISOString(),
      ...(esito.esito === 'ok' ? { ultima_sync_at: inizio.toISOString() } : {}),
      ...(tokenRifiutato ? { stato: 'da_ricollegare' } : {}),
    })
    .eq('organization_id', orgId)
  if (errEsito) return errore(errEsito.message)

  revalidatePath('/fatture-fornitori')
  revalidatePath('/impostazioni')
  return esito
}

// ── PDF ─────────────────────────────────────────────────────────────────────

/** Il link di FiC al file e' temporaneo: si chiede al momento del clic, non si archivia. */
export async function getUrlPdfFatturaFornitore(id: string): Promise<{ url: string | null; errore?: string }> {
  const { permessi } = await getMyPermissions()
  if (permessi.fatture_fornitori === 'nessuno') return { url: null, errore: 'Non autorizzato' }

  // Lettura con RLS: garantisce che la fattura sia dell'organizzazione dell'utente.
  const supabase = await createClient()
  const { data: fattura, error } = await supabase.from('fatture_fornitori').select('fic_id').eq('id', id).maybeSingle()
  if (error) return { url: null, errore: error.message }
  if (!fattura) return { url: null, errore: 'Fattura non trovata' }

  const orgId = await getOrgId()
  const svc = createServiceClient()
  const { data: coll } = await svc
    .from('fic_collegamenti')
    .select('fic_company_id')
    .eq('organization_id', orgId)
    .maybeSingle()
  if (!coll) return { url: null, errore: 'Fatture in Cloud non è collegato' }

  try {
    const token = await leggiToken(svc, orgId)
    const doc = await creaClientFic(token).spesa(Number(coll.fic_company_id), Number(fattura.fic_id))
    return doc.attachment_url
      ? { url: doc.attachment_url }
      : { url: null, errore: 'Nessun PDF allegato su Fatture in Cloud' }
  } catch (e) {
    if (e instanceof FicNonAutorizzato) {
      await svc.from('fic_collegamenti').update({ stato: 'da_ricollegare' }).eq('organization_id', orgId)
    }
    return { url: null, errore: messaggioErrore(e) }
  }
}
