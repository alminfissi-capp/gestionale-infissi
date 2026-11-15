// Orchestrazione: avvio pagamento e gestione degli eventi di Stripe.

import type Stripe from 'stripe';
import type { Archivio } from './archivio';
import type { Gateway } from './gateway';
import { calcolaOpzioni, MESSAGGI_BLOCCO, type ParametriRegole } from './regole';
import type { Pagamento, TipoPagamento } from './tipi';
import { nomeMetodo } from './metodo';

export { nomeMetodo };

/** Parametri del motore (prima variabili d'ambiente nel modulo): uguali per tutta WinStudio */
export interface ParametriPagamenti extends ParametriRegole {
  /** Metodi Stripe esclusi quando le rate non valgono (aziende o rate spente) */
  metodiRateali: string[];
  /** Indirizzo pubblico di WinStudio: le pagine del cliente sono {baseUrl}/p/{token} */
  baseUrl: string;
}

export class ErrorePagamento extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface Dipendenze {
  archivio: Archivio;
  gateway: Gateway;
  parametri: ParametriPagamenti;
}

export async function caricaSituazione(token: string, d: Pick<Dipendenze, 'archivio' | 'parametri'>) {
  const preventivo = await d.archivio.preventivoDaToken(token);
  if (!preventivo) return null;
  const [impostazioni, pagamenti] = await Promise.all([
    d.archivio.impostazioni(preventivo.id),
    d.archivio.pagamenti(preventivo.id),
  ]);
  const esito = calcolaOpzioni({ preventivo, impostazioni, pagamenti, parametri: d.parametri });
  const inAttesa = pagamenti.some((p) => p.stato === 'in_attesa');
  return { preventivo, impostazioni, pagamenti, esito, inAttesa };
}

export async function avviaPagamento(token: string, tipo: TipoPagamento, d: Dipendenze) {
  const s = await caricaSituazione(token, d);
  if (!s) throw new ErrorePagamento(404, 'Preventivo non trovato');
  if (!s.esito.pagabile) throw new ErrorePagamento(409, MESSAGGI_BLOCCO[s.esito.motivo]);
  if (s.inAttesa)
    throw new ErrorePagamento(409, 'C’è già un pagamento in fase di conferma. Riprova tra qualche minuto.');

  const opzione = s.esito.opzioni.find((o) => o.tipo === tipo);
  if (!opzione) throw new ErrorePagamento(400, 'Opzione di pagamento non disponibile');

  // Chiude eventuali checkout ancora aperti per evitare doppi pagamenti.
  for (const vecchio of s.pagamenti.filter((p) => p.stato === 'creato')) {
    await d.gateway.scadiSessione(vecchio.stripe_session_id);
    await d.archivio.aggiornaStato(vecchio.stripe_session_id, ['creato'], { stato: 'annullato' });
  }

  const p = s.preventivo;
  const base = `${d.parametri.baseUrl}/p/${encodeURIComponent(token)}`;
  const sessione = await d.gateway.creaSessione({
    preventivoId: p.id,
    organizationId: p.organization_id,
    numeroPreventivo: p.numero,
    tipo,
    etichetta: opzione.etichetta,
    importo: opzione.importo,
    emailCliente: p.cliente_snapshot?.email,
    urlSuccesso: `${base}/esito?sessione={CHECKOUT_SESSION_ID}`,
    urlAnnulla: base,
    escludiMetodi: s.esito.escludiRate ? d.parametri.metodiRateali : [],
  });

  await d.archivio.creaPagamento({
    organization_id: p.organization_id,
    preventivo_id: p.id,
    tipo,
    importo: opzione.importo,
    stripe_session_id: sessione.id,
  });
  return { url: sessione.url };
}

// ---------------- Eventi ----------------

export type EventoPagamento =
  | { tipo: 'riuscito'; sessionId: string; paymentIntentId: string | null; metodo?: string | null }
  | { tipo: 'in_attesa'; sessionId: string; paymentIntentId: string | null }
  | { tipo: 'fallito'; sessionId: string }
  | { tipo: 'scaduto'; sessionId: string }
  | { tipo: 'rimborsato'; paymentIntentId: string };

