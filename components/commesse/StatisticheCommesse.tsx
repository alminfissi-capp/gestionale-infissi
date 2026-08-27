'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BarChart3, ChevronDown, TrendingUp } from 'lucide-react'
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
  PieChart, Pie, Cell,
} from 'recharts'
import { Button } from '@/components/ui/button'
import ResocontoCliente from './ResocontoCliente'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { formatEuro } from '@/lib/pricing'
import {
  aggregaMese, aggregaFlussoMese, aggregaCostiUtiliMese, contaCommesseSenzaPreventivo,
  riepilogoCreditiDebiti, aggregaUscitePerCategoria,
  type DatiStatistiche, type CategoriaUscita,
} from '@/lib/statistiche-commesse'
import { riepilogoBanche } from '@/lib/banche'

const COLORS = {
  valore: '#0d9488',   // teal-600
  numero: '#b45309',   // amber-700 (testo leggibile su sfondo chiaro)
  // sky-600 e rose-600: coppia validata per contrasto sul bianco e separazione
  // in caso di daltonismo (ΔE 20.9 protan)
  incasso: '#0284c7',  // sky-600 — entrate
  pagamento: '#e11d48', // rose-600 — uscite
  materiali: '#64748b', // slate-500
  posa: '#f59e0b',     // amber-500
  spese: '#a78bfa',    // violet-400
  utile: '#16a34a',    // green-600
}

// Colore legato alla categoria, non alla posizione: le fette si riordinano per
// importo e il colore deve seguire la voce di spesa, non il suo rango.
// Tavolozza passata a validate_palette.js (skill dataviz): passa banda di luminosità,
// chroma, contrasto e separazione per daltonismo su tutte le coppie consecutive.
// Sei tinte non possono essere tutte distinguibili a due a due sotto protanopia:
// per questo ogni fetta porta l'etichetta scritta e il colore non porta informazione.
const COLORI_USCITA: Record<CategoriaUscita, string> = {
  materiali: '#0284c7',     // sky-600
  stipendi: '#4d7c0f',      // lime-700
  finanziamenti: '#7c3aed', // violet-600 — come il badge dei finanziamenti
  utenze: '#d97706',        // amber-600 — come il badge delle utenze
  tasse: '#e11d48',         // rose-600 — come il badge delle tasse
  altro: '#0d9488',         // teal-600
}

type VistaCosti = 'impilato' | 'costi_utile' | 'solo_utile'

// Etichette compatte sui grafici (es. "12,5K"), vuote per i valori a zero.
const compactEuro = new Intl.NumberFormat('it-IT', { notation: 'compact', maximumFractionDigits: 1 })
type LabelVal = string | number | boolean | null | undefined
function labelEuro(v: LabelVal): string {
  const n = Number(v)
  return n > 0 ? compactEuro.format(n) : ''
}
function labelNumero(v: LabelVal): string {
  const n = Number(v)
  return n > 0 ? String(n) : ''
}

// Filo puntinato fra la descrizione e l'importo: su righe con importi di lunghezza
// diversa l'occhio perde la corrispondenza, e in un riquadro di soldi sbagliare riga
// significa leggere il numero di un'altra voce.
function Filo() {
  return <span aria-hidden="true" className="mx-2 flex-1 border-b border-dotted border-gray-300" />
}

// Le date arrivano come 'YYYY-MM-DD' dal server. Si formattano all'italiana solo
// per mostrarle: i confronti restano sulle stringhe ISO, che si ordinano da sole.
function formatData(iso: string): string {
  const [a, m, g] = iso.split('-')
  return `${g}/${m}/${a}`
}

interface Props {
  dati: DatiStatistiche
}

