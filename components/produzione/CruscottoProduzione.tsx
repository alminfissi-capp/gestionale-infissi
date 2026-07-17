'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Factory, AlertTriangle, FileText, Package } from 'lucide-react'
import { formatEuro } from '@/lib/pricing'
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

  const cambiaFiltro = (valore: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('stato', valore)
    router.push(`/produzione?${params.toString()}`)
  }

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

      {daFare.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Da fare</h2>
          <div className="space-y-1.5">
            {daFare.map((o) => (
              <Link
                key={o.id}
                href={`/produzione/${o.commessa_id}`}
                className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-800 p-3 hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                {o.in_ritardo ? (
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                ) : (
                  <Package className="h-4 w-4 text-amber-600 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate text-gray-900 dark:text-gray-100">
                    {o.fornitore_nome ?? 'Fornitore non indicato'} — {o.numero_commessa || 'commessa'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {o.cliente_nome}
                    {o.in_ritardo && o.data_consegna_prevista
                      ? ` · in ritardo dal ${o.data_consegna_prevista}`
                      : ' · da ordinare'}
                  </p>
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400 shrink-0">
                  {formatEuro(o.totale)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
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

        {commesse.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 border border-dashed rounded-lg p-6 text-center">
            Nessuna commessa con questo filtro.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {commesse.map((c) => (
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
