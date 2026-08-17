'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BarChart3, Search, TrendingUp } from 'lucide-react'
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
  PieChart, Pie, Cell,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { formatEuro } from '@/lib/pricing'
import {
  aggregaMese, aggregaFlussoMese, aggregaCostiUtiliMese, contaCommesseSenzaPreventivo,
  resocontoCliente, clientiUnici, riepilogoCreditiDebiti, aggregaUscitePerCategoria,
  type DatiStatistiche, type CategoriaUscita,
} from '@/lib/statistiche-commesse'

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

interface Props {
  dati: DatiStatistiche
}

export default function StatisticheCommesse({ dati }: Props) {
  const router = useRouter()
  const {
    commesse, acconti, anni, costiCommesse, scadenze, oggi,
    altriCrediti, pagamentiDipendenti, contiDipendenti,
  } = dati

  const annoCorrente = String(new Date().getFullYear())
  const annoDefault = anni.includes(annoCorrente) ? annoCorrente : (anni[0] ?? annoCorrente)
  const [anno, setAnno] = useState<string>(annoDefault)
  const [cliente, setCliente] = useState('')
  const [vistaCosti, setVistaCosti] = useState<VistaCosti>('impilato')

  const datiMese = useMemo(() => aggregaMese(commesse, anno), [commesse, anno])
  const datiFlusso = useMemo(
    () => aggregaFlussoMese(acconti, scadenze, pagamentiDipendenti, anno),
    [acconti, scadenze, pagamentiDipendenti, anno],
  )
  const riepilogo = useMemo(
    () => riepilogoCreditiDebiti(commesse, acconti, altriCrediti, scadenze, contiDipendenti, oggi),
    [commesse, acconti, altriCrediti, scadenze, contiDipendenti, oggi],
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
  const clienti = useMemo(() => clientiUnici(commesse), [commesse])

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

  const clienteValido = cliente.trim().length > 0
  const resoconto = useMemo(
    () => (clienteValido ? resocontoCliente(commesse, acconti, cliente) : null),
    [commesse, acconti, cliente, clienteValido],
  )
  const nessunRisultato = clienteValido && resoconto !== null && resoconto.righe.length === 0

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
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between text-gray-700">
                    <dt>Da commesse</dt>
                    <dd>{formatEuro(riepilogo.creditiCommesse)}</dd>
                  </div>
                  <div className="flex justify-between text-gray-700">
                    <dt>Altri crediti</dt>
                    <dd>{formatEuro(riepilogo.creditiAltri)}</dd>
                  </div>
                </dl>
                <p className="text-xs text-gray-500 mt-2">
                  Saldo residuo delle commesse più gli incassi in attesa non legati a commesse
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-600 font-medium">Debiti da pagare</p>
                <dl className="mt-2 space-y-1 text-sm">
                  {riepilogo.debitiScaduti > 0 && (
                    <div className="flex justify-between text-rose-700 font-medium">
                      <dt>Già scaduto</dt>
                      <dd>{formatEuro(riepilogo.debitiScaduti)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-700">
                    <dt>Entro il {annoOggi}</dt>
                    <dd>{formatEuro(riepilogo.debitiAnno)}</dd>
                  </div>
                  {riepilogo.debitiDaProgrammare > 0 && (
                    <div className="flex justify-between text-gray-700">
                      <dt>Da programmare</dt>
                      <dd>{formatEuro(riepilogo.debitiDaProgrammare)}</dd>
                    </div>
                  )}
                  {riepilogo.debitiDipendenti > 0 && (
                    <div className="flex justify-between text-gray-700">
                      <dt>Stipendi da versare</dt>
                      <dd>{formatEuro(riepilogo.debitiDipendenti)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-500">
                    <dt>Rate oltre il {annoOggi}</dt>
                    <dd>{formatEuro(riepilogo.debitiFuturi)}</dd>
                  </div>
                  <div className="flex justify-between border-t pt-1 mt-1 font-semibold text-gray-800">
                    <dt>Totale</dt>
                    <dd>{formatEuro(riepilogo.debitiTotali)}</dd>
                  </div>
                </dl>
              </div>

              <div className="sm:col-span-2 rounded-lg border p-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-600 font-medium">
                    Posizione netta {annoOggi}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Crediti meno i debiti da saldare entro l&apos;anno, stipendi arretrati compresi; le rate future restano escluse
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

          {/* C) Resoconto per cliente */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">Resoconto per cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  list="clienti-statistiche"
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                  placeholder="Cerca cliente..."
                  className="pl-9"
                />
                <datalist id="clienti-statistiche">
                  {clienti.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>

              {!clienteValido && (
                <p className="text-sm text-gray-400 py-4">Digita o seleziona un cliente per vedere il resoconto.</p>
              )}

              {nessunRisultato && (
                <p className="text-sm text-gray-400 py-4">Nessun cliente trovato.</p>
              )}

              {resoconto && resoconto.righe.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="py-2 pr-4 font-medium">Anno</th>
                        <th className="py-2 pr-4 font-medium text-right">Commesse</th>
                        <th className="py-2 pr-4 font-medium text-right">Fatturato</th>
                        <th className="py-2 pr-4 font-medium text-right">Incassato</th>
                        <th className="py-2 font-medium text-right">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resoconto.righe.map((r) => (
                        <tr key={r.anno} className="border-b last:border-0">
                          <td className="py-2 pr-4 font-medium text-gray-900">{r.anno}</td>
                          <td className="py-2 pr-4 text-right text-gray-700">{r.numero}</td>
                          <td className="py-2 pr-4 text-right text-gray-700">{formatEuro(r.fatturato)}</td>
                          <td className="py-2 pr-4 text-right text-gray-700">{formatEuro(r.incassato)}</td>
                          <td className={`py-2 text-right font-semibold ${r.saldo <= 0.005 ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {formatEuro(r.saldo)}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 font-semibold">
                        <td className="py-2 pr-4 text-gray-900">Totale</td>
                        <td className="py-2 pr-4 text-right text-gray-900">{resoconto.totale.numero}</td>
                        <td className="py-2 pr-4 text-right text-gray-900">{formatEuro(resoconto.totale.fatturato)}</td>
                        <td className="py-2 pr-4 text-right text-gray-900">{formatEuro(resoconto.totale.incassato)}</td>
                        <td className={`py-2 text-right ${resoconto.totale.saldo <= 0.005 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {formatEuro(resoconto.totale.saldo)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
