import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { ESITO_VUOTO, type Desiderato } from '@/lib/fic/allineamento'
import { oggiRoma } from '@/lib/fic/stato-pagamento'
import { aRiga, COLONNE_RIGA, creaContesto, CANALE_INCASSI, trattaCollegamento } from '@/lib/fic/motore-scrittura'
import type { EsitoFic } from '@/types/fatture-fornitori'
import type { MetodiIncassoFic, MetodoIncasso } from '@/types/fatture-emesse'

/*
 * Incassi (acconti_commessa) → pagamenti sulle fatture emesse. Stesso motore delle
 * scadenze (motore-scrittura.ts): qui si decide solo cosa dovrebbe esserci su FiC.
 * Un incasso esiste = e' pagato; data = data dell'incasso; conto FiC dal metodo,
 * secondo l'abbinamento in Impostazioni → Fatture in Cloud.
 */

async function leggiDesiderato(
  svc: SupabaseClient, orgId: string, accontoId: string, forzaNonPagata: boolean,
): Promise<Desiderato | null> {
  const [{ data: acc, error }, { data: coll, error: errColl }] = await Promise.all([
    svc.from('acconti_commessa').select('data_pagamento, metodo_pagamento')
      .eq('id', accontoId).eq('organization_id', orgId).maybeSingle(),
    svc.from('fic_collegamenti').select('metodi_incasso').eq('organization_id', orgId).maybeSingle(),
  ])
  if (error) throw new Error(error.message)
  if (errColl) throw new Error(errColl.message)
  if (!acc && !forzaNonPagata) return null
  const metodi = (coll?.metodi_incasso ?? null) as Partial<MetodiIncassoFic> | null
  const metodo = acc ? metodi?.[acc.metodo_pagamento as MetodoIncasso] : null
  return {
    pagare: !forzaNonPagata,
    data: (acc?.data_pagamento as string | undefined) ?? oggiRoma(),
    metodoId: metodo === null || metodo === undefined ? null : Number(metodo),
  }
}

export async function allineaIncassoFic(
  svc: SupabaseClient,
  orgId: string,
  accontoId: string,
  opz: { forzaNonPagata?: boolean } = {},
): Promise<EsitoFic> {
  const esito: EsitoFic = { ...ESITO_VUOTO, problemi: [], avvisi: [] }
  const ctx = creaContesto(svc, orgId, CANALE_INCASSI)

  // Due passate al massimo, come per le scadenze: se l'incasso cambia durante la
  // prima, la seconda porta FiC allo stato nuovo.
  let precedente: string | null = null
  for (let passata = 0; passata < 2; passata++) {
    const desiderato = await leggiDesiderato(svc, orgId, accontoId, opz.forzaNonPagata ?? false)
    if (!desiderato) return esito
    const chiave = JSON.stringify(desiderato)
    if (chiave === precedente) break
    precedente = chiave

    const { data: righe, error } = await svc
      .from('incassi_fatture')
      .select(COLONNE_RIGA)
      .eq('acconto_id', accontoId)
      .eq('organization_id', orgId)
    if (error) throw new Error(error.message)
    const collegamenti = (righe ?? []).map((x) => aRiga(x as Record<string, unknown>))
    if (collegamenti.length === 0) return esito

    for (const r of collegamenti) {
      const e = await trattaCollegamento(ctx, r, desiderato)
      if (e.scritto) esito.scritti++
      if (e.annullato) esito.annullati++
      if (e.problema) esito.problemi.push(e.problema)
    }
  }
  return esito
}

/**
 * Prima di eliminare un incasso: toglie da FiC tutto cio' che WinStudio ha scritto
 * e cancella i collegamenti. Se un annullamento non riesce si ferma: dopo non
 * resterebbe traccia di cosa togliere (e il vincolo RESTRICT impedisce l'eliminazione).
 */
export async function liberaIncassoPerEliminazione(
  orgId: string, accontoId: string,
): Promise<{ ok: true } | { ok: false; errore: string }> {
  const svc = createServiceClient()
  const { data: righe, error: errRighe } = await svc
    .from('incassi_fatture')
    .select('id, scrittura_fic, intenzione_fic')
    .eq('acconto_id', accontoId)
    .eq('organization_id', orgId)
  if (errRighe) return { ok: false, errore: errRighe.message }
  if (!righe?.length) return { ok: true }
  if (righe.some((r) => r.scrittura_fic || r.intenzione_fic)) {
    const esito = await allineaIncassoFic(svc, orgId, accontoId, { forzaNonPagata: true })
    if (esito.problemi.length) {
      return { ok: false, errore: `Prima va tolto l'incasso da Fatture in Cloud: ${esito.problemi.join(' · ')}` }
    }
  }
  const { error } = await svc.from('incassi_fatture').delete().eq('acconto_id', accontoId).eq('organization_id', orgId)
  return error ? { ok: false, errore: error.message } : { ok: true }
}

/** Toglie da FiC la sola quota di un incasso su una fattura. Null se riuscito (o se non c'era niente). */
export async function annullaQuotaIncasso(
  svc: SupabaseClient, orgId: string, accontoId: string, ficDocumentoId: number,
): Promise<string | null> {
  const { data: x, error } = await svc
    .from('incassi_fatture')
    .select(COLONNE_RIGA)
    .eq('acconto_id', accontoId)
    .eq('fic_documento_id', ficDocumentoId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) return error.message
  if (!x) return null
  const r = aRiga(x as Record<string, unknown>)
  if (!r.scrittura_fic && !r.intenzione_fic) return null
  const e = await trattaCollegamento(
    creaContesto(svc, orgId, CANALE_INCASSI), r, { pagare: false, data: oggiRoma(), metodoId: null },
  )
  return e.problema
}
