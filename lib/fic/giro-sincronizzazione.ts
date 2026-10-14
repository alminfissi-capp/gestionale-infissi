import type { SupabaseClient } from '@supabase/supabase-js'
import { selectAll } from '@/lib/supabase/paginate'
import { creaClientFic, FicNonAutorizzato, FicTroppeRichieste } from '@/lib/fic/client'
import { sincronizza, messaggioParziale, fonteEmesse, type ArchivioFatture } from '@/lib/fic/sincronizza'
import type { VoceLocale } from '@/lib/fic/confronto'
import type { EmessoMappato, RigaFatturaEmessa } from '@/lib/fic/mappa'
import { salvaDocumenti } from '@/lib/fic/salvataggio'
import { tabelleSupabase, TABELLE_EMESSE } from '@/lib/fic/tabelle-supabase'
import { blocchi, leggiToken, messaggioErrore } from '@/lib/fic/servizio'
import { CONTEGGI_VUOTI, type EsitoSincronizzazione } from '@/types/fatture-fornitori'

/*
 * Un giro di sincronizzazione con FiC, per i fornitori o per le emesse. Lo usano
 * il tasto "Sincronizza" (dopo aver controllato i permessi dell'utente) e il giro
 * automatico orario (/api/cron/sync-fatture). Qui niente permessi: chi chiama
 * ha gia' deciso che l'organizzazione puo' sincronizzare.
 */

/** Sotto le 300 chiamate ogni 5 minuti di FiC, con margine per l'elenco. */
const BUDGET_CHIAMATE = 250
/** Sotto il maxDuration (300 s) della pagina/route da cui parte la sincronizzazione. */
const LIMITE_MS = 240_000
/** Oltre questo tempo un blocco rimasto appeso (funzione uccisa) si considera scaduto. */
const BLOCCO_MS = 5 * 60_000
const LOTTO_DB = 200

export type TipoGiro = 'fornitori' | 'emesse'

/** Fatture emesse da cui si parte: se non scelta, la stessa data dei fornitori. */
export function dalEmesse(coll: { emesse_sincronizza_dal: string | null; sincronizza_dal: string }): string {
  return coll.emesse_sincronizza_dal ?? coll.sincronizza_dal
}

function archivioFornitori(svc: SupabaseClient, orgId: string): ArchivioFatture {
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

function archivioEmesse(svc: SupabaseClient, orgId: string): ArchivioFatture<EmessoMappato> {
  return {
    vociLocali: async () => {
      const righe = await selectAll<{ fic_id: number | string; fic_updated_at: string }>((da, a) =>
        svc.from('fatture_emesse').select('fic_id, fic_updated_at').eq('organization_id', orgId).order('fic_id').range(da, a),
      )
      return righe.map((r): VoceLocale => ({ fic_id: Number(r.fic_id), fic_updated_at: r.fic_updated_at }))
    },
    salva: (documenti) => salvaDocumenti(tabelleSupabase<RigaFatturaEmessa>(svc, TABELLE_EMESSE), orgId, documenti),
    async elimina(ficIds) {
      for (const blocco of blocchi(ficIds, LOTTO_DB)) {
        const { error } = await svc.from('fatture_emesse').delete().eq('organization_id', orgId).in('fic_id', blocco)
        if (error) throw new Error(error.message)
      }
    },
  }
}

/** Le colonne di fic_collegamenti di ciascun giro: le emesse hanno le loro, col prefisso emesse_. */
function colonne(tipo: TipoGiro) {
  const p = tipo === 'emesse' ? 'emesse_' : ''
  return {
    inCorso: `${p}sync_in_corso_da`,
    ultimaSync: `${p}ultima_sync_at`,
    esito: `${p}ultimo_esito`,
    esitoAt: `${p}ultimo_esito_at`,
    messaggio: `${p}ultimo_messaggio`,
    conteggi: `${p}ultimi_conteggi`,
  }
}

export async function eseguiGiro(svc: SupabaseClient, orgId: string, tipo: TipoGiro): Promise<EsitoSincronizzazione> {
  const errore = (messaggio: string): EsitoSincronizzazione => ({ esito: 'errore', messaggio, conteggi: CONTEGGI_VUOTI })
  const c = colonne(tipo)

  const { data: coll, error: errColl } = await svc
    .from('fic_collegamenti')
    .select('fic_company_id, sincronizza_dal, emesse_sincronizza_dal, stato')
    .eq('organization_id', orgId)
    .maybeSingle()
  if (errColl) return errore(errColl.message)
  if (!coll) return errore('Fatture in Cloud non è collegato: vai in Impostazioni → Fatture in Cloud')
  if (coll.stato !== 'attivo') {
    return errore('Il collegamento va rinnovato: sostituisci il token in Impostazioni → Fatture in Cloud')
  }

  // Blocco anti doppio clic (e anti sovrapposizione col giro automatico), separato
  // per fornitori ed emesse: si prende solo se libero o scaduto, con un update condizionato.
  const inizio = new Date()
  const scaduto = new Date(inizio.getTime() - BLOCCO_MS).toISOString()
  const { data: preso, error: errBlocco } = await svc
    .from('fic_collegamenti')
    .update({ [c.inCorso]: inizio.toISOString() })
    .eq('organization_id', orgId)
    .or(`${c.inCorso}.is.null,${c.inCorso}.lt.${scaduto}`)
    .select('organization_id')
  if (errBlocco) return errore(errBlocco.message)
  if (!preso?.length) return errore('Sincronizzazione già in corso')

  let esito: EsitoSincronizzazione
  let tokenRifiutato = false
  try {
    const token = await leggiToken(svc, orgId)
    const client = creaClientFic(token)
    const companyId = Number(coll.fic_company_id)
    const comune = { client, companyId, budgetChiamate: BUDGET_CHIAMATE, limiteMs: LIMITE_MS }
    const r = tipo === 'emesse'
      ? await sincronizza<EmessoMappato>({
          ...comune,
          archivio: archivioEmesse(svc, orgId),
          dal: dalEmesse(coll),
          fonte: fonteEmesse(client, companyId),
        })
      : await sincronizza({ ...comune, archivio: archivioFornitori(svc, orgId), dal: coll.sincronizza_dal as string })
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
      [c.inCorso]: null,
      [c.esito]: esito.esito,
      [c.esitoAt]: new Date().toISOString(),
      [c.messaggio]: esito.messaggio || null,
      [c.conteggi]: esito.conteggi,
      updated_at: new Date().toISOString(),
      ...(esito.esito === 'ok' ? { [c.ultimaSync]: inizio.toISOString() } : {}),
      ...(tokenRifiutato ? { stato: 'da_ricollegare' } : {}),
    })
    .eq('organization_id', orgId)
  if (errEsito) return errore(errEsito.message)
  return esito
}
