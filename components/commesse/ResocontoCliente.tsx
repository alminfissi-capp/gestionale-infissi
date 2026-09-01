'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { formatEuro } from '@/lib/pricing'
import { clientiUnici, resocontoCliente, type AccontoRow, type StatRow } from '@/lib/statistiche-commesse'

/**
 * Resoconto per cliente, con la sua casella di ricerca e il suo stato.
 *
 * Sta in un componente a sé perché il testo digitato cambia a ogni tasto: lasciandolo
 * nella pagina, ogni lettera faceva ridisegnare anche i quattro grafici, che col
 * cliente cercato non c'entrano nulla.
 */
export default function ResocontoCliente({
  commesse,
  acconti,
}: {
  commesse: StatRow[]
  acconti: AccontoRow[]
}) {
  const [cliente, setCliente] = useState('')

  const clienti = useMemo(() => clientiUnici(commesse), [commesse])

  const clienteValido = cliente.trim().length > 0
  const resoconto = useMemo(
    () => (clienteValido ? resocontoCliente(commesse, acconti, cliente) : null),
    [commesse, acconti, cliente, clienteValido],
  )
  const nessunRisultato = clienteValido && resoconto !== null && resoconto.righe.length === 0

  return (
    <div className="space-y-4">
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
    </div>
  )
}
