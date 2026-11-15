// Regole di business: decide SE e QUANTO il cliente può pagare.
// Funzione pura, senza accesso a rete o database: è il cuore testato del modulo
// ed è usata sia dal server sia dal pannello operatore (anteprima).

import type { ImpostazioniPreventivo, Pagamento, Preventivo, TipoPagamento } from './tipi';

export interface ParametriRegole {
  accontoPercentuale: number; // default proposto quando l'operatore non indica la %
  statiPagabili: string[];
  richiediFirma: boolean;
}

export type MotivoBlocco =
  | 'disabilitato'
  | 'detrazione'
  | 'non_accettato'
  | 'firma_mancante'
  | 'importo_non_valido'
  | 'acconto_ricevuto'
  | 'saldato';

export interface OpzionePagamento {
  tipo: TipoPagamento;
  importo: number;
  etichetta: string;
  /** Indicazione informativa: rate probabilmente disponibili per questo importo. */
  rateIndicative: string[];
}

export type EsitoRegole =
  | { pagabile: false; motivo: MotivoBlocco; totale: number; giaPagato: number }
  | {
      pagabile: true;
      totale: number;
      giaPagato: number;
      residuo: number;
      clienteAzienda: boolean;
      /** true se le rate vanno escluse dal checkout (scelta operatore o cliente azienda) */
      escludiRate: boolean;
      opzioni: OpzionePagamento[];
    };

// Limiti per l'Italia (fonte: documentazione Stripe, novembre 2026). Stripe applica
// comunque i propri limiti al checkout: questi servono solo per i messaggi in pagina.
export const LIMITI_RATE = {
  klarna: { min: 1, max: 3000, nome: 'Klarna' },
  scalapay: { min: 5, max: 4999.99, nome: 'Scalapay' },
} as const;

export const arrotonda = (n: number) => Math.round(n * 100) / 100;

export function totalePagato(pagamenti: Pagamento[]): number {
  return arrotonda(
    pagamenti.filter((p) => p.stato === 'pagato').reduce((s, p) => s + Number(p.importo), 0),
  );
}

export function rateIndicative(importo: number, escludiRate: boolean): string[] {
  if (escludiRate) return [];
  return Object.values(LIMITI_RATE)
    .filter((l) => importo >= l.min && importo <= l.max)
    .map((l) => l.nome);
}

/** Percentuale effettiva: valida solo tra 0 e 100 esclusi, altrimenti si chiede il totale. */
export function percentualeEffettiva(imp: ImpostazioniPreventivo, parametri: ParametriRegole): number | null {
  if (imp.modalita !== 'percentuale') return null;
  const perc = Number(imp.acconto_percentuale ?? parametri.accontoPercentuale);
  return perc > 0 && perc < 100 ? perc : null;
}

export function calcolaOpzioni(input: {
  preventivo: Preventivo;
  impostazioni: ImpostazioniPreventivo | null;
  pagamenti: Pagamento[];
  parametri: ParametriRegole;
}): EsitoRegole {
  const { preventivo: p, impostazioni: imp, pagamenti, parametri } = input;
  const totale = arrotonda(Number(imp?.importo_personalizzato ?? p.totale_finale ?? 0));
  const giaPagato = totalePagato(pagamenti);
  const blocco = (motivo: MotivoBlocco): EsitoRegole => ({ pagabile: false, motivo, totale, giaPagato });

  // Il pagamento online è attivo SOLO se l'operatore l'ha attivato su questo preventivo.
  if (!imp || imp.abilitato !== true) return blocco('disabilitato');
  if (imp.con_detrazione_fiscale) return blocco('detrazione');

  const firmato = p.firma_stato === 'firmato';
  if (!parametri.statiPagabili.includes(p.stato) && !firmato) return blocco('non_accettato');
  if (parametri.richiediFirma && !firmato) return blocco('firma_mancante');
  if (!(totale > 0)) return blocco('importo_non_valido');

  const residuo = arrotonda(totale - giaPagato);
  if (residuo < 0.5) return blocco('saldato'); // sotto 50 cent non ha senso un checkout

  const clienteAzienda = p.cliente_snapshot?.tipo === 'azienda';
  const escludiRate = clienteAzienda || !imp.rate_abilitate;
  const perc = percentualeEffettiva(imp, parametri);
  const opzione = (tipo: TipoPagamento, importo: number, etichetta: string): OpzionePagamento => ({
    tipo,
    importo,
    etichetta,
    rateIndicative: rateIndicative(importo, escludiRate),
  });

  let opzioni: OpzionePagamento[];
  if (perc === null) {
    // L'operatore chiede il totale (o il saldo, se c'è già stato un pagamento)
    opzioni = [opzione('saldo', residuo, giaPagato === 0 ? 'Importo totale' : 'Saldo')];
  } else if (giaPagato === 0) {
    const acconto = arrotonda((totale * perc) / 100);
    opzioni = [opzione('acconto', Math.min(acconto, residuo), `Acconto ${formattaPercentuale(perc)}`)];
  } else if (imp.saldo_online) {
    opzioni = [opzione('saldo', residuo, 'Saldo')];
  } else {
    return blocco('acconto_ricevuto');
  }

  return { pagabile: true, totale, giaPagato, residuo, clienteAzienda, escludiRate, opzioni };
}

export function formattaPercentuale(n: number) {
  return `${Number.isInteger(n) ? n : n.toFixed(1).replace('.', ',')}%`;
}

export const MESSAGGI_BLOCCO: Record<MotivoBlocco, string> = {
  disabilitato: 'Il pagamento online non è attivo per questo preventivo. Contattaci per le modalità di pagamento.',
  detrazione:
    'Per accedere alle detrazioni fiscali questo preventivo va pagato con bonifico parlante. Contattaci per i dati del bonifico.',
  non_accettato: 'Il pagamento sarà disponibile dopo l’accettazione del preventivo.',
  firma_mancante: 'Il pagamento sarà disponibile dopo la firma del preventivo.',
  importo_non_valido: 'Importo non disponibile. Contattaci per completare il pagamento.',
  acconto_ricevuto: 'Acconto ricevuto, grazie! Per il saldo ti contatteremo noi.',
  saldato: 'Questo preventivo risulta già interamente pagato. Grazie!',
};
