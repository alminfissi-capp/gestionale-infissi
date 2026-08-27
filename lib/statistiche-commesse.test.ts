import { describe, it, expect } from 'vitest'
import {
  aggregaFlussoMese,
  aggregaUscitePerCategoria,
  riepilogoCreditiDebiti,
  resocontoCliente,
  clientiUnici,
  type AccontoRow,
  type AltroCreditoRow,
  type ContoDipendenteRow,
  type PagamentoDipendenteRow,
  type ScadenzaRow,
  type StatRow,
} from '@/lib/statistiche-commesse'
import { riepilogoBanche, type RiepilogoBanche } from '@/lib/banche'

// Nessuna banca: il caso di chi non ha ancora compilato i fidi.
const nessunaBanca: RiepilogoBanche = riepilogoBanche([], [], [], {}, '2026-08-27')

const acconti: AccontoRow[] = [
  { commessa_id: 'c1', importo: 1000, data_pagamento: '2026-01-15' },
  { commessa_id: 'c2', importo: 500, data_pagamento: '2026-01-20' },
  { commessa_id: 'c3', importo: 2000, data_pagamento: '2026-03-02' },
  { commessa_id: 'c4', importo: 999, data_pagamento: '2025-01-10' }, // altro anno
  { commessa_id: 'c5', importo: 777, data_pagamento: null },         // senza data
]

const scadenze: ScadenzaRow[] = [
  { data_scadenza: '2026-01-31', importo: 400, pagato: true, annullata: false, categoria: 'assegno' },
  { data_scadenza: '2026-03-10', importo: 300, pagato: true, annullata: false, categoria: 'assegno' },
  { data_scadenza: '2026-03-15', importo: 900, pagato: false, annullata: false, categoria: 'assegno' }, // non pagata
  { data_scadenza: '2026-03-20', importo: 800, pagato: true, annullata: true, categoria: 'assegno' },   // annullata
  { data_scadenza: '2027-01-05', importo: 100, pagato: true, annullata: false, categoria: 'assegno' },  // altro anno
  { data_scadenza: null, importo: 50, pagato: false, annullata: false, categoria: 'assegno' },          // da programmare
]

describe('aggregaFlussoMese', () => {
  it('restituisce sempre 12 mesi in ordine', () => {
    const r = aggregaFlussoMese([], [], [], '2026')
    expect(r).toHaveLength(12)
    expect(r[0].mese).toBe('Gen')
    expect(r[11].mese).toBe('Dic')
    expect(r.every((p) => p.incasso === 0 && p.pagamento === 0 && p.saldo === 0)).toBe(true)
  })

  it('somma gli incassi sul mese della data di pagamento', () => {
    const r = aggregaFlussoMese(acconti, scadenze, [], '2026')
    expect(r[0].incasso).toBe(1500) // gennaio: 1000 + 500
    expect(r[2].incasso).toBe(2000) // marzo
    expect(r[1].incasso).toBe(0)    // febbraio
  })

  it('conta come pagamento solo le scadenze pagate e non annullate', () => {
    const r = aggregaFlussoMese(acconti, scadenze, [], '2026')
    expect(r[0].pagamento).toBe(400) // gennaio
    expect(r[2].pagamento).toBe(300) // marzo: esclude la non pagata e l'annullata
  })

  it('ignora le righe di un altro anno o senza data', () => {
    const r = aggregaFlussoMese(acconti, scadenze, [], '2026')
    const totIncassi = r.reduce((s, p) => s + p.incasso, 0)
    const totPagamenti = r.reduce((s, p) => s + p.pagamento, 0)
    expect(totIncassi).toBe(3500) // esclusi 999 (2025) e 777 (senza data)
    expect(totPagamenti).toBe(700) // esclusi 100 (2027) e 50 (senza data)
  })

  it('calcola il saldo mensile come incassi meno pagamenti', () => {
    const r = aggregaFlussoMese(acconti, scadenze, [], '2026')
    expect(r[0].saldo).toBe(1100) // 1500 - 400
    expect(r[2].saldo).toBe(1700) // 2000 - 300
  })

  it('produce un saldo negativo quando esce più di quanto entra', () => {
    const soloUscite: ScadenzaRow[] = [
      { data_scadenza: '2026-05-10', importo: 250, pagato: true, annullata: false, categoria: 'assegno' },
    ]
    const r = aggregaFlussoMese([], soloUscite, [], '2026')
    expect(r[4].saldo).toBe(-250)
  })

  it('somma ai pagamenti anche gli stipendi versati ai dipendenti', () => {
    const stipendi: PagamentoDipendenteRow[] = [
      { data_pagamento: '2026-01-27', importo: 1800 },
      { data_pagamento: '2026-01-28', importo: 1200 },
      { data_pagamento: '2025-01-27', importo: 500 },  // altro anno
      { data_pagamento: null, importo: 300 },          // senza data
    ]
    const r = aggregaFlussoMese(acconti, scadenze, stipendi, '2026')
    expect(r[0].pagamento).toBe(3400) // 400 di scadenze + 3000 di stipendi
    expect(r[0].saldo).toBe(-1900)    // 1500 incassati - 3400 usciti
    const totPagamenti = r.reduce((s, p) => s + p.pagamento, 0)
    expect(totPagamenti).toBe(3700)   // 700 di scadenze + 3000 di stipendi
  })
})