export default function StatisticheCommesse({ dati }: Props) {
  const router = useRouter()
  const {
    commesse, acconti, anni, costiCommesse, scadenze, oggi,
    altriCrediti, pagamentiDipendenti, contiDipendenti,
    contiBanca, lineeCredito, anticipi, infoCommesse,
  } = dati

  const annoCorrente = String(new Date().getFullYear())
  const annoDefault = anni.includes(annoCorrente) ? annoCorrente : (anni[0] ?? annoCorrente)
  const [anno, setAnno] = useState<string>(annoDefault)
  const [vistaCosti, setVistaCosti] = useState<VistaCosti>('impilato')
  // Tendina del dettaglio "Da commesse": chiusa di default, il riquadro resta una sintesi
  const [dettaglioCommesse, setDettaglioCommesse] = useState(false)
  // Tendina del dettaglio "Banche": chiusa di default, come quella dei crediti
  const [dettaglioBanche, setDettaglioBanche] = useState(false)
  // Tendina dei finanziamenti: lettura trasversale sotto il totale, chiusa di default
  const [dettaglioFinanziamenti, setDettaglioFinanziamenti] = useState(false)

  const datiMese = useMemo(() => aggregaMese(commesse, anno), [commesse, anno])
  const datiFlusso = useMemo(
    () => aggregaFlussoMese(acconti, scadenze, pagamentiDipendenti, anno),
    [acconti, scadenze, pagamentiDipendenti, anno],
  )
  const banche = useMemo(
    () => riepilogoBanche(contiBanca, lineeCredito, anticipi, infoCommesse, oggi),
    [contiBanca, lineeCredito, anticipi, infoCommesse, oggi],
  )
  const riepilogo = useMemo(
    () => riepilogoCreditiDebiti(commesse, acconti, altriCrediti, scadenze, contiDipendenti, oggi, banche),
    [commesse, acconti, altriCrediti, scadenze, contiDipendenti, oggi, banche],
  )
  const uscite = useMemo(
    () => aggregaUscitePerCategoria(scadenze, pagamentiDipendenti, anno),
    [scadenze, pagamentiDipendenti, anno],
  )
  const datiCostiUtili = useMemo(() => aggregaCostiUtiliMese(costiCommesse, anno), [costiCommesse, anno])
  const senzaPreventivo = useMemo(
    () => contaCommesseSenzaPreventivo(commesse, costiCommesse, anno),
    [commesse, costiCommesse, anno],
  )

  const totaleAnnoNumero = datiMese.reduce((s, r) => s + r.numero, 0)
  const totaleAnnoValore = datiMese.reduce((s, r) => s + r.valore, 0)
  const annoOggi = oggi.slice(0, 4)

  const totaleAnnoIncassi = datiFlusso.reduce((s, r) => s + r.incasso, 0)
  const totaleAnnoPagamenti = datiFlusso.reduce((s, r) => s + r.pagamento, 0)
  const saldoCassaAnno = totaleAnnoIncassi - totaleAnnoPagamenti

  const totMateriali = datiCostiUtili.reduce((s, r) => s + r.materiali, 0)
  const totPosa = datiCostiUtili.reduce((s, r) => s + r.posa, 0)
  const totSpese = datiCostiUtili.reduce((s, r) => s + r.spese, 0)
  const totUtile = datiCostiUtili.reduce((s, r) => s + r.utile, 0)
  const totCosti = totMateriali + totPosa + totSpese
  const percMargine = totCosti > 0 ? (totUtile / totCosti) * 100 : null
  const haCostiUtili = totMateriali !== 0 || totPosa !== 0 || totSpese !== 0 || totUtile !== 0


  const haDati = anni.length > 0

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/commesse')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-teal-600" />
              Grafici e statistiche
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Andamento commesse, flusso di cassa, crediti/debiti e resoconto per cliente</p>
          </div>
        </div>
        {haDati && (
          <Select value={anno} onValueChange={setAnno}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {anni.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!haDati ? (
        <Card>
          <CardContent className="py-16 text-center text-gray-400">Nessun dato disponibile</CardContent>
        </Card>
      ) : (
        <>
          {/* A) Andamento commesse per mese */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">Andamento commesse — {anno}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={datiMese} margin={{ top: 24, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="mese" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#9ca3af' }} width={56}
                    tickFormatter={(v) => formatEuro(Number(v))} />
                  <YAxis yAxisId="right" orientation="right" allowDecimals={false}
                    tick={{ fontSize: 10, fill: '#9ca3af' }} width={28} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    labelStyle={{ fontWeight: 600 }}
                    formatter={(value, name) =>
                      name === 'Valore' ? [formatEuro(Number(value)), name] : [value, name]
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="left" dataKey="valore" name="Valore" fill={COLORS.valore} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="valore" position="insideTop" fill="#ffffff"
                      fontSize={10} fontWeight={600} formatter={labelEuro} />
                  </Bar>
                  <Line yAxisId="right" type="monotone" dataKey="numero" name="Numero"
                    stroke={COLORS.numero} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }}>
                    <LabelList dataKey="numero" position="top" fill={COLORS.numero}
                      fontSize={11} fontWeight={700} formatter={labelNumero} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-8 gap-y-1 mt-3 text-sm">
                <span className="text-gray-500">Commesse {anno}: <strong className="text-gray-900">{totaleAnnoNumero}</strong></span>
                <span className="text-gray-500">Valore totale: <strong className="text-teal-700">{formatEuro(totaleAnnoValore)}</strong></span>
              </div>
            </CardContent>
          </Card>

          {/* B) Incassi e pagamenti per mese */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">Incassi e pagamenti — {anno}</CardTitle>
              <p className="text-xs text-gray-500">
                Acconti incassati, scadenze pagate e stipendi versati, sul mese della rispettiva data
              </p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={datiFlusso} margin={{ top: 16, right: 8, left: -12, bottom: 0 }} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="mese" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} width={56}
                    tickFormatter={(v) => formatEuro(Number(v))} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    labelStyle={{ fontWeight: 600 }}
                    formatter={(value, name) => [`${formatEuro(Number(value))} €`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {/* Niente etichette sulle barre: con due serie per 12 mesi si
                      sovrappongono. I valori esatti stanno nel tooltip e i totali sotto. */}
                  <Bar dataKey="incasso" name="Incassi" fill={COLORS.incasso} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pagamento" name="Pagamenti" fill={COLORS.pagamento} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm border-t pt-3">
                <span className="text-gray-500">
                  Incassato: <strong className="text-sky-700">{formatEuro(totaleAnnoIncassi)}</strong>
                </span>
                <span className="text-gray-500">
                  Pagato: <strong className="text-rose-700">{formatEuro(totaleAnnoPagamenti)}</strong>
                </span>
                <span className="text-gray-500">
                  Saldo di cassa:{' '}
                  <strong className={saldoCassaAnno >= 0 ? 'text-green-700' : 'text-rose-700'}>
                    {saldoCassaAnno >= 0 ? '+' : ''}{formatEuro(saldoCassaAnno)}
                  </strong>
                </span>
              </div>
            </CardContent>
          </Card>

          {/* B1) Uscite per categoria — istantanea del pagato nell'anno */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">Uscite per categoria — {anno}</CardTitle>
              <p className="text-xs text-gray-500">
                Quanto è stato pagato nell&apos;anno, diviso per voce di spesa
              </p>
            </CardHeader>
            <CardContent>
              {uscite.fette.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">
                  Nessun pagamento registrato nel {anno}
                </p>
              ) : (
                // Elenco a sinistra, torta a destra. L'ordine nel DOM segue quello
                // visivo, così su mobile i numeri esatti vengono prima del disegno.
                // L'elenco è compatto e la torta prende lo spazio che avanza.
                <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr] items-center">
                  {/* Elenco: è la specifica richiesta (€ e %) e insieme il "table view"
                      che rende la lettura indipendente dal colore */}
                  <div>
                    <dl className="space-y-1.5 text-sm">
                      {uscite.fette.map((f) => (
                        <div key={f.categoria} className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-sm shrink-0"
                            style={{ backgroundColor: COLORI_USCITA[f.categoria] }}
                            aria-hidden
                          />
                          <dt className="flex-1 text-gray-700">{f.label}</dt>
                          <dd className="font-semibold text-gray-900 tabular-nums">
                            {formatEuro(f.importo)}
                          </dd>
                          <dd className="w-14 text-right text-gray-500 tabular-nums">
                            {f.percentuale.toFixed(1)}%
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <div className="flex items-center gap-2 border-t mt-2 pt-2 text-sm font-semibold">
                      <span className="h-3 w-3 shrink-0" aria-hidden />
                      <span className="flex-1">Totale pagato</span>
                      <span className="text-gray-900 tabular-nums">{formatEuro(uscite.totale)}</span>
                      <span className="w-14 text-right text-gray-500">100%</span>
                    </div>
                  </div>

                  <ResponsiveContainer width="100%" height={420}>
                    <PieChart>
                      <Pie
                        data={uscite.fette}
                        dataKey="importo"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        // 68% e non di più: le etichette stanno fuori dal cerchio e
                        // oltre questa soglia verrebbero tagliate dal contenitore.
                        // Il raggio resta comunque molto maggiore di prima.
                        outerRadius="68%"
                        // stacco bianco fra le fette: le tiene distinte anche stampate
                        stroke="#ffffff"
                        strokeWidth={2}
                        // Etichetta su ogni fetta, nessuna esclusa: è ciò che rende
                        // leggibili le fette sottili, e insieme evita che il colore sia
                        // l'unico modo per riconoscere la categoria.
                        label={({ percent }: { percent?: number }) =>
                          `${((percent ?? 0) * 100).toFixed(1)}%`
                        }
                        // linee di richiamo: per una fetta all'1% l'etichetta non
                        // starebbe dentro, e senza linea non si capirebbe a chi appartiene
                        labelLine
                      >
                        {uscite.fette.map((f) => (
                          <Cell key={f.categoria} fill={COLORI_USCITA[f.categoria]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        formatter={(value, name) => [`${formatEuro(Number(value))} €`, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* B2) Crediti e debiti — fotografia a oggi, NON segue il selettore anno */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                Crediti e debiti
                <span className="text-xs font-normal text-white bg-gray-500 rounded px-1.5 py-0.5">
                  a oggi
                </span>
              </CardTitle>
              <p className="text-xs text-gray-500">
                Posizione dell&apos;azienda alla data odierna: non segue il selettore dell&apos;anno
              </p>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-sky-100 bg-sky-50 p-3">
                <p className="text-xs uppercase tracking-wide text-sky-700 font-medium">Crediti da incassare</p>
                <p className="text-2xl font-bold text-sky-700 mt-1">{formatEuro(riepilogo.crediti)}</p>
                <div className="mt-2 space-y-1 text-sm">
                  <div>
                    <button
                      type="button"
                      onClick={() => setDettaglioCommesse((v) => !v)}
                      aria-expanded={dettaglioCommesse}
                      aria-controls="dettaglio-crediti-commesse"
                      className="w-full flex items-center justify-between gap-2 text-gray-700 hover:text-sky-800 transition-colors"
                    >
                      <span className="flex items-center gap-1">
                        <ChevronDown
                          className={`h-3.5 w-3.5 text-sky-600 transition-transform ${dettaglioCommesse ? '' : '-rotate-90'}`}
                        />
                        Da commesse
                      </span>
                      <span>{formatEuro(riepilogo.creditiCommesse)}</span>
                    </button>
                    {dettaglioCommesse && (
                      riepilogo.creditiPerStato.length === 0 ? (
                        <p id="dettaglio-crediti-commesse" className="ml-5 mt-1 border-l border-sky-200 pl-2 text-xs text-gray-500">
                          Nessuna commessa con saldo residuo
                        </p>
                      ) : (
                        <ul id="dettaglio-crediti-commesse" className="ml-5 mt-1 space-y-0.5 border-l border-sky-200 pl-2 text-xs">
                          {riepilogo.creditiPerStato.map((riga) => (
                            <li key={riga.stato} className="flex justify-between gap-2 text-gray-600">
                              <span>
                                {riga.label}
                                <span className="text-gray-400"> · {riga.numero}</span>
                              </span>
                              <span className="font-medium text-gray-700">{formatEuro(riga.importo)}</span>
                            </li>
                          ))}
                        </ul>
                      )
                    )}
                  </div>
                  <div className="flex justify-between text-gray-700">
                    <span>Altri crediti</span>
                    <span>{formatEuro(riepilogo.creditiAltri)}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Saldo residuo delle commesse più gli incassi in attesa non legati a commesse
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-600 font-medium">Debiti da pagare</p>
                <div className="mt-2 space-y-1 text-sm">
                  {riepilogo.debitiScaduti > 0 && (
                    <div className="flex items-baseline text-rose-700 font-medium">
                      <span className="shrink-0">Già scaduto</span>
                      <Filo />
                      <span className="shrink-0">{formatEuro(riepilogo.debitiScaduti)}</span>
                    </div>
                  )}
                  <div className="flex items-baseline text-gray-700">
                    <span className="shrink-0">Entro il {annoOggi}</span>
                    <Filo />
                    <span className="shrink-0">{formatEuro(riepilogo.debitiAnno)}</span>
                  </div>
                  {riepilogo.debitiDaProgrammare > 0 && (
                    <div className="flex items-baseline text-gray-700">
                      <span className="shrink-0">Da programmare</span>
                      <Filo />
                      <span className="shrink-0">{formatEuro(riepilogo.debitiDaProgrammare)}</span>
                    </div>
                  )}
                  {riepilogo.debitiDipendenti > 0 && (
                    <div className="flex items-baseline text-gray-700">
                      <span className="shrink-0">Stipendi da versare</span>
                      <Filo />
                      <span className="shrink-0">{formatEuro(riepilogo.debitiDipendenti)}</span>
                    </div>
                  )}
                  {riepilogo.debitiBanche > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setDettaglioBanche((v) => !v)}
                        aria-expanded={dettaglioBanche}
                        aria-controls="dettaglio-banche"
                        className="w-full flex items-baseline text-gray-700 hover:text-gray-900 transition-colors"
                      >
                        <span className="flex shrink-0 items-center gap-1">
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-gray-500 transition-transform ${dettaglioBanche ? '' : '-rotate-90'}`}
                          />
                          Banche (fido utilizzato)
                        </span>
                        <Filo />
                        <span className="shrink-0">{formatEuro(riepilogo.debitiBanche)}</span>
                      </button>
                      {dettaglioBanche && (
                        <ul id="dettaglio-banche" className="ml-5 mt-1 space-y-0.5 border-l border-gray-200 pl-2 text-xs">
                          {riepilogo.debitiPerBanca.conti.map((c) => (
                            <li key={c.id} className="flex justify-between gap-2 text-gray-600">
                              <span>{c.nome}<span className="text-gray-400"> · fido di cassa</span></span>
                              <span className="font-medium text-gray-700">{formatEuro(c.utilizzato)}</span>
                            </li>
                          ))}
                          {riepilogo.debitiPerBanca.linee.map((l) => (
                            <li key={l.id} className="text-gray-600">
                              <div className="flex justify-between gap-2">
                                <span>{l.nome}</span>
                                <span className="font-medium text-gray-700">{formatEuro(l.utilizzato)}</span>
                              </div>
                              <ul className="ml-2 border-l border-gray-100 pl-2 text-[11px] text-gray-500">
                                {l.anticipi.map((a) => (
                                  <li key={a.id} className="flex justify-between gap-2">
                                    <span className={a.scaduto ? 'text-rose-600' : undefined}>
                                      {a.commesse.length > 0
                                        ? a.commesse.map((c) => c.etichetta).join(' + ')
                                        : (a.descrizione || 'Anticipo')}
                                      {a.data_scadenza && (
                                        <span className={a.scaduto ? 'text-rose-600' : 'text-gray-400'}>
                                          {' '}· scad. {formatData(a.data_scadenza)}
                                          {a.scaduto && ' · scaduto'}
                                        </span>
                                      )}
                                    </span>
                                    {/* Quello che resta da restituire, non l'erogato:
                                        gli acconti trattenuti sono già rientrati. */}
                                    <span>{formatEuro(a.daRestituire)}</span>
                                  </li>
                                ))}
                              </ul>
                            </li>
                          ))}
                          <li className="pt-1 text-gray-400">
                            margine ancora disponibile: {formatEuro(riepilogo.residuoFidi)}
                          </li>
                        </ul>
                      )}
                    </div>
                  )}
                  <div className="flex items-baseline text-gray-500">
                    <span className="shrink-0">Rate oltre il {annoOggi}</span>
                    <Filo />
                    <span className="shrink-0">{formatEuro(riepilogo.debitiFuturi)}</span>
                  </div>
                  <div className="flex items-baseline border-t pt-1 mt-1 font-semibold text-gray-800">
                    <span className="shrink-0">Totale</span>
                    <Filo />
                    <span className="shrink-0">{formatEuro(riepilogo.debitiTotali)}</span>
                  </div>

                  {/* Lettura trasversale: le rate dei finanziamenti sono già dentro le
                      righe qui sopra, quindi questa voce NON si somma al totale. Sta
                      sotto la riga di chiusura proprio per non farsi leggere come una
                      voce del conto. */}
                  {riepilogo.finanziamenti.totale > 0 && (
                    <div className="mt-2 border-t border-dashed border-gray-200 pt-2">
                      <button
                        type="button"
                        onClick={() => setDettaglioFinanziamenti((v) => !v)}
                        aria-expanded={dettaglioFinanziamenti}
                        aria-controls="dettaglio-finanziamenti"
                        className="w-full flex items-baseline text-xs text-violet-700 hover:text-violet-900 transition-colors"
                      >
                        <span className="flex shrink-0 items-center gap-1">
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform ${dettaglioFinanziamenti ? '' : '-rotate-90'}`}
                          />
                          di cui finanziamenti
                        </span>
                        <Filo />
                        <span className="shrink-0 font-medium">
                          {formatEuro(riepilogo.finanziamenti.totale)}
                        </span>
                      </button>
                      {dettaglioFinanziamenti && (
                        <ul
                          id="dettaglio-finanziamenti"
                          className="ml-5 mt-1 space-y-0.5 border-l border-violet-200 pl-2 text-xs text-gray-600"
                        >
                          {riepilogo.finanziamenti.scaduti > 0 && (
                            <li className="flex items-baseline text-rose-700">
                              <span className="shrink-0">Già scaduto</span>
                              <Filo />
                              <span className="shrink-0">{formatEuro(riepilogo.finanziamenti.scaduti)}</span>
                            </li>
                          )}
                          <li className="flex items-baseline">
                            <span className="shrink-0">Entro il {annoOggi}</span>
                            <Filo />
                            <span className="shrink-0">{formatEuro(riepilogo.finanziamenti.anno)}</span>
                          </li>
                          {riepilogo.finanziamenti.daProgrammare > 0 && (
                            <li className="flex items-baseline">
                              <span className="shrink-0">Da programmare</span>
                              <Filo />
                              <span className="shrink-0">{formatEuro(riepilogo.finanziamenti.daProgrammare)}</span>
                            </li>
                          )}
                          <li className="flex items-baseline">
                            <span className="shrink-0">Rate oltre il {annoOggi}</span>
                            <Filo />
                            <span className="shrink-0">{formatEuro(riepilogo.finanziamenti.futuri)}</span>
                          </li>
                          <li className="pt-1 text-gray-400">
                            {riepilogo.finanziamenti.numeroRate} rate ancora da pagare
                            {riepilogo.finanziamenti.ultimaRata &&
                              `, l'ultima il ${formatData(riepilogo.finanziamenti.ultimaRata)}`}
                          </li>
                          <li className="text-gray-400">
                            Sono già compresi nelle righe qui sopra: non si sommano al totale.
                          </li>
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="sm:col-span-2 rounded-lg border p-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-600 font-medium">
                    Posizione netta {annoOggi}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Crediti meno i debiti da saldare entro l&apos;anno, stipendi arretrati compresi.
                    Restano fuori le rate oltre l&apos;anno e l&apos;esposizione bancaria, che non
                    ha una scadenza da rispettare
                  </p>
                </div>
                <p className={`text-2xl font-bold ${riepilogo.posizioneNetta >= 0 ? 'text-green-700' : 'text-rose-700'}`}>
                  {riepilogo.posizioneNetta >= 0 ? '+' : ''}{formatEuro(riepilogo.posizioneNetta)}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* B2) Costi e utili stimati (da preventivi interni) */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                Costi e utili stimati — {anno}
              </CardTitle>
              <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
                {([
                  ['impilato', 'Impilato'],
                  ['costi_utile', 'Costi + utile'],
                  ['solo_utile', 'Solo utile'],
                ] as [VistaCosti, string][]).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setVistaCosti(v)}
                    className={`px-3 py-1.5 transition-colors ${
                      vistaCosti === v ? 'bg-green-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-gray-400 mb-3">Valori al netto dell&apos;IVA (imponibile)</p>
              {!haCostiUtili ? (
                <p className="text-sm text-gray-400 text-center py-12">
                  Nessun preventivo interno per questo blocco.
                </p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={300}>
                    {vistaCosti === 'costi_utile' ? (
                      <ComposedChart data={datiCostiUtili} margin={{ top: 24, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="mese" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} width={56}
                          tickFormatter={(v) => formatEuro(Number(v))} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} labelStyle={{ fontWeight: 600 }}
                          formatter={(value, name) => [formatEuro(Number(value)), name]} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="costi" name="Costi" fill={COLORS.materiali} radius={[4, 4, 0, 0]} />
                        <Line type="monotone" dataKey="utile" name="Utile" stroke={COLORS.utile}
                          strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      </ComposedChart>
                    ) : vistaCosti === 'solo_utile' ? (
                      <BarChart data={datiCostiUtili} margin={{ top: 24, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="mese" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} width={56}
                          tickFormatter={(v) => formatEuro(Number(v))} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} labelStyle={{ fontWeight: 600 }}
                          formatter={(value) => [formatEuro(Number(value)), 'Utile']} />
                        <Bar dataKey="utile" name="Utile" fill={COLORS.utile} radius={[4, 4, 0, 0]}>
                          <LabelList dataKey="utile" position="top" fill="#15803d"
                            fontSize={10} fontWeight={600} formatter={labelEuro} />
                        </Bar>
                      </BarChart>
                    ) : (
                      <BarChart data={datiCostiUtili} margin={{ top: 24, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="mese" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} width={56}
                          tickFormatter={(v) => formatEuro(Number(v))} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} labelStyle={{ fontWeight: 600 }}
                          formatter={(value, name) => [formatEuro(Number(value)), name]} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="materiali" name="Materiali" stackId="cu" fill={COLORS.materiali} />
                        <Bar dataKey="posa" name="M. D'opera/Posa" stackId="cu" fill={COLORS.posa} />
                        <Bar dataKey="spese" name="Spese varie" stackId="cu" fill={COLORS.spese} />
                        <Bar dataKey="utile" name="Utile" stackId="cu" fill={COLORS.utile} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm">
                    <span className="text-gray-500">Materiali: <strong className="text-slate-700">{formatEuro(totMateriali)}</strong></span>
                    <span className="text-gray-500">M. D&apos;opera/Posa: <strong className="text-amber-700">{formatEuro(totPosa)}</strong></span>
                    {totSpese !== 0 && (
                      <span className="text-gray-500">Spese varie: <strong className="text-violet-700">{formatEuro(totSpese)}</strong></span>
                    )}
                    <span className="text-gray-500">Utile: <strong className="text-green-700">{formatEuro(totUtile)}</strong></span>
                    {percMargine !== null && (
                      <span className="text-gray-500">Margine: <strong className="text-green-700">{percMargine.toFixed(1).replace('.', ',')}%</strong> sul costo</span>
                    )}
                  </div>
                </>
              )}
              {senzaPreventivo > 0 && (
                <p className="text-xs text-gray-400 mt-2">
                  {senzaPreventivo} {senzaPreventivo === 1 ? 'commessa' : 'commesse'} del blocco senza preventivo interno né costi manuali — escluse dalla stima.
                </p>
              )}
            </CardContent>
          </Card>

          {/* C) Resoconto per cliente — componente a sé: la ricerca cambia a ogni
              tasto e non deve far ridisegnare i grafici */}
          <ResocontoCliente commesse={commesse} acconti={acconti} />
        </>
      )}
    </div>
  )
}
