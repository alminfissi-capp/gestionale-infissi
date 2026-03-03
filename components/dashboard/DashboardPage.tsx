'use client'

import { Activity, BarChart3, Ruler, FileText, User, BookOpen } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { DashboardData, ActivityItem } from '@/actions/dashboard'

function formatData(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function TipoIcon({ tipo }: { tipo: ActivityItem['tipo'] }) {
  if (tipo === 'preventivo') return <FileText className="h-4 w-4 text-teal-600 shrink-0" />
  if (tipo === 'cliente') return <User className="h-4 w-4 text-blue-600 shrink-0" />
  return <BookOpen className="h-4 w-4 text-green-600 shrink-0" />
}

export default function DashboardPage({ data }: { data: DashboardData }) {
  const anno = new Date().getFullYear()

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Banner attività recente */}
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
                <Link
                  href={item.href}
                  className="font-medium text-gray-800 hover:underline truncate"
                >
                  {item.descrizione}
                </Link>
                <span className="ml-auto text-gray-400 shrink-0 text-xs">{formatData(item.data)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Banner preventivi anno */}
      <div className="border-l-4 border-blue-500 bg-white rounded-r-lg shadow-sm p-5">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-blue-600 shrink-0" />
          <span className="text-base font-semibold text-gray-900">
            Preventivi creati nel {anno}
          </span>
          <span className="ml-auto text-3xl font-bold text-blue-700">{data.preventiviAnno}</span>
        </div>
      </div>

      {/* Card placeholder rilievo misure */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <div className="flex items-start gap-3">
          <Ruler className="h-6 w-6 text-gray-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-700">Rilievo misure cantiere</h2>
            <p className="text-sm text-gray-400 mt-0.5">In sviluppo</p>
          </div>
        </div>
        <div className="mt-4">
          <Button disabled variant="outline" size="sm">
            Prossimamente
          </Button>
        </div>
      </div>
    </div>
  )
}
