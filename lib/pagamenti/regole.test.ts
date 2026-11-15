import { describe, expect, it } from 'vitest';
import { calcolaOpzioni, type ParametriRegole } from './regole';
import { IMPOSTAZIONI_PREDEFINITE, type ImpostazioniPreventivo, type Pagamento, type Preventivo } from './tipi';
import { validaImpostazioni } from './validazione';

const parametri: ParametriRegole = { accontoPercentuale: 30, statiPagabili: ['accettato'], richiediFirma: false };
const prev = (x: Partial<Preventivo> = {}): Preventivo => ({
  id: 'p1', organization_id: 'o1', numero: '1', stato: 'accettato', firma_stato: null,
  totale_finale: 1700, cliente_snapshot: { tipo: 'privato' }, share_token: 't', ...x,
});
const imp = (x: Partial<ImpostazioniPreventivo> = {}): ImpostazioniPreventivo => ({
  ...IMPOSTAZIONI_PREDEFINITE, preventivo_id: 'p1', abilitato: true, ...x,
});
const pag = (importo: number, stato: Pagamento['stato'] = 'pagato'): Pagamento => ({
  id: Math.random().toString(), organization_id: 'o1', preventivo_id: 'p1', tipo: 'acconto', importo, stato,
  metodo: 'card', stripe_session_id: Math.random().toString(), stripe_payment_intent: null,
  acconto_commessa_id: null, created_at: '', pagato_at: null,
});
const calcola = (i: ImpostazioniPreventivo | null, x: { p?: Partial<Preventivo>; pagamenti?: Pagamento[]; par?: Partial<ParametriRegole> } = {}) =>
  calcolaOpzioni({ preventivo: prev(x.p), impostazioni: i, pagamenti: x.pagamenti ?? [], parametri: { ...parametri, ...x.par } });

describe('attivazione decisa dall’operatore', () => {
  it('senza impostazioni il pagamento NON è attivo', () => {
    expect(calcola(null)).toMatchObject({ pagabile: false, motivo: 'disabilitato' });
  });
  it('spento dall’operatore → non attivo', () => {
    expect(calcola(imp({ abilitato: false }))).toMatchObject({ pagabile: false, motivo: 'disabilitato' });
  });
});

describe('percentuale o totale', () => {
  it('percentuale: chiede solo l’acconto', () => {
    const r = calcola(imp({ modalita: 'percentuale', acconto_percentuale: 30 }));
    expect(r.pagabile && r.opzioni.map((o) => [o.tipo, o.importo, o.etichetta])).toEqual([['acconto', 510, 'Acconto 30%']]);
  });
  it('percentuale senza valore → usa il default', () => {
    const r = calcola(imp({ modalita: 'percentuale', acconto_percentuale: null }), { par: { accontoPercentuale: 40 } });
    expect(r.pagabile && r.opzioni[0].importo).toBe(680);
  });
  it('dopo l’acconto: saldo online se permesso', () => {
    const r = calcola(imp({ acconto_percentuale: 30, saldo_online: true }), { pagamenti: [pag(510), pag(99, 'fallito')] });
    expect(r.pagabile && r.opzioni).toEqual([{ tipo: 'saldo', importo: 1190, etichetta: 'Saldo', rateIndicative: ['Klarna', 'Scalapay'] }]);
  });
  it('dopo l’acconto: blocca se il saldo online non è permesso', () => {
    expect(calcola(imp({ acconto_percentuale: 30, saldo_online: false }), { pagamenti: [pag(510)] }))
      .toMatchObject({ pagabile: false, motivo: 'acconto_ricevuto' });
  });
  it('totale: chiede l’intero importo', () => {
    const r = calcola(imp({ modalita: 'totale' }));
    expect(r.pagabile && r.opzioni.map((o) => [o.tipo, o.importo, o.etichetta])).toEqual([['saldo', 1700, 'Importo totale']]);
  });
  it('totale con pagamento parziale già ricevuto → saldo', () => {
    const r = calcola(imp({ modalita: 'totale' }), { pagamenti: [pag(700)] });
    expect(r.pagabile && r.opzioni[0]).toMatchObject({ importo: 1000, etichetta: 'Saldo' });
  });
  it('saldato → blocco', () => {
    expect(calcola(imp({ modalita: 'totale' }), { pagamenti: [pag(1700)] })).toMatchObject({ motivo: 'saldato' });
  });
  it('importo personalizzato e arrotondamento', () => {
    const r = calcola(imp({ acconto_percentuale: 33.33, importo_personalizzato: 1234.56 }));
    expect(r.pagabile && r.opzioni[0].importo).toBe(411.48);
  });
});