const OGGI = '2026-08-16'

const commesseRiep: StatRow[] = [
  { id: 'c1', cliente_nome: 'Rossi', totale: 10000, data_conferma: '2026-02-01', blocco: '2026', stato: 'in_lavorazione' },
  { id: 'c2', cliente_nome: 'Bianchi', totale: 5000, data_conferma: '2026-03-01', blocco: '2026', stato: 'consegnato' },
  { id: 'c3', cliente_nome: 'Verdi', totale: 2000, data_conferma: '2025-11-01', blocco: '2025', stato: 'da_iniziare' },
]

const accontiRiep: AccontoRow[] = [
  { commessa_id: 'c1', importo: 4000, data_pagamento: '2026-02-10' },
  { commessa_id: 'c2', importo: 7000, data_pagamento: '2026-03-05' }, // incassata in eccesso
]

const scadenzeRiep: ScadenzaRow[] = [
  { data_scadenza: '2026-07-01', importo: 300, pagato: false, annullata: false, categoria: 'assegno' }, // scaduta
  { data_scadenza: '2026-08-16', importo: 100, pagato: false, annullata: false, categoria: 'assegno' }, // oggi
  { data_scadenza: '2026-12-31', importo: 700, pagato: false, annullata: false, categoria: 'assegno' }, // entro l'anno
  { data_scadenza: '2027-01-01', importo: 900, pagato: false, annullata: false, categoria: 'assegno' }, // futura
  { data_scadenza: null, importo: 50, pagato: false, annullata: false, categoria: 'assegno' },          // da programmare
  { data_scadenza: '2026-07-05', importo: 999, pagato: true, annullata: false, categoria: 'assegno' },  // già pagata
  { data_scadenza: '2026-07-06', importo: 888, pagato: false, annullata: true, categoria: 'assegno' },  // annullata
]

