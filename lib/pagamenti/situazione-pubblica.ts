// Cosa vede il cliente nel riquadro "Pagamento" (pagina del preventivo e pagina dopo la firma).
// Solo dati da mostrare: niente id interni, niente chiavi.
import { MESSAGGI_BLOCCO, type EsitoRegole } from './regole'
import type { Pagamento, Preventivo, TipoPagamento } from './tipi'

export interface SituazionePubblica {
  pagabile: boolean
  messaggio: string | null
  opzioni: { tipo: TipoPagamento; importo: number; etichetta: string; rateIndicative: string[] }[]
  inConferma: boolean
  /** Firma fatta ma non ancora confermata da openapi.it, con pagamento attivo: "disponibile tra un momento" */
  inAttesaFirma: boolean
  giaPagato: number
  bonifico: { iban: string; intestatario: string; causale: string } | null
}

/**
 * Bonifico come alternativa solo se il pagamento online e' attivo o il preventivo e' accettato/firmato
 * (scelta della spec: l'IBAN non compare sui preventivi ancora da decidere).
 */
export function situazioneDaEsito(
  p: Preventivo, esito: EsitoRegole, pagamenti: Pagamento[], banca: { iban: string; intestatario: string } | null,
): SituazionePubblica {
  const accettato = p.stato === 'accettato' || p.firma_stato === 'firmato'
  const attivo = esito.pagabile || (esito.motivo !== 'disabilitato' && esito.motivo !== 'non_accettato')
  const bonifico = banca?.iban?.trim() && (attivo || accettato)
    ? { iban: banca.iban.trim(), intestatario: banca.intestatario, causale: `Preventivo ${p.numero}` }
    : null
  return {
    pagabile: esito.pagabile,
    messaggio: esito.pagabile ? null : MESSAGGI_BLOCCO[esito.motivo],
    opzioni: esito.pagabile ? esito.opzioni.map(o => ({ tipo: o.tipo, importo: o.importo, etichetta: o.etichetta, rateIndicative: o.rateIndicative })) : [],
    inConferma: pagamenti.some(x => x.stato === 'in_attesa'),
    // 'non_accettato' arriva solo dopo i controlli di attivazione e detrazione: il pagamento e' attivo
    inAttesaFirma: !esito.pagabile && esito.motivo === 'non_accettato' && p.firma_stato === 'in_attesa',
    giaPagato: esito.giaPagato,
    bonifico,
  }
}
