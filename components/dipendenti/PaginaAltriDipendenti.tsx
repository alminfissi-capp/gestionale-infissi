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

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dipendenti"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <h1 className="text-2xl font-bold">Altri dipendenti</h1>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nuovo altro dipendente
        </Button>
      </div>

      {dipendenti.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-10">
          Nessun altro dipendente. Creane uno per registrare stipendi e pagamenti a mano.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 dark:bg-gray-900 text-left text-xs text-gray-500 uppercase">
                <th className="px-3 py-2">Dipendente</th>
                <th className="px-3 py-2">Cadenza</th>
                <th className="px-3 py-2 text-right">Dovuto</th>
                <th className="px-3 py-2 text-right">Pagato</th>
                <th className="px-3 py-2 text-right">Da pagare</th>
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
                  <td className="px-3 py-2.5 font-medium">
                    {d.cognome} {d.nome}
                    {!d.attivo && (
                      <span className="ml-2 text-xs rounded bg-gray-200 dark:bg-gray-800 px-1.5 py-0.5 text-gray-500">
                        non attivo
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">{CADENZA_LABELS[d.cadenza]}</td>
                  <td className="px-3 py-2.5 text-right">{formatEuro(d.dovuto)}</td>
                  <td className="px-3 py-2.5 text-right">{formatEuro(d.pagato)}</td>
                  <td className={cn(
                    'px-3 py-2.5 text-right font-semibold',
                    d.residuo > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400',
                  )}>
                    {formatEuro(d.residuo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DialogAltroDipendente open={dialogOpen} onOpenChange={setDialogOpen} dipendente={null} />
    </div>
  )
}
