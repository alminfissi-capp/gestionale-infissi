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
import type { AltroDipendente, MetodoPagamentoDipendente, MovimentoAltroDipendente } from '@/types/dipendente'
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
  const [movIniziale, setMovIniziale] = useState<{
    data_periodo: string; importo: number; metodo: MetodoPagamentoDipendente | null
  } | null>(null)

  const righe = calcolaRigheAltro(movimenti)
  const saldo = calcolaSaldoAltro(movimenti)

  const apriMovimento = (tipo: 'stipendio' | 'pagamento') => {
    setMovTipo(tipo)
    setMovIniziale(null)
    setMovOpen(true)
  }

  /** Metodo dell'ultimo pagamento registrato: di solito si paga sempre allo stesso modo. */
  const ultimoMetodo = [...movimenti]
    .filter((m) => m.tipo === 'pagamento' && m.metodo)
    .sort((a, b) => (b.data_pagamento ?? '').localeCompare(a.data_pagamento ?? ''))[0]?.metodo ?? null

  /** Il "+" di un periodo: pagamento gia' compilato col residuo di quel periodo. */
  const pagaResiduo = (periodo: string, residuo: number) => {
    setMovTipo('pagamento')
    setMovIniziale({ data_periodo: periodo, importo: residuo, metodo: ultimoMetodo as MetodoPagamentoDipendente | null })
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
    <div className="p-3 sm:p-4 lg:p-6 space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1">
          <Button variant="ghost" size="icon" asChild className="-ml-2 shrink-0">
            <Link href="/dipendenti/altri"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="min-w-0">
            {/* Modifica ed elimina accanto al nome, solo icone */}
            <div className="flex items-center gap-1">
              <h1 className="break-words text-xl font-bold sm:text-2xl">{dipendente.cognome} {dipendente.nome}</h1>
              <Button
                variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                title="Modifica dipendente" aria-label="Modifica dipendente"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-red-500 hover:text-red-700"
                title="Elimina dipendente" aria-label="Elimina dipendente"
                onClick={rimuoviDipendente}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-gray-500">
              {CADENZA_LABELS[dipendente.cadenza]}
              {!dipendente.attivo ? ' · NON ATTIVO' : ''}
              {dipendente.note ? ` · ${dipendente.note}` : ''}
            </p>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <Button variant="outline" className="max-sm:h-9 max-sm:px-2 max-sm:text-xs" onClick={() => apriMovimento('stipendio')}>
            <Plus className="h-4 w-4 mr-2 max-sm:mr-1" /> Aggiungi stipendio
          </Button>
          <Button variant="outline" className="max-sm:h-9 max-sm:px-2 max-sm:text-xs" onClick={() => apriMovimento('pagamento')}>
            <Banknote className="h-4 w-4 mr-2 max-sm:mr-1" /> Aggiungi pagamento
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
              {/* Testata del periodo: il dovuto e' gia' nella riga Stipendio. Il "+" c'e' solo
                  finche' resta un residuo e precompila il pagamento di quel periodo. */}
              <div className="flex items-center justify-between gap-2 border-b bg-gray-50 dark:bg-gray-900 px-3 py-2">
                <span className="min-w-0 text-sm font-semibold">
                  {formatPeriodoAltro(r.periodo, dipendente.cadenza)}
                </span>
                <span className="flex shrink-0 items-center gap-3 text-sm sm:gap-4">
                  <span className="text-right">
                    <span className="block text-[11px] text-gray-500">Pagato</span>
                    <span className="block tabular-nums">{formatEuro(r.pagato)}</span>
                  </span>
                  <span className="text-right">
                    <span className={cn('block text-[11px]',
                      r.residuo > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400')}>
                      Residuo
                    </span>
                    <span className={cn('block font-semibold tabular-nums',
                      r.residuo > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400')}>
                      {formatEuro(r.residuo)}
                    </span>
                  </span>
                  {r.residuo > 0 ? (
                    <Button
                      type="button" size="icon" className="h-8 w-8 shrink-0"
                      title="Paga il residuo di questo periodo" aria-label="Paga il residuo di questo periodo"
                      onClick={() => pagaResiduo(r.periodo, r.residuo)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  ) : (
                    <span className="w-8 shrink-0" aria-hidden />
                  )}
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
      <DialogMovimento
        open={movOpen} onOpenChange={setMovOpen} dipendente={dipendente} tipo={movTipo} iniziale={movIniziale}
      />
    </div>
  )
}
