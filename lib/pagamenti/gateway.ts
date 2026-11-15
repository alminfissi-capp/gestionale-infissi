// Stripe Checkout, con la chiave segreta dell'organizzazione (Impostazioni → Collegamenti).
// Dal modulo alm-pagamenti, senza simulatore.
import Stripe from 'stripe'

export interface RichiestaSessione {
  preventivoId: string
  organizationId: string
  numeroPreventivo: string
  tipo: 'acconto' | 'saldo'
  etichetta: string
  /** euro, IVA inclusa */
  importo: number
  emailCliente?: string
  /** deve contenere {CHECKOUT_SESSION_ID} */
  urlSuccesso: string
  urlAnnulla: string
  escludiMetodi: string[]
}

export interface Gateway {
  creaSessione(r: RichiestaSessione): Promise<{ id: string; url: string }>
  scadiSessione(id: string): Promise<void>
  metodoDaPaymentIntent(paymentIntentId: string): Promise<string | null>
}

export const centesimi = (euro: number) => Math.round(euro * 100)

export const clientStripe = (chiaveSegreta: string) => new Stripe(chiaveSegreta, { appInfo: { name: 'WinStudio' } })

export function creaGatewayStripe(chiaveSegreta: string): Gateway {
  const stripe = clientStripe(chiaveSegreta)
  return {
    async creaSessione(r) {
      const metadata = { preventivo_id: r.preventivoId, organization_id: r.organizationId, numero_preventivo: r.numeroPreventivo, tipo: r.tipo }
      // Nessun payment_method_types: i metodi si accendono dalla dashboard Stripe, che mostra solo quelli
      // compatibili con importo e cliente.
      const s = await stripe.checkout.sessions.create({
        mode: 'payment',
        locale: 'it',
        currency: 'eur',
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: centesimi(r.importo),
            product_data: {
              name: `Preventivo n. ${r.numeroPreventivo} – ${r.etichetta}`,
              description: 'Fornitura e posa serramenti come da preventivo accettato',
            },
          },
        }],
        customer_email: r.emailCliente || undefined,
        client_reference_id: r.preventivoId,
        metadata,
        payment_intent_data: { metadata, description: `Preventivo ${r.numeroPreventivo} – ${r.etichetta}` },
        success_url: r.urlSuccesso,
        cancel_url: r.urlAnnulla,
        expires_at: Math.floor(Date.now() / 1000) + 23 * 3600,
        ...(r.escludiMetodi.length
          ? { excluded_payment_method_types: r.escludiMetodi as Stripe.Checkout.SessionCreateParams.ExcludedPaymentMethodType[] }
          : {}),
      })
      if (!s.url) throw new Error('Stripe non ha restituito l’URL di checkout')
      return { id: s.id, url: s.url }
    },
    async scadiSessione(id) {
      try { await stripe.checkout.sessions.expire(id) } catch { /* gia' scaduta o completata */ }
    },
    async metodoDaPaymentIntent(pi) {
      const intent = await stripe.paymentIntents.retrieve(pi, { expand: ['latest_charge'] })
      const charge = intent.latest_charge as Stripe.Charge | null
      return charge?.payment_method_details?.type ?? intent.payment_method_types?.[0] ?? null
    },
  }
}
