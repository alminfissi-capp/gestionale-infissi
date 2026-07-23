'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Factory, AlertTriangle, FileText, Package, Search,
  BarChart3, MessageSquare, ClipboardList,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { OrdineConCommessa, CommessaProduzione } from '@/types/produzione'

interface Props {
  daFare: OrdineConCommessa[]
  commesse: CommessaProduzione[]
  statoFiltro: string
}

const OPZIONI_FILTRO = [
  { value: 'aperte', label: 'Aperte' },
  { value: 'in_lavorazione', label: 'In lavorazione' },
  { value: 'da_iniziare', label: 'Da iniziare' },
  { value: 'tutte', label: 'Tutte' },
]

export default function CruscottoProduzione({ daFare, commesse, statoFiltro }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [ricerca, setRicerca] = useState('')

  const cambiaFiltro = (valore: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('stato', valore)
    router.push(`/produzione?${params.toString()}`)
  }

  const q = ricerca.trim().toLowerCase()
  const commesseFiltrate = q
    ? commesse.filter(
        (c) =>
          (c.numero_commessa || '').toLowerCase().includes(q) ||
          (c.cliente_nome || '').toLowerCase().includes(q)
      )
    : commesse

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Factory className="h-6 w-6 text-gray-500 dark:text-gray-400" />
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Produzione</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Documenti, file e ordini fornitori delle commesse
          </p>
        </div>
      </div>

      {/* Zona superiore: statistiche + da fare + messaggi */}
      <section className="grid gap-3 lg:grid-cols-3">
        {/* Statistiche (segnaposto grafico) */}
        <div className="lg:col-span-2 flex min-h-[240px] flex-col rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Statistiche</h2>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-500">
            <BarChart3 className="h-8 w-8 opacity-40" />
            <p className="text-sm">Grafico in arrivo</p>
          </div>
        </div>

        {/* Colonna destra: da fare + messaggi */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-1 flex-col rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-gray-400" />
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Da fare</h2>
              {daFare.length > 0 && (
                <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                  {daFare.length}
                </span>
              )}
            </div>
            {daFare.length === 0 ? (
              <p className="mt-3 text-sm text-gray-400 dark:text-gray-500">Niente da fare.</p>
            ) : (
              <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
                {daFare.map((o) => (
                  <Link
                    key={o.id}
                    href={`/produzione/${o.commessa_id}`}
                    className="flex items-center gap-2 rounded-md border border-gray-200 dark:border-gray-800 p-2 hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    {o.in_ritardo ? (
                      <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                    ) : (
                      <Package className="h-4 w-4 text-amber-600 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {o.numero_commessa || 'commessa'} — {o.fornitore_nome ?? 'fornitore n.d.'}
                      </p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {o.cliente_nome}
                        {o.in_ritardo && o.data_consegna_prevista
                          ? ` · in ritardo dal ${o.data_consegna_prevista}`
                          : ' · da ordinare'}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Messaggi (segnaposto) */}
          <div className="flex flex-1 flex-col rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-gray-400" />
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Messaggi</h2>
            </div>
            <div className="flex flex-1 items-center justify-center py-4 text-sm text-gray-400 dark:text-gray-500">
              Nessun messaggio dalla produzione.
            </div>
          </div>
        </div>
      </section>

      {/* Zona inferiore: ricerca + filtri + commesse */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Commesse</h2>
          <div className="flex gap-1">
            {OPZIONI_FILTRO.map((o) => (
              <button
                key={o.value}
                onClick={() => cambiaFiltro(o.value)}
                className={
                  statoFiltro === o.value
                    ? 'rounded-md px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400'
                    : 'rounded-md px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            placeholder="Cerca commessa per numero o cliente..."
            className="pl-9"
          />
        </div>

        {commesse.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 border border-dashed rounded-lg p-6 text-center">
            Nessuna commessa con questo filtro.
          </p>
        ) : commesseFiltrate.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 border border-dashed rounded-lg p-6 text-center">
            Nessuna commessa trovata per &quot;{ricerca}&quot;.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {commesseFiltrate.map((c) => (
              <Link
                key={c.id}
                href={`/produzione/${c.id}`}
                className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                <p className="text-sm font-medium truncate text-gray-900 dark:text-gray-100">
                  {c.numero_commessa || 'Senza numero'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.cliente_nome}</p>
                <div className="mt-2 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span className="inline-flex items-center gap-1">
                    <Package className="h-3.5 w-3.5" /> {c.ordini_aperti}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" /> {c.documenti}
                  </span>
                  {c.ordini_in_ritardo > 0 && (
                    <span className="inline-flex items-center gap-1 text-red-600">
                      <AlertTriangle className="h-3.5 w-3.5" /> {c.ordini_in_ritardo}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