describe('riepilogoCreditiDebiti', () => {
  it('somma i crediti come residuo per commessa, senza compensare fra commesse', () => {
    const r = riepilogoCreditiDebiti(commesseRiep, accontiRiep, [], [], [], OGGI, nessunaBanca)
    // c1: 10000-4000 = 6000 · c2: -2000 → 0 (non riduce c1) · c3: 2000
    expect(r.creditiCommesse).toBe(8000)
    expect(r.crediti).toBe(8000)
  })

  it('somma agli altri crediti gli incassi in attesa non ancora incassati', () => {
    const altri: AltroCreditoRow[] = [
      { importo: 3000, incassato: false },
      { importo: 500, incassato: false },
      { importo: 9999, incassato: true }, // già incassato: non è più un credito
    ]
    const r = riepilogoCreditiDebiti(commesseRiep, accontiRiep, altri, [], [], OGGI, nessunaBanca)
    expect(r.creditiCommesse).toBe(8000)
    expect(r.creditiAltri).toBe(3500)
    expect(r.crediti).toBe(11500)
  })

  it('divide i debiti per orizzonte rispetto a oggi', () => {
    const r = riepilogoCreditiDebiti([], [], [], scadenzeRiep, [], OGGI, nessunaBanca)
    expect(r.debitiScaduti).toBe(300)
    expect(r.debitiAnno).toBe(800) // 100 di oggi + 700 di fine anno
    expect(r.debitiFuturi).toBe(900)
    expect(r.debitiDaProgrammare).toBe(50)
  })

  it('una scadenza in data odierna non è ancora scaduta', () => {
    const r = riepilogoCreditiDebiti([], [], [], [
      { data_scadenza: OGGI, importo: 100, pagato: false, annullata: false, categoria: 'assegno' },
    ], [], OGGI, nessunaBanca)
    expect(r.debitiScaduti).toBe(0)
    expect(r.debitiAnno).toBe(100)
  })

  it('esclude dai debiti le scadenze pagate e quelle annullate', () => {
    const r = riepilogoCreditiDebiti([], [], [], scadenzeRiep, [], OGGI, nessunaBanca)
    expect(r.debitiTotali).toBe(2050) // 300+800+900+50, senza 999 e 888
  })

  it('tiene le rate future fuori dalla posizione netta', () => {
    const r = riepilogoCreditiDebiti(commesseRiep, accontiRiep, [], scadenzeRiep, [], OGGI, nessunaBanca)
    // 8000 - (300 + 800 + 50) = 6850
    expect(r.posizioneNetta).toBe(6850)
  })

  it('conta come debito lo stipendio maturato e non ancora versato', () => {
    const conti: ContoDipendenteRow[] = [
      { dovuto: 2000, pagato: 1200 }, // 800 residuo
      { dovuto: 1500, pagato: 1500 }, // saldato
      { dovuto: 900, pagato: 1100 },  // pagato in anticipo → 0, non compensa gli altri
    ]
    const r = riepilogoCreditiDebiti([], [], [], [], conti, OGGI, nessunaBanca)
    expect(r.debitiDipendenti).toBe(800)
  })

  it('include gli stipendi arretrati nel totale e nella posizione netta', () => {
    const conti: ContoDipendenteRow[] = [{ dovuto: 1000, pagato: 400 }] // 600
    const r = riepilogoCreditiDebiti(commesseRiep, accontiRiep, [], scadenzeRiep, conti, OGGI, nessunaBanca)
    expect(r.debitiTotali).toBe(2650)   // 2050 + 600
    expect(r.posizioneNetta).toBe(6250) // 6850 - 600
  })

  it('divide i crediti da commesse per stato, e le righe sommano al totale', () => {
    const r = riepilogoCreditiDebiti(commesseRiep, accontiRiep, [], [], [], OGGI, nessunaBanca)
    // ordine del flusso di lavoro, non per importo
    expect(r.creditiPerStato).toEqual([
      { stato: 'da_iniziare', label: 'Da iniziare', importo: 2000, numero: 1 },
      { stato: 'in_lavorazione', label: 'In lavorazione', importo: 6000, numero: 1 },
    ])
    // c2 è incassata in eccesso: niente riga "Consegnato"
    const somma = r.creditiPerStato.reduce((s, x) => s + x.importo, 0)
    expect(somma).toBe(r.creditiCommesse)
  })

  it('tiene fuori dai crediti gli stati che non sono in STATI_CREDITO', () => {
    const commesse: StatRow[] = [
      { id: 'v2', cliente_nome: 'Gialli', totale: 1000, data_conferma: '2026-01-01', blocco: '2026', stato: 'in_attesa' },
      { id: 'v3', cliente_nome: 'Blu', totale: 500, data_conferma: '2026-01-01', blocco: '2026', stato: 'bloccato' },
    ]
    const r = riepilogoCreditiDebiti(commesse, [], [], [], [], OGGI, nessunaBanca)
    expect(r.creditiCommesse).toBe(500)
    expect(r.creditiPerStato).toEqual([
      { stato: 'bloccato', label: 'Bloccato', importo: 500, numero: 1 },
    ])
  })

  // Una commessa conclusa dovrebbe essere pagata: se ha ancora un residuo è un errore di
  // stato, e va mostrato invece di sparire dai conti.
  it('mostra il residuo delle commesse concluse invece di ignorarlo', () => {
    const commesse: StatRow[] = [
      { id: 'z1', cliente_nome: 'Neri', totale: 3000, data_conferma: '2026-01-01', blocco: '2026', stato: 'concluso' },
      { id: 'z2', cliente_nome: 'Blu', totale: 500, data_conferma: '2026-01-01', blocco: '2026', stato: 'in_lavorazione' },
    ]
    const r = riepilogoCreditiDebiti(commesse, [], [], [], [], OGGI, nessunaBanca)
    expect(r.creditiCommesse).toBe(3500)
    expect(r.creditiPerStato).toEqual([
      { stato: 'in_lavorazione', label: 'In lavorazione', importo: 500, numero: 1 },
      { stato: 'concluso', label: 'Concluso', importo: 3000, numero: 1 },
    ])
  })

  it('non dà una riga alle commesse concluse e saldate', () => {
    const commesse: StatRow[] = [
      { id: 'z1', cliente_nome: 'Neri', totale: 3000, data_conferma: '2026-01-01', blocco: '2026', stato: 'concluso' },
    ]
    const acconti: AccontoRow[] = [{ commessa_id: 'z1', importo: 3000, data_pagamento: '2026-02-01' }]
    const r = riepilogoCreditiDebiti(commesse, acconti, [], [], [], OGGI, nessunaBanca)
    expect(r.creditiCommesse).toBe(0)
    expect(r.creditiPerStato).toEqual([])
  })

  it('somma nella stessa riga le commesse con lo stesso stato, contandole', () => {
    const commesse: StatRow[] = [
      { id: 'p1', cliente_nome: 'Uno', totale: 1000, data_conferma: '2026-01-01', blocco: '2026', stato: 'parzialmente_consegnato' },
      { id: 'p2', cliente_nome: 'Due', totale: 400, data_conferma: '2026-01-01', blocco: '2026', stato: 'parzialmente_consegnato' },
      { id: 'p3', cliente_nome: 'Tre', totale: 900, data_conferma: '2026-01-01', blocco: '2026', stato: 'parzialmente_consegnato' },
    ]
    const acconti: AccontoRow[] = [{ commessa_id: 'p3', importo: 900, data_pagamento: '2026-02-01' }]
    const r = riepilogoCreditiDebiti(commesse, acconti, [], [], [], OGGI, nessunaBanca)
    // p3 è saldata: non conta né come importo né come numero
    expect(r.creditiPerStato).toEqual([
      { stato: 'parzialmente_consegnato', label: 'Parz. consegnato', importo: 1400, numero: 2 },
    ])
  })

  it("somma le commesse di tutti i blocchi, non solo dell'anno corrente", () => {
    const r = riepilogoCreditiDebiti(commesseRiep, accontiRiep, [], [], [], OGGI, nessunaBanca)
    // c3 è del blocco 2025 ed è dentro comunque
    expect(r.creditiPerStato.find((x) => x.stato === 'da_iniziare')?.importo).toBe(2000)
  })

  it('regge liste vuote', () => {
    const r = riepilogoCreditiDebiti([], [], [], [], [], OGGI, nessunaBanca)
    expect(r).toEqual({
      creditiCommesse: 0,
      creditiPerStato: [],
      creditiAltri: 0,
      crediti: 0,
      debitiScaduti: 0,
      debitiAnno: 0,
      debitiFuturi: 0,
      debitiDaProgrammare: 0,
      debitiDipendenti: 0,
      debitiBanche: 0,
      debitiPerBanca: { conti: [], linee: [] },
      debitiTotali: 0,
      posizioneNetta: 0,
      residuoFidi: 0,
    })
  })
})

