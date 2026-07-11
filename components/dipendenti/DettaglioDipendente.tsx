'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Banknote, FileText, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatEuro } from '@/lib/pricing'
import {
  deleteBustaPaga,
  deleteDipendente,
  deletePagamento,
  getDipendenteFileUrl,
} from '@/actions/dipendenti'
import {
  calcolaRigheMensilita,
  calcolaSaldoDipendente,
  formatPeriodo,
  MENSILITA_LABELS,
} from '@/lib/dipendenti'
import type { BustaPaga, Dipendente, PagamentoDipendente } from '@/types/dipendente'
import DialogDipendente from './DialogDipendente'
import DialogPagamentoManuale from './DialogPagamentoManuale'

interface Props {
  dipendente: Dipendente
  buste: BustaPaga[]
  pagamenti: PagamentoDipendente[]
}

const METODO_LABELS: Record<string, string> = {
  bonifico: 'Bonifico',
  contanti: 'Contanti',
  altro: 'Altro',
}

const formatData = (d: string) => {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('it-IT')
}

export default function DettaglioDipendente({ dipendente, buste, pagamenti }: Props) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [pagamentoOpen, setPagamentoOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const righe = calcolaRigheMensilita(buste, pagamenti)
  const saldo = calcolaSaldoDipendente(buste, pagamenti)

  const apriFile = async (path: string) => {
    try {
      const url = await getDipendenteFileUrl(path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      toast.error('File non disponibile')
    }
  }

  const rimuoviBusta = async (id: string) => {
    if (!window.confirm('Eliminare questa busta paga?')) return
    setBusyId(id)
    try {
      await deleteBustaPaga(id)
      toast.success('Busta eliminata')
      router.refresh()
    } catch {
      toast.error("Errore nell'eliminazione")
    } finally {
      setBusyId(null)
    }
  }

  const rimuoviPagamento = async (id: string) => {
    if (!window.confirm('Eliminare questo pagamento?')) return
    setBusyId(id)
    try {
      await deletePagamento(id)
      toast.success('Pagamento eliminato')
      router.refresh()
    } catch {
      toast.error("Errore nell'eliminazione")
    } finally {
      setBusyId(null)
    }
  }

  const rimuoviDipendente = async () => {
    if (!window.confirm(`Eliminare ${dipendente.nome} ${dipendente.cognome} con tutte le buste e i pagamenti?`)) return
    setDeleting(true)
    try {
      await deleteDipendente(dipendente.id)
      toast.success('Dipendente eliminato')
      router.push('/dipendenti')
    } catch {
      toast.error("Errore nell'eliminazione")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dipendenti"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {dipendente.cognome} {dipendente.nome}
            </h1>
            <p className="text-xs text-gray-500">
              {dipendente.codice_fiscale ?? 'CF non inserito'}
              {dipendente.iban ? ` · ${dipendente.iban}` : ''}
              {!dipendente.attivo ? ' · NON ATTIVO' : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`/dipendenti/carica?dip=${dipendente.id}`}>
              <Upload className="h-4 w-4 mr-2" /> Carica busta
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/dipendenti/carica?tipo=bonifico&dip=${dipendente.id}`}>
              <Banknote className="h-4 w-4 mr-2" /> Carica bonifico
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setPagamentoOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Pagamento manuale
          </Button>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-2" /> Modifica
          </Button>
          <Button variant="ghost" className="text-red-500 hover:text-red-700" disabled={deleting} onClick={rimuoviDipendente}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Card riepilogo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border p-3">
          <p className="text-xs text-gray-500">Dovuto (buste)</p>
          <p className="text-lg font-bold">{formatEuro(saldo.dovuto)}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-gray-500">Pagato</p>
          <p className="text-lg font-bold">{formatEuro(saldo.pagato)}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-gray-500">Da pagare</p>
          <p className={cn('text-lg font-bold', saldo.residuo > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400')}>
            {formatEuro(saldo.residuo)}
          </p>
        </div>
      </div>

      {/* Tabella mensilità */}
      {righe.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-10">
          Nessuna busta o pagamento registrato.
        </p>
      ) : (
        <div className="space-y-2">
          {righe.map((r) => (
            <div
              key={`${r.periodo}|${r.mensilita}`}
              className="rounded-md border p-3 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold capitalize">
                  {formatPeriodo(r.periodo)}
                  {r.mensilita !== 'mensile' && (
                    <span className="ml-2 text-xs rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-1.5 py-0.5">
                      {MENSILITA_LABELS[r.mensilita]}
                    </span>
                  )}
                </p>
                <p className="text-sm">
                  Netto: <span className="font-semibold">{r.buste.length > 0 ? formatEuro(r.dovuto) : '—'}</span>
                  {' · '}Pagato: <span className="font-semibold">{formatEuro(r.pagato)}</span>
                  {' · '}Residuo:{' '}
                  <span className={cn('font-bold', r.residuo > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400')}>
                    {formatEuro(r.residuo)}
                  </span>
                </p>
              </div>

              {r.buste.length === 0 && (
                <p className="text-xs text-amber-600">
                  Busta paga non ancora caricata per questo mese (pagamenti registrati senza busta).
                </p>
              )}

              {r.buste.map((busta) => (
                <div key={busta.id} className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-900 rounded p-2">
                  <span>
                    Busta paga · netto {formatEuro(Number(busta.netto))}
                    {busta.lordo ? ` · lordo ${formatEuro(Number(busta.lordo))}` : ''}
                  </span>
                  <span className="flex gap-1">
                    {busta.file_path && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => apriFile(busta.file_path!)}>
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400 hover:text-red-600"
                      disabled={busyId === busta.id}
                      onClick={() => rimuoviBusta(busta.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </div>
              ))}

              {r.pagamenti.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm rounded p-2 border border-dashed">
                  <span>
                    {formatData(p.data_pagamento)} · {METODO_LABELS[p.metodo] ?? p.metodo} ·{' '}
                    <span className="font-semibold">{formatEuro(Number(p.importo))}</span>
                    {p.note ? ` · ${p.note}` : ''}
                  </span>
                  <span className="flex gap-1">
                    {p.file_path && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => apriFile(p.file_path!)}>
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400 hover:text-red-600"
                      disabled={busyId === p.id}
                      onClick={() => rimuoviPagamento(p.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <DialogDipendente open={editOpen} onOpenChange={setEditOpen} dipendente={dipendente} />
      <DialogPagamentoManuale
        open={pagamentoOpen}
        onOpenChange={setPagamentoOpen}
        dipendenteId={dipendente.id}
        periodoDefault={righe.find((r) => r.residuo > 0)?.periodo}
      />
    </div>
  )
}
