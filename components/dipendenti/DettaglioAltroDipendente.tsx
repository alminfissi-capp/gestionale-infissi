'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Banknote, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatEuro } from '@/lib/pricing'
import {
  calcolaRigheAltro, calcolaSaldoAltro, formatPeriodoAltro, CADENZA_LABELS,
} from '@/lib/altri-dipendenti'
import { deleteAltroDipendente, deleteMovimentoAltro } from '@/actions/altri-dipendenti'
import type { AltroDipendente, MovimentoAltroDipendente } from '@/types/dipendente'
import DialogAltroDipendente from './DialogAltroDipendente'
import DialogMovimento from './DialogMovimento'

interface Props {
  dipendente: AltroDipendente
  movimenti: MovimentoAltroDipendente[]
}

export default function DettaglioAltroDipendente({ dipendente, movimenti }: Props) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [movOpen, setMovOpen] = useState(false)
  const [movTipo, setMovTipo] = useState<'stipendio' | 'pagamento'>('stipendio')

  const righe = calcolaRigheAltro(movimenti)
  const saldo = calcolaSaldoAltro(movimenti)

  const apriMovimento = (tipo: 'stipendio' | 'pagamento') => {
    setMovTipo(tipo)
    setMovOpen(true)
  }

  const rimuoviMovimento = async (id: string) => {
    if (!window.confirm('Eliminare questa voce?')) return
    try {
      await deleteMovimentoAltro(id)
      toast.success('Voce eliminata')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore')
    }
  }

  const rimuoviDipendente = async () => {
    if (!window.confirm('Eliminare il dipendente e tutte le sue voci?')) return
    try {
      await deleteAltroDipendente(dipendente.id)
      toast.success('Dipendente eliminato')
      router.push('/dipendenti/altri')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore')
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dipendenti/altri"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{dipendente.cognome} {dipendente.nome}</h1>
            <p className="text-sm text-gray-500">
              {CADENZA_LABELS[dipendente.cadenza]}
              {!dipendente.attivo ? ' · NON ATTIVO' : ''}
              {dipendente.note ? ` · ${dipendente.note}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => apriMovimento('stipendio')}>
            <Plus className="h-4 w-4 mr-2" /> Aggiungi stipendio
          </Button>
          <Button variant="outline" onClick={() => apriMovimento('pagamento')}>
            <Banknote className="h-4 w-4 mr-2" /> Aggiungi pagamento
          </Button>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-2" /> Modifica
          </Button>
          <Button variant="outline" onClick={rimuoviDipendente}>
            <Trash2 className="h-4 w-4 mr-2" /> Elimina
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border p-3">
          <p className="text-xs text-gray-500 uppercase">Dovuto</p>
          <p className="text-lg font-semibold">{formatEuro(saldo.dovuto)}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-gray-500 uppercase">Pagato</p>
          <p className="text-lg font-semibold">{formatEuro(saldo.pagato)}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-gray-500 uppercase">Da pagare</p>
          <p className={cn('text-lg font-semibold',
            saldo.residuo > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400')}>
            {formatEuro(saldo.residuo)}
          </p>
        </div>
      </div>

      {righe.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-10">
          Nessuna voce. Aggiungi uno stipendio o un pagamento.
        </p>
      ) : (
        <div className="space-y-3">
          {righe.map((r) => (
            <div key={r.periodo} className="rounded-md border">
              <div className="flex items-center justify-between border-b bg-gray-50 dark:bg-gray-900 px-3 py-2">
                <span className="text-sm font-semibold">
                  {formatPeriodoAltro(r.periodo, dipendente.cadenza)}
                </span>
                <span className="flex items-center gap-3 text-sm">
                  <span className="text-gray-500">Dovuto {formatEuro(r.dovuto)}</span>
                  <span className="text-gray-500">Pagato {formatEuro(r.pagato)}</span>
                  <span className={cn('font-semibold',
                    r.residuo > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400')}>
                    Residuo {formatEuro(r.residuo)}
                  </span>
                </span>
              </div>
              <div className="divide-y">
                {r.stipendi.map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>Stipendio{m.note ? ` · ${m.note}` : ''}</span>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums">{formatEuro(Number(m.importo))}</span>
                      <button onClick={() => rimuoviMovimento(m.id)} aria-label="Elimina"
                        className="text-gray-400 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                ))}
                {r.pagamenti.map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-green-700 dark:text-green-400">
                      Pagamento{m.data_pagamento ? ` · ${m.data_pagamento}` : ''}
                      {m.metodo ? ` · ${m.metodo}` : ''}{m.note ? ` · ${m.note}` : ''}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums text-green-700 dark:text-green-400">
                        {formatEuro(Number(m.importo))}
                      </span>
                      <button onClick={() => rimuoviMovimento(m.id)} aria-label="Elimina"
                        className="text-gray-400 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <DialogAltroDipendente open={editOpen} onOpenChange={setEditOpen} dipendente={dipendente} />
      <DialogMovimento open={movOpen} onOpenChange={setMovOpen} dipendente={dipendente} tipo={movTipo} />
    </div>
  )
}