describe('riepilogoCreditiDebiti — debiti bancari', () => {
  const banche = riepilogoBanche(
    [{ id: 'cc', nome: 'Intesa', accordato: 40000, disponibile: 10000 }], // 30.000 di cassa
    [{ id: 'l1', nome: 'Anticipo Intesa', tipo: 'anticipo_fatture', accordato: 100000 }],
    [{ id: 'a1', linea_id: 'l1', commesse_ids: [], descrizione: '', importo: 15000, scalato: 0, data_scadenza: null, rimborsato: false }],
    {},
    '2026-08-27',
  )

  it('somma il fido utilizzato ai debiti totali', () => {
    const senza = riepilogoCreditiDebiti([], [], [], [], [], '2026-08-27', nessunaBanca)
    const con = riepilogoCreditiDebiti([], [], [], [], [], '2026-08-27', banche)
    expect(con.debitiBanche).toBe(45000)
    expect(con.debitiTotali - senza.debitiTotali).toBe(45000)
  })

  it('il fido utilizzato pesa sulla posizione netta', () => {
    const senza = riepilogoCreditiDebiti([], [], [], [], [], '2026-08-27', nessunaBanca)
    const con = riepilogoCreditiDebiti([], [], [], [], [], '2026-08-27', banche)
    expect(senza.posizioneNetta - con.posizioneNetta).toBe(45000)
  })

  it('il dettaglio somma sempre al totale e scarta le righe a zero', () => {
    const r = riepilogoCreditiDebiti([], [], [], [], [], '2026-08-27', banche)
    const somma =
      r.debitiPerBanca.conti.reduce((s, c) => s + c.utilizzato, 0) +
      r.debitiPerBanca.linee.reduce((s, l) => s + l.utilizzato, 0)
    expect(somma).toBe(r.debitiBanche)
    expect(r.debitiPerBanca.conti.every((c) => c.utilizzato > 0)).toBe(true)
    expect(r.debitiPerBanca.linee.every((l) => l.utilizzato > 0)).toBe(true)
  })

  it('una linea o un conto senza utilizzo non compare nel dettaglio, e il totale non cambia', () => {
    // Un conto sano (fido accordato mai toccato) e una linea configurata ma senza
    // anticipi: riepilogoBanche li tiene entrambi (hanno un fido/plafond da mostrare
    // su Calcoli), ma sul box dei debiti non devono comparire righe a zero.
    const conSaniEZero = riepilogoBanche(
      [
        { id: 'sano', nome: 'Conto Sano', accordato: 20000, disponibile: 20000 }, // utilizzato 0
        { id: 'rosso', nome: 'Conto Rosso', accordato: 40000, disponibile: 10000 }, // utilizzato 30000
      ],
      [{ id: 'linea-vuota', nome: 'Linea Vuota', tipo: 'anticipo_fatture', accordato: 50000 }], // nessun anticipo → utilizzato 0
      [],
      {},
      '2026-08-27',
    )
    expect(conSaniEZero.conti).toHaveLength(2)
    expect(conSaniEZero.linee).toHaveLength(1)

    const r = riepilogoCreditiDebiti([], [], [], [], [], '2026-08-27', conSaniEZero)

    expect(r.debitiPerBanca.conti).toHaveLength(1)
    expect(r.debitiPerBanca.conti[0].id).toBe('rosso')
    expect(r.debitiPerBanca.linee).toHaveLength(0)
    expect(r.debitiBanche).toBe(30000) // il totale non cambia: il conto sano non ci contribuiva comunque
  })

  it('senza banche il riepilogo resta identico a prima', () => {
    const r = riepilogoCreditiDebiti([], [], [], [], [], '2026-08-27', nessunaBanca)
    expect(r.debitiBanche).toBe(0)
    expect(r.debitiPerBanca.conti).toEqual([])
    expect(r.debitiPerBanca.linee).toEqual([])
    expect(r.residuoFidi).toBe(0)
  })
})

