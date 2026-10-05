'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Upload, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatEuro } from '@/lib/pricing'
import type { DipendenteConSaldo } from '@/lib/dipendenti'
import DialogDipendente from './DialogDipendente'

interface Props {
  dipendenti: DipendenteConSaldo[]
}

export default function PaginaDipendenti({ dipendenti }: Props) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)

  const totali = dipendenti.reduce(
    (acc, d) => ({
      dovuto: acc.dovuto + d.dovuto,
      pagato: acc.pagato + d.pagato,
      residuo: acc.residuo + d.residuo,
      mesi_aperti: acc.mesi_aperti + d.mesi_aperti,
    }),
    { dovuto: 0, pagato: 0, residuo: 0, mesi_aperti: 0 },
  )

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Dipendenti</h1>
        {/* Sul telefono tasti compatti, che vanno a capo se lo spazio non basta */}
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          <Button variant="outline" asChild className="max-sm:h-8 max-sm:px-2.5 max-sm:text-xs">
            <Link href="/dipendenti/carica">
              <Upload className="h-4 w-4 mr-2 max-sm:mr-1 max-sm:h-3.5 max-sm:w-3.5" /> Carica documenti
            </Link>
          </Button>
          <Button asChild className="max-sm:h-8 max-sm:px-2.5 max-sm:text-xs bg-black text-white hover:bg-black/90">
            <Link href="/dipendenti/altri">
              <Users className="h-4 w-4 mr-2 max-sm:mr-1 max-sm:h-3.5 max-sm:w-3.5" /> Altri Dipendenti
            </Link>
          </Button>
          <Button onClick={() => setDialogOpen(true)} className="max-sm:h-8 max-sm:px-2.5 max-sm:text-xs">
            <Plus className="h-4 w-4 mr-2 max-sm:mr-1 max-sm:h-3.5 max-sm:w-3.5" />
            <span className="sm:hidden">Nuovo</span>
            <span className="hidden sm:inline">Nuovo dipendente</span>
          </Button>
        </div>
      </div>

      {dipendenti.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-10">
          Nessun dipendente. Creane uno o carica una busta paga.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b bg-gray-50 dark:bg-gray-900 text-left text-xs text-gray-500 uppercase">
                <th className="px-2 py-2 sm:px-3">Dipendente</th>
                <th className="px-2 py-2 text-right sm:px-3">Dovuto</th>
                <th className="px-2 py-2 text-right sm:px-3">Pagato</th>
                <th className="px-2 py-2 text-right sm:px-3">Da pagare</th>
                <th className="hidden px-3 py-2 text-right sm:table-cell">Mesi aperti</th>
              </tr>
            </thead>
            <tbody>
              {dipendenti.map((d, i) => (
                <tr
                  key={d.id}
                  onClick={() => router.push(`/dipendenti/${d.id}`)}
                  className={cn(
                    'border-b cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950',
                    i % 2 === 1 && 'bg-gray-50/60 dark:bg-gray-900/40',
                  )}
                >
                  <td className="px-2 py-2.5 font-medium sm:px-3">
                    {/* Telefono: cognome sopra e nome sotto, etichette piccole sotto ancora */}
                    <span className="block sm:inline">{d.cognome}</span>{' '}
                    <span className="block sm:inline">{d.nome}</span>
                    {d.ruolo === 'amministratore' && (
                      <span className="mt-0.5 block w-fit rounded bg-indigo-100 px-1 py-px text-[9px] uppercase tracking-wide text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 sm:ml-2 sm:mt-0 sm:inline sm:px-1.5 sm:py-0.5 sm:text-xs sm:normal-case sm:tracking-normal">
                        amministratore
                      </span>
                    )}
                    {!d.attivo && (
                      <span className="mt-0.5 block w-fit rounded bg-gray-200 px-1 py-px text-[9px] uppercase tracking-wide text-gray-500 dark:bg-gray-800 sm:ml-2 sm:mt-0 sm:inline sm:px-1.5 sm:py-0.5 sm:text-xs sm:normal-case sm:tracking-normal">
                        non attivo
                      </span>
                    )}
                    {d.riceve_busta_paga && d.mesi_aperti > 0 && (
                      <span className="mt-0.5 block text-[10px] font-medium text-red-600 dark:text-red-400 sm:hidden">
                        {d.mesi_aperti === 1 ? '1 mese aperto' : `${d.mesi_aperti} mesi aperti`}
                      </span>
                    )}
                  </td>
                  {/* Senza busta paga non esiste un dovuto: una colonna a zero
                      farebbe sembrare che manchi un dato, il trattino dice che
                      quel conto per questa persona non si fa. */}
                  <td className="px-2 py-2.5 text-right whitespace-nowrap sm:px-3">
                    {d.riceve_busta_paga
                      ? formatEuro(d.dovuto)
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-2 py-2.5 text-right whitespace-nowrap sm:px-3">{formatEuro(d.pagato)}</td>
                  <td
                    className={cn(
                      'px-2 py-2.5 text-right font-semibold whitespace-nowrap sm:px-3',
                      !d.riceve_busta_paga
                        ? 'text-gray-400'
                        : d.residuo > 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-green-700 dark:text-green-400',
                    )}
                  >
                    {d.riceve_busta_paga ? formatEuro(d.residuo) : '—'}
                  </td>
                  <td className={cn(
                    'hidden px-3 py-2.5 text-right sm:table-cell',
                    d.riceve_busta_paga && d.mesi_aperti > 0 && 'font-semibold text-red-600 dark:text-red-400',
                  )}>
                    {d.riceve_busta_paga
                      ? d.mesi_aperti
                      : <span className="text-gray-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-gray-100 dark:bg-gray-900 font-semibold">
                <td className="px-2 py-2.5 sm:px-3">Totale ({dipendenti.length})</td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap sm:px-3">{formatEuro(totali.dovuto)}</td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap sm:px-3">{formatEuro(totali.pagato)}</td>
                <td
                  className={cn(
                    'px-2 py-2.5 text-right whitespace-nowrap sm:px-3',
                    totali.residuo > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400',
                  )}
                >
                  {formatEuro(totali.residuo)}
                </td>
                <td className={cn('hidden px-3 py-2.5 text-right sm:table-cell', totali.mesi_aperti > 0 && 'text-red-600 dark:text-red-400')}>{totali.mesi_aperti}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <DialogDipendente open={dialogOpen} onOpenChange={setDialogOpen} dipendente={null} />
    </div>
  )
}
