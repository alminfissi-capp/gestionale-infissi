'use client'

import { useMemo, useState, type ReactNode } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine,
  type TooltipValueType,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { formatEuro } from '@/lib/pricing'
import { andamentoCreditiDebiti } from '@/lib/andamento-crediti-debiti'
import type { DatiAndamento, PeriodoAndamento } from '@/lib/andamento-crediti-debiti'

// Palette validata con uno strumento apposta, in chiaro e in scuro: banda di
// luminosita', croma, separazione per daltonismo, contrasto sul fondo. Teal e
// rose sono gli stessi del grafico "Incassi e pagamenti" qui sopra, per non
// dare due significati allo stesso colore nella stessa pagina.
const COLORE = {
  crediti: '#0d9488',
  debiti: '#e11d48',
  netta: '#7c3aed',
} as const

const PERIODI: { value: PeriodoAndamento; label: string }[] = [
  { value: '30g',   label: '30 giorni' },
  { value: '3m',    label: '3 mesi' },
  { value: '6m',    label: '6 mesi' },
  { value: '12m',   label: '12 mesi' },
  { value: '24m',   label: '24 mesi' },
  { value: 'tutto', label: 'Tutto' },
]

/** Etichetta corta per l'asse: 'YYYY-MM-DD' → '12 mar' o 'mar 26'. */
function etichettaData(data: string, mensile: boolean): string {
  const [a, m, g] = data.split('-')
  const mesi = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
  const nomeMese = mesi[Number(m) - 1] ?? m
  return mensile ? `${nomeMese} ${a.slice(2)}` : `${Number(g)} ${nomeMese}`
}

/** Migliaia compatte per l'asse verticale: 12500 → '12,5k'. */
function etichettaEuro(v: number): string {
  const segno = v < 0 ? '−' : ''
  const n = Math.abs(v)
  if (n >= 1000) return `${segno}${(n / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })}k`
  return `${segno}${n.toLocaleString('it-IT', { maximumFractionDigits: 0 })}`
}

interface Props {
  dati: DatiAndamento
  oggi: string
  /** Esposizione bancaria di oggi: non entra nelle linee, si dichiara sotto. */
  fidoUtilizzato: number
}

export default function GraficoAndamento({ dati, oggi, fidoUtilizzato }: Props) {
  const [periodo, setPeriodo] = useState<PeriodoAndamento>('12m')

  const serie = useMemo(
    () => andamentoCreditiDebiti(dati, periodo, oggi),
    [dati, periodo, oggi],
  )
  const mensile = periodo === '24m' || periodo === 'tutto'

  return (
    <div className="space-y-3">
      {/* I filtri stanno in una riga sola sopra al grafico */}
      <div className="flex flex-wrap gap-1">
        {PERIODI.map((p) => (
          <Button
            key={p.value}
            variant={periodo === p.value ? 'default' : 'outline'}
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => setPeriodo(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={serie} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey="data"
            tickFormatter={(d: string) => etichettaData(d, mensile)}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={etichettaEuro}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            width={56}
          />
          {/* Lo zero va visto: la posizione netta puo' scendere sotto */}
          <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />
          <Tooltip
            formatter={(v: TooltipValueType | undefined, nome: string | number | undefined) => [formatEuro(Number(v)), String(nome)]}
            labelFormatter={(d: ReactNode) => etichettaData(String(d), false)}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone" dataKey="crediti" name="Crediti"
            stroke={COLORE.crediti} strokeWidth={2} dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }}
          />
          <Line
            type="monotone" dataKey="debiti" name="Debiti"
            stroke={COLORE.debiti} strokeWidth={2} dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }}
          />
          <Line
            type="monotone" dataKey="netta" name="Posizione netta"
            stroke={COLORE.netta} strokeWidth={2} dot={false}
            strokeDasharray="5 3"
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Cosa il grafico non dice: va scritto, non lasciato indovinare */}
      <div className="rounded-md border bg-gray-50/70 p-3 text-xs text-gray-600 space-y-1">
        <p>
          <span className="font-medium text-gray-800">Fido di cassa utilizzato oggi:</span>{' '}
          {formatEuro(fidoUtilizzato)} — fuori dalle linee, perché del saldo di un
          conto corrente non esiste storia: è un valore aggiornato a mano che vale
          solo per oggi.
        </p>
        <p>
          Per lo stesso motivo la <span className="font-medium text-gray-800">posizione netta</span> qui
          non coincide con quella del riquadro «Crediti e debiti», che il fido lo conta.
        </p>
        <p>
          Un debito si chiude quando la scadenza viene spuntata come pagata, alla sua
          data. Una scadenza non spuntata resta aperta anche se la data è passata.
        </p>
      </div>
    </div>
  )
}
