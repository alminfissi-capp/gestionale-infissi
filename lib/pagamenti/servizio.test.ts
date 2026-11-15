import { beforeEach, describe, expect, it } from 'vitest'
import { avviaPagamento, gestisciEvento, ErrorePagamento, type Dipendenze } from './servizio'
import { metodoAcconto } from './metodo'
import { ArchivioMemoria, GatewayFinto, PARAMETRI_PROVA } from './test-doppi'

let d: Dipendenze & { gateway: GatewayFinto; archivio: ArchivioMemoria };
beforeEach(() => {
  d = { archivio: new ArchivioMemoria(), gateway: new GatewayFinto(), parametri: PARAMETRI_PROVA };
});

describe('flusso completo', () => {
  it('acconto → webhook → saldo → webhook, con acconti_commessa e idempotenza', async () => {
    const r1 = await avviaPagamento('demo-privato-1700', 'acconto', d);
    expect(r1.url).toBe('https://checkout.example/cs_test_1');
    expect(d.gateway.create[0]).toMatchObject({ importo: 510, escludiMetodi: [], urlAnnulla: 'https://winstudio.example/p/demo-privato-1700' });
    expect(d.gateway.create[0].urlSuccesso).toContain('{CHECKOUT_SESSION_ID}');

    // l'importo arriva dal server: il saldo NON è disponibile finché l'acconto non è pagato
    const ev = { tipo: 'riuscito' as const, sessionId: 'cs_test_1', paymentIntentId: 'pi_1' };
    expect((await gestisciEvento(ev, d)).esito).toBe('aggiornato');
    expect((await gestisciEvento(ev, d)).esito).toBe('ignorato'); // evento ripetuto da Stripe

    const pagamenti = await d.archivio.pagamenti('00000000-0000-4000-9000-000000000001');
    expect(pagamenti[0]).toMatchObject({ stato: 'pagato', metodo: 'klarna', importo: 510 });
    expect(pagamenti[0].acconto_commessa_id).toBeTruthy();
    expect(d.archivio.acconti).toHaveLength(1); // un solo acconto anche con l'evento ripetuto
    expect(d.archivio.acconti[0]).toMatchObject({ metodo: 'klarna', importo: 510 });

    await avviaPagamento('demo-privato-1700', 'saldo', d);
    expect(d.gateway.create[1].importo).toBe(1190);
    await expect(avviaPagamento('demo-privato-1700', 'acconto', d)).rejects.toThrow(/non disponibile/);
  });

  it('con la percentuale il saldo non è pagabile prima dell’acconto', async () => {
    await expect(avviaPagamento('demo-privato-1700', 'saldo', d)).rejects.toThrow(/non disponibile/);
  });

  it('una nuova richiesta chiude il checkout precedente ancora aperto', async () => {
    await avviaPagamento('demo-privato-1700', 'acconto', d);
    await avviaPagamento('demo-privato-1700', 'acconto', d);
    expect(d.gateway.scadute).toEqual(['cs_test_1']);
    expect((await d.archivio.pagamentoDaSessione('cs_test_1'))?.stato).toBe('annullato');
    // ...ma se il cliente aveva comunque pagato quella sessione, il pagamento si registra
    expect((await gestisciEvento({ tipo: 'riuscito', sessionId: 'cs_test_1', paymentIntentId: 'pi_x' }, d)).esito).toBe('aggiornato');
  });

  it('l’operatore decide: rate spente, poi pagamento disattivato dopo l’invio del link', async () => {
    const id = '00000000-0000-4000-9000-000000000002'; // demo-privato-4200, modalità totale
    const imp = (await d.archivio.impostazioni(id))!;
    await avviaPagamento('demo-privato-4200', 'saldo', d);
    expect(d.gateway.create[0].escludiMetodi).toEqual([]);
    await d.archivio.salvaImpostazioni({ ...imp, rate_abilitate: false }, 'o');
    await avviaPagamento('demo-privato-4200', 'saldo', d);
    expect(d.gateway.create[1].escludiMetodi).toEqual(['klarna', 'scalapay', 'alma']);
    await d.archivio.salvaImpostazioni({ ...imp, abilitato: false }, 'o');
    await expect(avviaPagamento('demo-privato-4200', 'saldo', d)).rejects.toMatchObject({ status: 409 });
  });

  it('cliente azienda: rate escluse', async () => {
    await avviaPagamento('demo-azienda-2500', 'saldo', d);
    expect(d.gateway.create[0].escludiMetodi).toEqual(['klarna', 'scalapay', 'alma']);
  });

  it('rifiuta preventivi non pagabili o inesistenti', async () => {
    await expect(avviaPagamento('demo-non-accettato', 'saldo', d)).rejects.toMatchObject({ status: 409 });
    await expect(avviaPagamento('demo-non-attivo', 'saldo', d)).rejects.toThrow(/non è attivo/);
    await expect(avviaPagamento('non-esiste', 'saldo', d)).rejects.toBeInstanceOf(ErrorePagamento);
  });

  it('pagamento asincrono: in attesa blocca nuovi checkout, poi riuscito', async () => {
    await avviaPagamento('demo-privato-4200', 'saldo', d);
    await gestisciEvento({ tipo: 'in_attesa', sessionId: 'cs_test_1', paymentIntentId: 'pi_2' }, d);
    await expect(avviaPagamento('demo-privato-4200', 'saldo', d)).rejects.toThrow(/conferma/);
    await gestisciEvento({ tipo: 'riuscito', sessionId: 'cs_test_1', paymentIntentId: 'pi_2' }, d);
    expect((await d.archivio.pagamentoDaSessione('cs_test_1'))?.stato).toBe('pagato');
  });

  it('scadenza e rimborso', async () => {
    await avviaPagamento('demo-privato-4200', 'saldo', d);
    await gestisciEvento({ tipo: 'scaduto', sessionId: 'cs_test_1' }, d);
    expect((await d.archivio.pagamentoDaSessione('cs_test_1'))?.stato).toBe('scaduto');

    await avviaPagamento('demo-privato-4200', 'saldo', d);
    await gestisciEvento({ tipo: 'riuscito', sessionId: 'cs_test_2', paymentIntentId: 'pi_r' }, d);
    await gestisciEvento({ tipo: 'rimborsato', paymentIntentId: 'pi_r' }, d);
    expect((await d.archivio.pagamentoDaSessione('cs_test_2'))?.stato).toBe('rimborsato');
    // dopo il rimborso il preventivo torna pagabile
    await expect(avviaPagamento('demo-privato-4200', 'saldo', d)).resolves.toBeTruthy();
  });

  it("senza commessa collegata: pagato ma nessun acconto (arrivera' alla creazione della commessa)", async () => {
    await avviaPagamento('demo-privato-4200', 'saldo', d);
    const r = await gestisciEvento({ tipo: 'riuscito', sessionId: 'cs_test_1', paymentIntentId: 'pi' }, d);
    expect(r.pagamento).toMatchObject({ stato: 'pagato', acconto_commessa_id: null });
    expect(d.archivio.acconti).toHaveLength(0);
  });
});

