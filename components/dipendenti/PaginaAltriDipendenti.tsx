'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatEuro } from '@/lib/pricing'
import { CADENZA_LABELS, type AltroDipendenteConSaldo } from '@/lib/altri-dipendenti'
import DialogAltroDipendente from './DialogAltroDipendente'

interface Props {
  dipendenti: AltroDipendenteConSaldo[]
}

export default function PaginaAltriDipendenti({ dipendenti }: Props) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)

  const totali = dipendenti.reduce(
    (acc, d) => ({
      dovuto: acc.dovuto + d.dovuto,
      pagato: acc.pagato + d.pagato,
      residuo: acc.residuo + d.residuo,
    }),
    { dovuto: 0, pagato: 0, residuo: 0 },
  )

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dipendenti"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <h1 className="text-2xl font-bold">Altri dipendenti</h1>
        </div>
        {/* Sul telefono tasto compatto */}
        <Button onClick={() => setDialogOpen(true)} className="max-sm:h-8 max-sm:px-2.5 max-sm:text-xs">
          <Plus className="h-4 w-4 mr-2 max-sm:mr-1 max-sm:h-3.5 max-sm:w-3.5" />
          <span className="sm:hidden">Nuovo</span>
          <span className="hidden sm:inline">Nuovo altro dipendente</span>
        </Button>
      </div>

      {dipendenti.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-10">
          Nessun altro dipendente. Creane uno per registrare stipendi e pagamenti a mano.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b bg-gray-50 dark:bg-gray-900 text-left text-xs text-gray-500 uppercase">
                <th className="px-2 py-2 sm:px-3">Dipendente</th>
                <th className="hidden px-3 py-2 sm:table-cell">Cadenza</th>
                <th className="px-2 py-2 text-right sm:px-3">Dovuto</th>
                <th className="px-2 py-2 text-right sm:px-3">Pagato</th>
                <th className="px-2 py-2 text-right sm:px-3">Da pagare</th>
              </tr>
            </thead>
            <tbody>
              {dipendenti.map((d, i) => (
                <tr
                  key={d.id}
                  onClick={() => router.push(`/dipendenti/altri/${d.id}`)}
                  className={cn(
                    'border-b cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950',
                    i % 2 === 1 && 'bg-gray-50/60 dark:bg-gray-900/40',
                  )}
                >
                  <td className="px-2 py-2.5 font-medium sm:px-3">
                    {/* Telefono: cognome sopra e nome sotto, cadenza ed etichette piccole sotto ancora */}
                    <span className="block sm:inline">{d.cognome}</span>{' '}
                    <span className="block sm:inline">{d.nome}</span>
                    {!d.attivo && (
                      <span className="mt-0.5 block w-fit rounded bg-gray-200 px-1 py-px text-[9px] uppercase tracking-wide text-gray-500 dark:bg-gray-800 sm:ml-2 sm:mt-0 sm:inline sm:px-1.5 sm:py-0.5 sm:text-xs sm:normal-case sm:tracking-normal">
                        non attivo
                      </span>
                    )}
                    <span className="mt-0.5 block text-[10px] font-normal text-gray-500 sm:hidden">
                      {CADENZA_LABELS[d.cadenza]}
                    </span>
                  </td>
                  <td className="hidden px-3 py-2.5 sm:table-cell">{CADENZA_LABELS[d.cadenza]}</td>
                  <td className="px-2 py-2.5 text-right whitespace-nowrap sm:px-3">{formatEuro(d.dovuto)}</td>
                  <td className="px-2 py-2.5 text-right whitespace-nowrap sm:px-3">{formatEuro(d.pagato)}</td>
                  <td className={cn(
                    'px-2 py-2.5 text-right font-semibold whitespace-nowrap sm:px-3',
                    d.residuo > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400',
                  )}>
                    {formatEuro(d.residuo)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-gray-100 dark:bg-gray-900 font-semibold">
                <td className="px-2 py-2.5 sm:px-3">Totale ({dipendenti.length})</td>
                <td className="hidden px-3 py-2.5 sm:table-cell" />
                <td className="px-2 py-2.5 text-right whitespace-nowrap sm:px-3">{formatEuro(totali.dovuto)}</td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap sm:px-3">{formatEuro(totali.pagato)}</td>
                <td className={cn(
                  'px-2 py-2.5 text-right whitespace-nowrap sm:px-3',
                  totali.residuo > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400',
                )}>
                  {formatEuro(totali.residuo)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <DialogAltroDipendente open={dialogOpen} onOpenChange={setDialogOpen} dipendente={null} />
    </div>
  )
}