describe('aggregaUscitePerCategoria', () => {
  const usciteScadenze: ScadenzaRow[] = [
    { data_scadenza: '2026-02-10', importo: 5000, pagato: true, annullata: false, categoria: 'assegno' },
    { data_scadenza: '2026-03-10', importo: 3000, pagato: true, annullata: false, categoria: 'assegno' },
    { data_scadenza: '2026-04-10', importo: 2000, pagato: true, annullata: false, categoria: 'finanziamento' },
    { data_scadenza: '2026-05-10', importo: 800, pagato: true, annullata: false, categoria: 'tassa' },
    { data_scadenza: '2026-06-10', importo: 200, pagato: true, annullata: false, categoria: 'utenza' },
    { data_scadenza: '2026-07-10', importo: 500, pagato: true, annullata: false, categoria: 'altro' },
    { data_scadenza: '2026-08-10', importo: 9999, pagato: false, annullata: false, categoria: 'assegno' }, // non pagata
    { data_scadenza: '2026-08-11', importo: 8888, pagato: true, annullata: true, categoria: 'assegno' },  // annullata
    { data_scadenza: '2025-08-12', importo: 7777, pagato: true, annullata: false, categoria: 'assegno' }, // altro anno
  ]
  const usciteStipendi: PagamentoDipendenteRow[] = [
    { data_pagamento: '2026-01-27', importo: 1000 },
    { data_pagamento: '2026-02-27', importo: 1500 },
    { data_pagamento: '2025-02-27', importo: 999 }, // altro anno
  ]

  it('mappa ogni categoria di scadenza sulla voce di spesa giusta', () => {
    const { fette } = aggregaUscitePerCategoria(usciteScadenze, [], '2026')
    const per = (c: string) => fette.find((f) => f.categoria === c)?.importo
    expect(per('materiali')).toBe(8000) // i due assegni
    expect(per('finanziamenti')).toBe(2000)
    expect(per('tasse')).toBe(800)
    expect(per('utenze')).toBe(200)
    expect(per('altro')).toBe(500)
  })

  it('somma gli stipendi come voce propria', () => {
    const { fette } = aggregaUscitePerCategoria([], usciteStipendi, '2026')
    expect(fette).toHaveLength(1)
    expect(fette[0].categoria).toBe('stipendi')
    expect(fette[0].importo).toBe(2500)
  })

  it('esclude non pagate, annullate e altri anni', () => {
    const { totale } = aggregaUscitePerCategoria(usciteScadenze, usciteStipendi, '2026')
    expect(totale).toBe(14000) // 11500 di scadenze + 2500 di stipendi
  })

  it('ordina le fette per importo decrescente', () => {
    const { fette } = aggregaUscitePerCategoria(usciteScadenze, usciteStipendi, '2026')
    expect(fette.map((f) => f.categoria)).toEqual([
      'materiali', 'stipendi', 'finanziamenti', 'tasse', 'altro', 'utenze',
    ])
  })

  it('le percentuali sommano a 100', () => {
    const { fette } = aggregaUscitePerCategoria(usciteScadenze, usciteStipendi, '2026')
    const somma = fette.reduce((s, f) => s + f.percentuale, 0)
    expect(somma).toBeCloseTo(100, 6)
    expect(fette[0].percentuale).toBeCloseTo((8000 / 14000) * 100, 6)
  })

  it('omette le categorie senza spese', () => {
    const { fette } = aggregaUscitePerCategoria(
      [{ data_scadenza: '2026-02-10', importo: 100, pagato: true, annullata: false, categoria: 'tassa' }],
      [],
      '2026',
    )
    expect(fette).toHaveLength(1)
    expect(fette[0].label).toBe('Tasse')
  })

  it('una categoria non prevista finisce fra le altre spese invece di sparire', () => {
    const { fette, totale } = aggregaUscitePerCategoria(
      [{ data_scadenza: '2026-02-10', importo: 42, pagato: true, annullata: false, categoria: 'categoria_futura' }],
      [],
      '2026',
    )
    expect(totale).toBe(42)
    expect(fette[0].categoria).toBe('altro')
  })

  it('non divide per zero quando non c è nessuna uscita', () => {
    const { fette, totale } = aggregaUscitePerCategoria([], [], '2026')
    expect(fette).toEqual([])
    expect(totale).toBe(0)
  })
})

