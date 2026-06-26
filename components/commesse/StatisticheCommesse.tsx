'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BarChart3, Search } from 'lucide-react'
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { formatEuro } from '@/lib/pricing'
import {
  aggregaMese, aggregaIncassiMese, resocontoCliente, clientiUnici,
  type DatiStatistiche,
} from '@/lib/statistiche-commesse'

const COLORS = {
  valore: '#0d9488',  // teal-600
  numero: '#f59e0b',  // amber-500
  incasso: '#0ea5e9', // sky-500
}

interface Props {
  dati: DatiStatistiche
}

export default function StatisticheCommesse({ dati }: Props) {
  const router = useRouter()
  const { commesse, acconti, anni } = dati

  const annoCorrente = new Date().getFullYear()
  const annoDefault = anni.includes(annoCorrente) ? annoCorrente : (anni[0] ?? annoCorrente)
  const [anno, setAnno] = useState<number>(annoDefault)
  const [cliente, setCliente] = useState('')

  const datiMese = useMemo(() => aggregaMese(commesse, anno), [commesse, anno])
  const datiIncassi = useMemo(() => aggregaIncassiMese(acconti, anno), [acconti, anno])
  const clienti = useMemo(() => clientiUnici(commesse), [commesse])

  const totaleAnnoNumero = datiMese.reduce((s, r) => s + r.numero, 0)
  const totaleAnnoValore = datiMese.reduce((s, r) => s + r.valore, 0)
  const totaleAnnoIncassi = datiIncassi.reduce((s, r) => s + r.incasso, 0)

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
            <p className="text-sm text-gray-500 mt-0.5">Andamento commesse, incassi e resoconto per cliente</p>
          </div>
        </div>
        {haDati && (
          <Select value={String(anno)} onValueChange={(v) => setAnno(Number(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {anni.map((a) => (
                <SelectItem key={a} value={String(a)}>{a}</SelectItem>
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
                <ComposedChart data={datiMese} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
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
                  <Bar yAxisId="left" dataKey="valore" name="Valore" fill={COLORS.valore} radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="numero" name="Numero"
                    stroke={COLORS.numero} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-8 gap-y-1 mt-3 text-sm">
                <span className="text-gray-500">Commesse {anno}: <strong className="text-gray-900">{totaleAnnoNumero}</strong></span>
                <span className="text-gray-500">Valore totale: <strong className="text-teal-700">{formatEuro(totaleAnnoValore)}</strong></span>
              </div>
            </CardContent>
          </Card>

          {/* B) Incassi per mese */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">Incassi — {anno}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={datiIncassi} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="mese" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} width={56}
                    tickFormatter={(v) => formatEuro(Number(v))} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    labelStyle={{ fontWeight: 600 }}
                    formatter={(value) => [formatEuro(Number(value)), 'Incasso']}
                  />
                  <Bar dataKey="incasso" name="Incasso" fill={COLORS.incasso} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 text-sm text-gray-500">
                Totale incassato {anno}: <strong className="text-sky-700">{formatEuro(totaleAnnoIncassi)}</strong>
              </div>
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
