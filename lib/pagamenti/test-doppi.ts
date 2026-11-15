// Doppi per i test del motore pagamenti: archivio in memoria (preventivi di prova del modulo alm-pagamenti)
// e gateway finto al posto di Stripe. Solo per i test.
import type { Archivio, NuovoPagamento } from './archivio'
import type { Gateway, RichiestaSessione } from './gateway'
import type { ParametriPagamenti } from './servizio'
import { IMPOSTAZIONI_PREDEFINITE, type ImpostazioniPreventivo, type Pagamento, type Preventivo } from './tipi'

export const PARAMETRI_PROVA: ParametriPagamenti = {
  accontoPercentuale: 30, statiPagabili: ['accettato'], richiediFirma: false,
  metodiRateali: ['klarna', 'scalapay', 'alma'], baseUrl: 'https://winstudio.example',
}

const ORG = '00000000-0000-4000-8000-000000000001'

function datiDemo() {
  const prev = (n: string, token: string, totale: number, extra: Partial<Preventivo> = {}): Preventivo => ({
    id: `00000000-0000-4000-9000-00000000000${n}`, organization_id: ORG, numero: `2026/0${n}`,
    stato: 'accettato', firma_stato: 'firmato', totale_finale: totale,
    cliente_snapshot: { tipo: 'privato', nome: 'Mario', cognome: 'Rossi', email: 'mario.rossi@example.com' },
    share_token: token, ...extra,
  })
  const preventivi = [
    prev('1', 'demo-privato-1700', 1700),
    prev('2', 'demo-privato-4200', 4200),
    prev('3', 'demo-azienda-2500', 2500, { cliente_snapshot: { tipo: 'azienda', ragione_sociale: 'Edil Sud S.r.l.' } }),
    prev('4', 'demo-non-accettato', 980, { stato: 'inviato', firma_stato: null }),
    prev('5', 'demo-non-attivo', 6200),
  ]
  const imp = (i: number, x: Partial<ImpostazioniPreventivo>): ImpostazioniPreventivo =>
    ({ ...IMPOSTAZIONI_PREDEFINITE, preventivo_id: preventivi[i].id, abilitato: true, ...x })
  return {
    preventivi,
    impostazioni: [
      imp(0, { modalita: 'percentuale', acconto_percentuale: 30, saldo_online: true }),
      imp(1, { modalita: 'totale' }),
      imp(2, { modalita: 'totale' }),
      imp(3, { modalita: 'totale' }),
    ],
    // Solo il primo preventivo ha gia' la commessa
    commesse: new Map([[preventivi[0].id, '00000000-0000-4000-a000-000000000001']]),
  }
}

export class ArchivioMemoria implements Archivio {
  private db = datiDemo()
  pagamentiDb: Pagamento[] = []
  /** Acconti registrati: uno per pagamento (come il vincolo unico su pagamento_online_id) */
  acconti: { id: string; pagamento_id: string; commessa_id: string; importo: number; metodo: string | null }[] = []

  async preventivoDaToken(token: string) { return this.db.preventivi.find(p => p.share_token === token) ?? null }
  async preventivoDaId(id: string) { return this.db.preventivi.find(p => p.id === id) ?? null }
  async impostazioni(id: string) { return this.db.impostazioni.find(i => i.preventivo_id === id) ?? null }
  async salvaImpostazioni(imp: ImpostazioniPreventivo) {
    this.db.impostazioni = [...this.db.impostazioni.filter(i => i.preventivo_id !== imp.preventivo_id), imp]
    return imp
  }
  async pagamenti(id: string) { return this.pagamentiDb.filter(p => p.preventivo_id === id) }
  async pagamentoDaSessione(s: string) { return this.pagamentiDb.find(p => p.stripe_session_id === s) ?? null }
  async pagamentoDaPaymentIntent(pi: string) { return this.pagamentiDb.find(p => p.stripe_payment_intent === pi) ?? null }
  async creaPagamento(n: NuovoPagamento) {
    const p: Pagamento = { id: `pag_${this.pagamentiDb.length + 1}`, ...n, stato: 'creato', metodo: null, stripe_payment_intent: null,
      acconto_commessa_id: null, created_at: new Date().toISOString(), pagato_at: null }
    this.pagamentiDb.push(p)
    return p
  }
  async aggiornaStato(s: string, daStati: Pagamento['stato'][], patch: Partial<Pagamento>) {
    const p = this.pagamentiDb.find(x => x.stripe_session_id === s)
    if (!p || !daStati.includes(p.stato)) return null
    Object.assign(p, patch)
    return { ...p }
  }
  async commessaDelPreventivo(id: string) { return this.db.commesse.get(id) ?? null }
  async registraAccontoDaPagamento(p: Pagamento, commessaId: string, metodo: string | null) {
    if (this.acconti.some(a => a.pagamento_id === p.id)) return null
    const id = `acc_${this.acconti.length + 1}`
    this.acconti.push({ id, pagamento_id: p.id, commessa_id: commessaId, importo: p.importo, metodo })
    return id
  }
}

export class GatewayFinto implements Gateway {
  create: RichiestaSessione[] = []
  scadute: string[] = []
  async creaSessione(r: RichiestaSessione) {
    this.create.push(r)
    const id = `cs_test_${this.create.length}`
    return { id, url: `https://checkout.example/${id}` }
  }
  async scadiSessione(id: string) { this.scadute.push(id) }
  async metodoDaPaymentIntent() { return 'klarna' }
}
