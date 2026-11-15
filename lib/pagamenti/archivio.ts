// Interfaccia verso i dati dei pagamenti. In produzione: archivio-supabase.ts (service role);
// nei test: test-doppi.ts. Dal modulo alm-pagamenti, con la registrazione dell'acconto di WinStudio.
import type { ImpostazioniPreventivo, Pagamento, Preventivo, StatoPagamento, TipoPagamento } from './tipi'

export interface NuovoPagamento {
  organization_id: string
  preventivo_id: string
  tipo: TipoPagamento
  importo: number
  stripe_session_id: string
}

export interface Archivio {
  preventivoDaToken(token: string): Promise<Preventivo | null>
  preventivoDaId(id: string): Promise<Preventivo | null>
  impostazioni(preventivoId: string): Promise<ImpostazioniPreventivo | null>
  salvaImpostazioni(imp: ImpostazioniPreventivo, organizationId: string): Promise<ImpostazioniPreventivo>
  pagamenti(preventivoId: string): Promise<Pagamento[]>
  pagamentoDaSessione(sessionId: string): Promise<Pagamento | null>
  creaPagamento(p: NuovoPagamento): Promise<Pagamento>
  /**
   * Aggiorna il pagamento SOLO se lo stato attuale e' tra `daStati`; null se non e' cambiato nulla
   * (cosi' il webhook e' idempotente: un evento ripetuto non registra due volte).
   */
  aggiornaStato(
    sessionId: string,
    daStati: StatoPagamento[],
    patch: Partial<Pick<Pagamento, 'stato' | 'metodo' | 'stripe_payment_intent' | 'pagato_at' | 'acconto_commessa_id'>>,
  ): Promise<Pagamento | null>
  pagamentoDaPaymentIntent(paymentIntentId: string): Promise<Pagamento | null>
  /** Commessa del preventivo nella sua organizzazione (mai una commessa di un'altra organizzazione) */
  commessaDelPreventivo(preventivoId: string, organizationId: string): Promise<string | null>
  /** Toglie l'acconto di un pagamento rimborsato; false se non c'era o non si puo' togliere (gia' su Fatture in Cloud) */
  eliminaAccontoDaPagamento(p: Pagamento): Promise<boolean>
  /** Acconto in commessa per un pagamento riuscito; null se c'e' gia' (vincolo unico su pagamento_online_id). */
  registraAccontoDaPagamento(p: Pagamento, commessaId: string, metodo: string | null): Promise<string | null>
}
