// Tipi condivisi del modulo pagamenti. I nomi dei campi del preventivo
// rispecchiano la tabella public.preventivi di Win Studio (sola lettura).

export type TipoPagamento = 'acconto' | 'saldo';

export type StatoPagamento =
  | 'creato' // sessione di checkout aperta, il cliente non ha ancora pagato
  | 'in_attesa' // pagamento avviato ma conferma asincrona (es. bonifico, alcuni BNPL)
  | 'pagato'
  | 'fallito'
  | 'scaduto' // sessione scaduta senza pagamento
  | 'annullato' // sostituita da una sessione più recente
  | 'rimborsato';

export interface ClienteSnapshot {
  tipo?: 'privato' | 'azienda' | string;
  nome?: string;
  cognome?: string;
  ragione_sociale?: string;
  email?: string;
  telefono?: string;
}

export interface Preventivo {
  id: string;
  organization_id: string;
  numero: string;
  stato: string; // bozza | inviato | accettato | rifiutato | scaduto
  firma_stato: string | null; // null | in_attesa | firmato
  totale_finale: number; // IVA inclusa
  cliente_snapshot: ClienteSnapshot | null;
  share_token: string;
}

export type ModalitaRichiesta = 'percentuale' | 'totale';

/**
 * Scelte dell'operatore per il singolo preventivo (tabella pagamenti_impostazioni_preventivo),
 * impostate dal pannello "Pagamento online" nell'ultima pagina prima dell'invio.
 * Se la riga non esiste il pagamento online è DISATTIVO.
 */
export interface ImpostazioniPreventivo {
  preventivo_id: string;
  abilitato: boolean; // l'operatore ha attivato il pagamento online
  modalita: ModalitaRichiesta; // chiedere una percentuale (acconto) o il totale
  acconto_percentuale: number | null; // usata con modalita = 'percentuale'; null = default
  rate_abilitate: boolean; // mostra Klarna/Scalapay/Alma
  saldo_online: boolean; // dopo l'acconto, il cliente può pagare online anche il saldo
  con_detrazione_fiscale: boolean; // blocco di sicurezza: serve bonifico parlante
  importo_personalizzato: number | null; // null = usa totale_finale
}

export const IMPOSTAZIONI_PREDEFINITE: Omit<ImpostazioniPreventivo, 'preventivo_id'> = {
  abilitato: false,
  modalita: 'percentuale',
  acconto_percentuale: null,
  rate_abilitate: true,
  saldo_online: true,
  con_detrazione_fiscale: false,
  importo_personalizzato: null,
};

export interface Pagamento {
  id: string;
  organization_id: string;
  preventivo_id: string;
  tipo: TipoPagamento;
  importo: number;
  stato: StatoPagamento;
  metodo: string | null;
  stripe_session_id: string;
  stripe_payment_intent: string | null;
  acconto_commessa_id: string | null;
  created_at: string;
  pagato_at: string | null;
}

export interface DatiAzienda {
  denominazione: string;
  telefono: string | null;
  email: string | null;
  logo_url: string | null;
}
