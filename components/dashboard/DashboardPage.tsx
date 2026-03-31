'use client'

import { Activity, FileText, User, BookOpen, Ruler, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { formatEuro } from '@/lib/pricing'
import type { DashboardData, ActivityItem } from '@/actions/dashboard'

// ── Colori tema ──────────────────────────────────────────────────────────────
const COLORS = {
  totale:    '#3b82f6', // blu
  accettati: '#22c55e', // verde
  rifiutati: '#ef4444', // rosso
  bozze:     '#9ca3af', // grigio
  inviati:   '#a855f7', // viola
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatData(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}

function TipoIcon({ tipo }: { tipo: ActivityItem['tipo'] }) {
  if (tipo === 'preventivo') return <FileText className="h-4 w-4 text-teal-600 shrink-0" />
  if (tipo === 'cliente') return <User className="h-4 w-4 text-blue-600 shrink-0" />
  return <BookOpen className="h-4 w-4 text-green-600 shrink-0" />
}

// ── Card statistica ───────────────────────────────────────────────────────────
function StatCard({
  label, count, percentuale, imponibile, color, isTotale = false,
}: {
  label: string
  count: number
  percentuale?: number
  imponibile: number
  color: string
  isTotale?: boolean
}) {
  return (
    <div className="bg-white rounded-lg border p-4" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold" style={{ color }}>{label}</span>
        {!isTotale && percentuale !== undefined && (
          <span className="text-xs font-medium text-gray-400">{percentuale}%</span>
        )}
      </div>
      <div className="flex items-end justify-between">
        <span className="text-3xl font-bold text-gray-800">{count}</span>
        <span className="text-sm text-gray-500 text-right">
          € {formatEuro(imponibile)}
        </span>
      </div>
    </div>
  )
}

// ── Componente principale ─────────────────────────────────────────────────────
export default function DashboardPage({ data }: { data: DashboardData }) {
  const anno = new Date().getFullYear()
  const [periodo, setPeriodo] = useState<'30g' | 'anno'>('30g')

  const graficoDati = periodo === 'anno' ? data.graficoPeriodo : data.grafico
  const hasData = graficoDati.some((g) => g.totale > 0)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* ── Statistiche preventivi ── */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Preventivi {anno}
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Totale"
            count={data.totale}
            imponibile={data.imponibileTotale}
            color={COLORS.totale}
            isTotale
          />
          <StatCard
            label="Accettati"
            count={data.accettati.count}
            percentuale={data.accettati.percentuale}
            imponibile={data.accettati.imponibile}
            color={COLORS.accettati}
          />
          <StatCard
            label="Rifiutati"
            count={data.rifiutati.count}
            percentuale={data.rifiutati.percentuale}
            imponibile={data.rifiutati.imponibile}
            color={COLORS.rifiutati}
          />
          <StatCard
            label="Bozze"
            count={data.bozze.count}
            percentuale={data.bozze.percentuale}
            imponibile={data.bozze.imponibile}
            color={COLORS.bozze}
          />
        </div>
      </div>

      {/* ── Grafico andamento ── */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            {periodo === '30g' ? 'Andamento ultimi 30 giorni' : `Andamento ${anno} per mese`}
          </p>
          <div className="flex rounded-md border overflow-hidden text-xs font-medium">
            <button
              onClick={() => setPeriodo('30g')}
              className={`px-3 py-1 transition-colors ${periodo === '30g' ? 'bg-teal-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              30 giorni
            </button>
            <button
              onClick={() => setPeriodo('anno')}
              className={`px-3 py-1 border-l transition-colors ${periodo === 'anno' ? 'bg-teal-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              Anno
            </button>
          </div>
        </div>
        {!hasData ? (
          <p className="text-sm text-gray-400 text-center py-8">Nessun dato disponibile</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={graficoDati} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="data"
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                interval={periodo === 'anno' ? 0 : 4}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                width={36}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="totale"
                name="Totale"
                stroke={COLORS.totale}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="accettati"
                name="Accettati"
                stroke={COLORS.accettati}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="rifiutati"
                name="Rifiutati"
                stroke={COLORS.rifiutati}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="bozze"
                name="Bozze"
                stroke={COLORS.bozze}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                strokeDasharray="4 2"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Attività recenti ── */}
      <div className="border-l-4 border-teal-500 bg-white rounded-r-lg shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-5 w-5 text-teal-600 shrink-0" />
          <h2 className="text-base font-semibold text-gray-900">Attività recente</h2>
        </div>
        {data.attivitaRecenti.length === 0 ? (
          <p className="text-sm text-gray-500">Nessuna attività recente</p>
        ) : (
          <ul className="space-y-2">
            {data.attivitaRecenti.map((item, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <TipoIcon tipo={item.tipo} />
                <Link href={item.href} className="font-medium text-gray-800 hover:underline truncate">
                  {item.descrizione}
                </Link>
                <span className="ml-auto text-gray-400 shrink-0 text-xs">{formatData(item.data)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Rilievo misure ── */}
      <Link
        href="/rilievo"
        className="flex items-center gap-4 bg-white rounded-lg shadow-sm border border-teal-200 p-5 hover:bg-teal-50 transition-colors"
      >
        <Ruler className="h-7 w-7 text-teal-600 shrink-0" />
        <div className="flex-1">
          <h2 className="text-base font-semibold text-teal-700">Rilievo misure cantiere</h2>
          <p className="text-sm text-gray-500 mt-0.5">Nuovo rilievo · Elenco · Impostazioni</p>
        </div>
        <ChevronRight className="h-5 w-5 text-teal-400 shrink-0" />
      </Link>
    </div>
  )
}
