'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Eye, Trash2, ArrowLeft, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { deletePreventivoScorrevoli } from '@/actions/preventivi-scorrevoli'
import type { PreventivoScorrevoli, StatoPreventivoScorrevoli } from '@/types/scorrevoli'

const STATO_CLASS: Record<StatoPreventivoScorrevoli, string> = {
  bozza:     'bg-gray-100 text-gray-600 border-gray-200',
  inviato:   'bg-blue-100 text-blue-700 border-blue-200',
  accettato: 'bg-green-100 text-green-700 border-green-200',
  rifiutato: 'bg-red-100 text-red-700 border-red-200',
}
const STATO_LABEL: Record<StatoPreventivoScorrevoli, string> = {
  bozza: 'Bozza', inviato: 'Inviato', accettato: 'Accettato', rifiutato: 'Rifiutato',
}

function nomeCliente(p: PreventivoScorrevoli) {
  return p.cliente.azienda || p.cliente.nome || p.cliente.email || '—'
}

export default function ListaPreventiviScorrevoli({ preventivi }: { preventivi: PreventivoScorrevoli[] }) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const handleDelete = () => {
    if (!deletingId) return
    startTransition(async () => {
      try {
        await deletePreventivoScorrevoli(deletingId)
        toast.success('Preventivo eliminato')
        router.refresh()
      } catch { toast.error('Errore eliminazione') }
      finally { setDeletingId(null) }
    })
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/preventivi" className="text-gray-400 hover:text-gray-600">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Preventivi Scorrevoli</h1>
          </div>
          <p className="text-sm text-gray-500 ml-6">Vetrate panoramiche scorrevoli COPRAL</p>
        </div>
        <Button asChild>
          <Link href="/preventivi/scorrevoli/nuovo">
            <Plus className="h-4 w-4 mr-1" />
            Nuovo preventivo
          </Link>
        </Button>
      </div>

      {preventivi.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium mb-2">Nessun preventivo</p>
          <p className="text-sm mb-5">Crea il primo preventivo scorrevoli.</p>
          <Button asChild>
            <Link href="/preventivi/scorrevoli/nuovo">
              <Plus className="h-4 w-4 mr-1" />
              Nuovo preventivo
            </Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-md border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Numero</th>
                <th className="text-left px-4 py-3 font-medium">Cliente / Cantiere</th>
                <th className="text-left px-4 py-3 font-medium">Righe</th>
                <th className="text-center px-4 py-3 font-medium">Stato</th>
                <th className="text-right px-4 py-3 font-medium">Data</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {preventivi.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-600">{p.numero}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{nomeCliente(p)}</p>
                    {p.cliente.cantiere && <p className="text-xs text-gray-400">{p.cliente.cantiere}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{p.righe.length} conf.</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${STATO_CLASS[p.stato]}`}>
                      {STATO_LABEL[p.stato]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-400">
                    {new Date(p.data).toLocaleDateString('it-IT')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                        <Link href={`/preventivi/scorrevoli/${p.id}`}><Eye className="h-3.5 w-3.5" /></Link>
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600" onClick={() => setDeletingId(p.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina preventivo</AlertDialogTitle>
            <AlertDialogDescription>Questa azione è irreversibile.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