/** Traduce un evento Stripe nel formato interno. Restituisce null per gli eventi che non ci interessano. */
export function normalizzaEventoStripe(e: Stripe.Event): EventoPagamento | null {
  const pi = (s: Stripe.Checkout.Session) =>
    typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent?.id ?? null);
  switch (e.type) {
    case 'checkout.session.completed': {
      const s = e.data.object;
      if (s.payment_status === 'paid') return { tipo: 'riuscito', sessionId: s.id, paymentIntentId: pi(s) };
      if (s.payment_status === 'unpaid') return { tipo: 'in_attesa', sessionId: s.id, paymentIntentId: pi(s) };
      return null;
    }
    case 'checkout.session.async_payment_succeeded':
      return { tipo: 'riuscito', sessionId: e.data.object.id, paymentIntentId: pi(e.data.object) };
    case 'checkout.session.async_payment_failed':
      return { tipo: 'fallito', sessionId: e.data.object.id };
    case 'checkout.session.expired':
      return { tipo: 'scaduto', sessionId: e.data.object.id };
    case 'charge.refunded': {
      const c = e.data.object;
      // Solo rimborso totale: i rimborsi parziali restano visibili su Stripe.
      if (!c.refunded) return null;
      const id = typeof c.payment_intent === 'string' ? c.payment_intent : c.payment_intent?.id;
      return id ? { tipo: 'rimborsato', paymentIntentId: id } : null;
    }
    default:
      return null;
  }
}


export async function gestisciEvento(
  ev: EventoPagamento,
  d: Dipendenze,
): Promise<{ esito: 'aggiornato' | 'ignorato'; pagamento?: Pagamento }> {
  const { archivio } = d;
  switch (ev.tipo) {
    case 'riuscito': {
      const metodo =
        ev.metodo ?? (ev.paymentIntentId ? await d.gateway.metodoDaPaymentIntent(ev.paymentIntentId) : null);
      // Anche una sessione "annullata/scaduta" può risultare pagata (il cliente era già dentro
      // il checkout): i soldi sono arrivati, quindi va registrata comunque.
      const p = await archivio.aggiornaStato(ev.sessionId, ['creato', 'in_attesa', 'annullato', 'scaduto', 'fallito'], {
        stato: 'pagato',
        metodo,
        stripe_payment_intent: ev.paymentIntentId,
        pagato_at: new Date().toISOString(),
      });
      if (!p) return { esito: 'ignorato' }; // già registrato (evento ripetuto) o sessione sconosciuta
      // Acconto in commessa se il preventivo ne ha gia' una; altrimenti arriva quando la commessa viene creata.
      const commessa = await archivio.commessaDelPreventivo(p.preventivo_id);
      if (commessa) {
        const idAcconto = await archivio.registraAccontoDaPagamento(p, commessa, metodo);
        if (idAcconto) {
          const agg = await archivio.aggiornaStato(ev.sessionId, ['pagato'], { acconto_commessa_id: idAcconto });
          return { esito: 'aggiornato', pagamento: agg ?? p };
        }
      }
      return { esito: 'aggiornato', pagamento: p };
    }
    case 'in_attesa': {
      const p = await archivio.aggiornaStato(ev.sessionId, ['creato'], {
        stato: 'in_attesa',
        stripe_payment_intent: ev.paymentIntentId,
      });
      return p ? { esito: 'aggiornato', pagamento: p } : { esito: 'ignorato' };
    }
    case 'fallito': {
      const p = await archivio.aggiornaStato(ev.sessionId, ['creato', 'in_attesa'], { stato: 'fallito' });
      return p ? { esito: 'aggiornato', pagamento: p } : { esito: 'ignorato' };
    }
    case 'scaduto': {
      const p = await archivio.aggiornaStato(ev.sessionId, ['creato'], { stato: 'scaduto' });
      return p ? { esito: 'aggiornato', pagamento: p } : { esito: 'ignorato' };
    }
    case 'rimborsato': {
      const trovato = await archivio.pagamentoDaPaymentIntent(ev.paymentIntentId);
      if (!trovato) return { esito: 'ignorato' };
      const p = await archivio.aggiornaStato(trovato.stripe_session_id, ['pagato'], { stato: 'rimborsato' });
      return p ? { esito: 'aggiornato', pagamento: p } : { esito: 'ignorato' };
    }
  }
}
