import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { avvisoImporti, ESITO_VUOTO, type Desiderato } from '@/lib/fic/allineamento'
import { oggiRoma } from '@/lib/fic/stato-pagamento'
import { aRiga, COLONNE_RIGA, creaContesto, CANALE_SCADENZE, trattaCollegamento } from '@/lib/fic/motore-scrittura'
import type { EsitoFic } from '@/types/fatture-fornitori'

/*
 * Scadenze → pagamenti sulle fatture dei fornitori. Il motore che scrive su FiC
 * (presa, intenzione, rilettura) e' in motore-scrittura.ts. Tutte le azioni sulle
 * scadenze passano da qui (vedi actions/scadenze.ts e actions/fic-pagamenti.ts).
 */

async function leggiDesiderato(
  svc: SupabaseClient, orgId: string, scadenzaId: string, forzaNonPagata: boolean,
): Promise<{ desiderato: Desiderato; importo: number } | null> {
  const { data: sc, error } = await svc
    .from('scadenze')
    .select('importo, pagato, annullata, data_scadenza, fic_metodo_id')
    .eq('id', scadenzaId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!sc) return null
  return {
    importo: Number(sc.importo),
    desiderato: {
      pagare: !forzaNonPagata && sc.pagato && !sc.annullata,
      data: (sc.data_scadenza as string | null) ?? oggiRoma(),
      metodoId: sc.fic_metodo_id === null ? null : Number(sc.fic_metodo_id),
    },
  }
}

export async function allineaScadenzaFic(
  svc: SupabaseClient,
  orgId: string,
  scadenzaId: string,
  opz: { forzaNonPagata?: boolean } = {},
): Promise<EsitoFic> {
  const esito: EsitoFic = { ...ESITO_VUOTO, problemi: [], avvisi: [] }
  const ctx = creaContesto(svc, orgId, CANALE_SCADENZE)

  // Due passate al massimo: se durante la prima la scadenza e' cambiata (un
  // secondo clic su "pagato"), la seconda porta FiC allo stato nuovo.
  let precedente: string | null = null
  for (let passata = 0; passata < 2; passata++) {
    const stato = await leggiDesiderato(svc, orgId, scadenzaId, opz.forzaNonPagata ?? false)
    if (!stato) return esito
    const chiave = JSON.stringify(stato.desiderato)
    if (chiave === precedente) break
    precedente = chiave

    const { data: righe, error } = await svc
      .from('scadenze_fatture')
      .select(COLONNE_RIGA)
      .eq('scadenza_id', scadenzaId)
      .eq('organization_id', orgId)
    if (error) throw new Error(error.message)
    const collegamenti = (righe ?? []).map((x) => aRiga(x as Record<string, unknown>))
    if (collegamenti.length === 0) return esito

    if (passata === 0) {
      const avviso = avvisoImporti(stato.importo, collegamenti)
      if (avviso && !opz.forzaNonPagata) esito.avvisi.push(avviso)
    }

    for (const r of collegamenti) {
      const e = await trattaCollegamento(ctx, r, stato.desiderato)
      if (e.scritto) esito.scritti++
      if (e.annullato) esito.annullati++
      if (e.problema) esito.problemi.push(e.problema)
    }
  }
  return esito
}

/** Per le azioni delle scadenze: niente lavoro (e niente query FiC) se la scadenza non e' collegata. */
export async function allineaSeCollegata(orgId: string, scadenzaId: string): Promise<EsitoFic | null> {
  const svc = createServiceClient()
  const { count, error } = await svc
    .from('scadenze_fatture')
    .select('id', { count: 'exact', head: true })
    .eq('scadenza_id', scadenzaId)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  if (!count) return null
  return allineaScadenzaFic(svc, orgId, scadenzaId)
}

/**
 * Prima di eliminare una scadenza: toglie da FiC tutto cio' che WinStudio ha
 * scritto e cancella i collegamenti. La scadenza non viene toccata. Se un
 * annullamento non riesce si ferma: dopo non resterebbe traccia di cosa togliere.
 */
export async function liberaPerEliminazione(
  orgId: string, scadenzaId: string,
): Promise<{ ok: true } | { ok: false; errore: string }> {
  const svc = createServiceClient()
  const { data: righe, error: errRighe } = await svc
    .from('scadenze_fatture')
    .select('id, scrittura_fic, intenzione_fic')
    .eq('scadenza_id', scadenzaId)
    .eq('organization_id', orgId)
  if (errRighe) return { ok: false, errore: errRighe.message }
  if (!righe?.length) return { ok: true }
  if (righe.some((r) => r.scrittura_fic || r.intenzione_fic)) {
    const esito = await allineaScadenzaFic(svc, orgId, scadenzaId, { forzaNonPagata: true })
    if (esito.problemi.length) {
      return { ok: false, errore: `Prima va tolto il pagamento da Fatture in Cloud: ${esito.problemi.join(' · ')}` }
    }
  }
  const { error } = await svc.from('scadenze_fatture').delete().eq('scadenza_id', scadenzaId).eq('organization_id', orgId)
  return error ? { ok: false, errore: error.message } : { ok: true }
}

/** Toglie da FiC il pagamento di un solo collegamento (scollegamento da una scadenza pagata). Null se riuscito. */
export async function annullaSingolo(
  svc: SupabaseClient, orgId: string, scadenzaId: string, ficDocumentoId: number,
): Promise<string | null> {
  const { data: x, error } = await svc
    .from('scadenze_fatture')
    .select(COLONNE_RIGA)
    .eq('scadenza_id', scadenzaId)
    .eq('fic_documento_id', ficDocumentoId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) return error.message
  if (!x) return null
  const r = aRiga(x as Record<string, unknown>)
  if (!r.scrittura_fic && !r.intenzione_fic) return null
  const e = await trattaCollegamento(creaContesto(svc, orgId, CANALE_SCADENZE), r, { pagare: false, data: oggiRoma(), metodoId: null })
  return e.problema
}