describe('rate', () => {
  it('rate spente dall’operatore → escluse', () => {
    const r = calcola(imp({ modalita: 'totale', rate_abilitate: false }));
    expect(r.pagabile && r.escludiRate).toBe(true);
    expect(r.pagabile && r.opzioni[0].rateIndicative).toEqual([]);
  });
  it('cliente azienda → escluse anche se attive', () => {
    const r = calcola(imp({ modalita: 'totale', rate_abilitate: true }), { p: { cliente_snapshot: { tipo: 'azienda' } } });
    expect(r.pagabile && r.escludiRate).toBe(true);
  });
  it('limiti: Klarna fino a 3.000, Scalapay fino a 5.000', () => {
    const medio = calcola(imp({ modalita: 'totale' }), { p: { totale_finale: 4200 } });
    expect(medio.pagabile && medio.opzioni[0].rateIndicative).toEqual(['Scalapay']);
    const grande = calcola(imp({ modalita: 'totale' }), { p: { totale_finale: 12000 } });
    expect(grande.pagabile && grande.opzioni[0].rateIndicative).toEqual([]);
    const acconto = calcola(imp({ acconto_percentuale: 20 }), { p: { totale_finale: 12000 } });
    expect(acconto.pagabile && acconto.opzioni[0]).toMatchObject({ importo: 2400, rateIndicative: ['Klarna', 'Scalapay'] });
  });
});

describe('altri blocchi', () => {
  it('non accettato / firmato / firma obbligatoria / detrazione', () => {
    expect(calcola(imp(), { p: { stato: 'inviato' } })).toMatchObject({ motivo: 'non_accettato' });
    expect(calcola(imp(), { p: { stato: 'inviato', firma_stato: 'firmato' } }).pagabile).toBe(true);
    expect(calcola(imp(), { par: { richiediFirma: true } })).toMatchObject({ motivo: 'firma_mancante' });
    expect(calcola(imp({ con_detrazione_fiscale: true }))).toMatchObject({ motivo: 'detrazione' });
  });
});

describe('validaImpostazioni', () => {
  it('normalizza e applica i default', () => {
    expect(validaImpostazioni('p1', { abilitato: true, modalita: 'totale' })).toEqual({
      preventivo_id: 'p1', abilitato: true, modalita: 'totale', acconto_percentuale: null, rate_abilitate: true,
      saldo_online: true, con_detrazione_fiscale: false, importo_personalizzato: null,
    });
  });
  it('rifiuta percentuali fuori range', () => {
    expect(() => validaImpostazioni('p1', { acconto_percentuale: 0 })).toThrow();
    expect(() => validaImpostazioni('p1', { acconto_percentuale: 100 })).toThrow();
    expect(validaImpostazioni('p1', { acconto_percentuale: '35' }).acconto_percentuale).toBe(35);
  });
  it('preventivo_id viene dall’URL, non dal body', () => {
    expect(validaImpostazioni('p1', { preventivo_id: 'altro' }).preventivo_id).toBe('p1');
  });
});

describe("preventivo cambiato dopo l'acconto", () => {
  it('saldo = nuovo totale meno pagato', () => {
    const r = calcola(imp({ modalita: 'totale' }), { p: { totale_finale: 1200 }, pagamenti: [pag(300)] });
    expect(r.pagabile && r.opzioni[0]).toMatchObject({ tipo: 'saldo', importo: 900 });
  });
  it('totale sceso sotto il pagato + 0,50 -> saldato, mai un saldo negativo', () => {
    expect(calcola(imp({ modalita: 'totale' }), { p: { totale_finale: 300.3 }, pagamenti: [pag(300)] })).toMatchObject({ pagabile: false, motivo: 'saldato' });
    expect(calcola(imp({ modalita: 'totale' }), { p: { totale_finale: 200 }, pagamenti: [pag(300)] })).toMatchObject({ pagabile: false, motivo: 'saldato' });
  });
});