describe("metodo dell'acconto", () => {
  it('rate per Klarna, Scalapay, Alma; carta per tutto il resto', () => {
    expect(metodoAcconto('klarna')).toBe('rate')
    expect(metodoAcconto('scalapay')).toBe('rate')
    expect(metodoAcconto('alma')).toBe('rate')
    expect(metodoAcconto('card')).toBe('carta')
    expect(metodoAcconto('paypal')).toBe('carta')
    expect(metodoAcconto(null)).toBe('carta')
  })
})

describe('correzioni della revisione finale', () => {
  it("se la registrazione dell'acconto fallisce, il nuovo tentativo di Stripe la completa", async () => {
    await avviaPagamento('demo-privato-1700', 'acconto', d)
    d.archivio.guastiRegistrazione = 1
    const ev = { tipo: 'riuscito' as const, sessionId: 'cs_test_1', paymentIntentId: 'pi_1' }
    await expect(gestisciEvento(ev, d)).rejects.toThrow()
    const r = await gestisciEvento(ev, d)
    expect(r.esito).toBe('aggiornato')
    expect(d.archivio.acconti).toHaveLength(1)
    expect((await d.archivio.pagamentoDaSessione('cs_test_1'))?.acconto_commessa_id).toBeTruthy()
    expect((await gestisciEvento(ev, d)).esito).toBe('ignorato') // terzo arrivo: niente di nuovo
  })

  it('se Stripe non dice il metodo, il pagamento si registra lo stesso', async () => {
    await avviaPagamento('demo-privato-1700', 'acconto', d)
    d.gateway.metodoGuasto = true
    const r = await gestisciEvento({ tipo: 'riuscito', sessionId: 'cs_test_1', paymentIntentId: 'pi_1' }, d)
    expect(r.pagamento).toMatchObject({ stato: 'pagato', metodo: null })
    expect(d.archivio.acconti).toHaveLength(1)
  })

  it("rimborso totale: l'acconto esce dalla commessa (niente doppio conteggio col pagamento successivo)", async () => {
    await avviaPagamento('demo-privato-1700', 'acconto', d)
    await gestisciEvento({ tipo: 'riuscito', sessionId: 'cs_test_1', paymentIntentId: 'pi_1' }, d)
    expect(d.archivio.acconti).toHaveLength(1)
    await gestisciEvento({ tipo: 'rimborsato', paymentIntentId: 'pi_1' }, d)
    expect(d.archivio.acconti).toHaveLength(0)
    expect((await d.archivio.pagamentoDaSessione('cs_test_1'))?.stato).toBe('rimborsato')
  })

  it("la commessa si cerca nell'organizzazione del preventivo", async () => {
    await avviaPagamento('demo-privato-1700', 'acconto', d)
    await gestisciEvento({ tipo: 'riuscito', sessionId: 'cs_test_1', paymentIntentId: 'pi_1' }, d)
    expect(d.archivio.chiamateCommessa).toEqual([['00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000001']])
  })
})