// Il caso Moritz Kind: due commesse dello stesso cliente, una scritta "Moritz Kind"
// e una "Kind Moritz", costringevano a cercare due volte invertendo le parole.
describe('resocontoCliente e clientiUnici — ordine delle parole', () => {
  const commesseKind: StatRow[] = [
    { id: 'k1', cliente_nome: 'Moritz Kind', totale: 33583.76, data_conferma: '2025-05-19', blocco: '2025', stato: 'concluso' },
    { id: 'k2', cliente_nome: 'Kind Moritz', totale: 5770.60, data_conferma: '2026-08-10', blocco: '2026', stato: 'in_lavorazione' },
    { id: 'x1', cliente_nome: 'Mario Rossi', totale: 1000, data_conferma: '2026-01-10', blocco: '2026', stato: 'consegnato' },
  ]

  it('raccoglie le commesse del cliente comunque siano ordinate le parole', () => {
    const r = resocontoCliente(commesseKind, [], 'Moritz Kind')
    expect(r.totale.numero).toBe(2)
    expect(r.totale.fatturato).toBeCloseTo(39354.36, 2)
  })

  it('trova lo stesso risultato cercando col nome invertito', () => {
    const dritto = resocontoCliente(commesseKind, [], 'Moritz Kind')
    const invertito = resocontoCliente(commesseKind, [], 'Kind Moritz')
    expect(invertito.totale).toEqual(dritto.totale)
  })

  it('divide comunque per blocco', () => {
    const r = resocontoCliente(commesseKind, [], 'Kind Moritz')
    expect(r.righe.map((x) => x.anno)).toEqual(['2026', '2025'])
  })

  it('non mescola clienti diversi', () => {
    const r = resocontoCliente(commesseKind, [], 'Mario Rossi')
    expect(r.totale.numero).toBe(1)
  })

  it('ignora maiuscole e accenti', () => {
    const conAccento: StatRow[] = [
      { id: 'a1', cliente_nome: "Nicolò D'Angelò", totale: 500, data_conferma: '2026-01-01', blocco: '2026', stato: 'consegnato' },
    ]
    expect(resocontoCliente(conAccento, [], "d'angelo nicolo").totale.numero).toBe(1)
  })

  it('elenca il cliente una volta sola anche se scritto nei due ordini', () => {
    const nomi = clientiUnici(commesseKind)
    expect(nomi).toHaveLength(2)
    expect(nomi.filter((n) => n.toLowerCase().includes('kind'))).toHaveLength(1)
  })
})
