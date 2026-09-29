import type { DocumentoMappato, RigaFattura, RigaRata } from '@/lib/fic/mappa'

export type RigaFatturaDb = RigaFattura & { organization_id: string }
export type RigaRataDb = RigaRata & { organization_id: string; fattura_id: string }

/** Le tre scritture che servono, senza dipendere dal client Supabase: nei test c'e' un finto. */
export type TabelleFatture = {
  upsertFatture: (righe: RigaFatturaDb[]) => Promise<{ id: string; fic_id: number }[]>
  eliminaRate: (fatturaIds: string[]) => Promise<void>
  inserisciRate: (righe: RigaRataDb[]) => Promise<void>
}

/**
 * Salva un lotto di fatture con le loro rate.
 *
 * Le scritture non stanno in una transazione, quindi l'ordine fa da rete:
 * la fattura entra prima con la data di modifica vuota, poi si riscrivono le
 * rate, e solo alla fine riceve la data vera. Se qualcosa si interrompe a meta'
 * (timeout, errore di rete) la fattura resta con la data vuota, il confronto del
 * giro dopo la vede diversa da FiC e la riscarica: mai una fattura "aggiornata"
 * rimasta senza rate.
 */
export async function salvaDocumenti(
  tabelle: TabelleFatture,
  orgId: string,
  documenti: DocumentoMappato[],
): Promise<void> {
  if (documenti.length === 0) return

  const righe = documenti.map((d): RigaFatturaDb => ({ ...d.fattura, organization_id: orgId }))
  const salvate = await tabelle.upsertFatture(righe.map((r) => ({ ...r, fic_updated_at: '' })))
  const idPerFic = new Map(salvate.map((r) => [Number(r.fic_id), r.id]))

  await tabelle.eliminaRate([...idPerFic.values()])
  const rate = documenti.flatMap((d) =>
    d.rate.map((r): RigaRataDb => ({ ...r, organization_id: orgId, fattura_id: idPerFic.get(d.fattura.fic_id)! })),
  )
  if (rate.length > 0) await tabelle.inserisciRate(rate)

  await tabelle.upsertFatture(righe)
}
