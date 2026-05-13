'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Search, Trash2, Pencil, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { deleteCommessa } from '@/actions/commesse'
import { formatEuro } from '@/lib/pricing'
import type { CommessaCompleta, PreventivoPerCommessa, UtentePerCommessa } from '@/types/commessa'
import DialogCommessa from './DialogCommessa'
import DialogAcconto from './DialogAcconto'
import DialogDocumenti from './DialogDocumenti'

interface Props {
  commesse: CommessaCompleta[]
  preventivi: PreventivoPerCommessa[]
  utenti: UtentePerCommessa[]
  preventivoDaConvertire?: PreventivoPerCommessa | null
}

function formatMese(data: string): string {
  const [y, m] = data.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  const mese = d.toLocaleDateString('it-IT', { month: 'long' })
  return `${mese.charAt(0).toUpperCase() + mese.slice(1)} ${y}`
}

export default function TabellaCommesse({ commesse, preventivi, utenti, preventivoDaConvertire }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [dialogCommessa, setDialogCommessa] = useState(false)
  const [editingCommessa, setEditingCommessa] = useState<CommessaCompleta | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [dialogAcconto, setDialogAcconto] = useState<CommessaCompleta | null>(null)
  const [dialogDocumenti, setDialogDocumenti] = useState<CommessaCompleta | null>(null)

  // Auto-apre il dialog se c'è un preventivo da convertire (query param ?from=)
  useEffect(() => {
    if (preventivoDaConvertire) {
      setEditingCommessa(null)
      setDialogCommessa(true)
    }
  }, [preventivoDaConvertire])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return commesse
    return commesse.filter((c) =>
      [c.cliente_nome, c.numero_commessa, c.numero_preventivo, c.operatore_nome].some(
        (f) => f?.toLowerCase().includes(q)
      )
    )
  }, [commesse, search])

  const handleDelete = async () => {
    if (!deletingId) return
    setDeleting(true)
    try {
      await deleteCommessa(deletingId)
      toast.success('Commessa eliminata')
      router.refresh()
    } catch {
      toast.error("Errore nell'eliminazione")
    } finally {
      setDeleting(false)
      setDeletingId(null)
    }
  }

  const openEdit = (c: CommessaCompleta) => {
    setEditingCommessa(c)
    setDialogCommessa(true)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Cerca cliente, numero..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button onClick={() => { setEditingCommessa(null); setDialogCommessa(true) }}>
          <Plus className="h-4 w-4 mr-1" />
          Nuova commessa
        </Button>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          {commesse.length === 0 ? (
            <>
              <p className="text-lg font-medium mb-2">Nessuna commessa</p>
              <p className="text-sm mb-4">Crea la prima commessa per iniziare.</p>
              <Button onClick={() => { setEditingCommessa(null); setDialogCommessa(true) }}>
                <Plus className="h-4 w-4 mr-1" />
                Nuova commessa
              </Button>
            </>
          ) : (
            <p className="text-sm">Nessun risultato per &quot;{search}&quot;</p>
          )}
        </div>
      )}

      {/* Tabella */}
      {filtered.length > 0 && (
        <div className="rounded-md border bg-white overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[140px]">Cliente</TableHead>
                <TableHead className="min-w-[90px]">N. Prev.</TableHead>
                <TableHead className="text-right min-w-[100px]">Imponibile</TableHead>
                <TableHead className="text-right min-w-[80px]">IVA</TableHead>
                <TableHead className="text-right min-w-[130px]">Acconti</TableHead>
                <TableHead className="text-right min-w-[100px]">Saldo</TableHead>
                <TableHead className="min-w-[110px]">N. Commessa</TableHead>
                <TableHead className="min-w-[110px]">Mese</TableHead>
                <TableHead className="min-w-[110px]">Operatore</TableHead>
                <TableHead className="text-center min-w-[80px]">Docs</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const saldoPositivo = c.saldo > 0.005
                const saldoZero = !saldoPositivo && c.saldo >= -0.005
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <p className="font-medium text-sm">{c.cliente_nome}</p>
                      {c.note && (
                        <p className="text-xs text-gray-400 truncate max-w-[130px]">{c.note}</p>
                      )}
                    </TableCell>

                    <TableCell className="font-mono text-xs text-gray-500">
                      {c.numero_preventivo || '—'}
                    </TableCell>

                    <TableCell className="text-right text-sm">
                      {formatEuro(c.imponibile)}
                    </TableCell>

                    <TableCell className="text-right text-sm text-gray-500">
                      {formatEuro(c.iva_totale)}
                    </TableCell>

                    {/* Acconti */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-sm">
                          {c.totale_acconti > 0 ? formatEuro(c.totale_acconti) : '—'}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-6 w-6"
                          title="Gestisci acconti"
                          onClick={() => setDialogAcconto(c)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>

                    {/* Saldo */}
                    <TableCell className="text-right">
                      <Badge
                        className={
                          saldoZero
                            ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100'
                            : saldoPositivo
                            ? 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100'
                            : 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100'
                        }
                      >
                        {formatEuro(c.saldo)}
                      </Badge>
                    </TableCell>

                    <TableCell className="font-mono text-sm">
                      {c.numero_commessa || <span className="text-gray-300">—</span>}
                    </TableCell>

                    <TableCell className="text-sm text-gray-600 whitespace-nowrap">
                      {formatMese(c.data_conferma)}
                    </TableCell>

                    <TableCell className="text-sm text-gray-600">
                      {c.operatore_nome || <span className="text-gray-300">—</span>}
                    </TableCell>

                    {/* Documenti */}
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 relative"
                        title="Documenti allegati"
                        onClick={() => setDialogDocumenti(c)}
                      >
                        <Paperclip className="h-4 w-4 text-gray-400" />
                        {c.documenti.length > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-teal-600 text-white text-[10px] flex items-center justify-center">
                            {c.documenti.length}
                          </span>
                        )}
                      </Button>
                    </TableCell>

                    {/* Azioni */}
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Modifica"
                          onClick={() => openEdit(c)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-400 hover:text-red-600"
                          title="Elimina"
                          onClick={() => setDeletingId(c.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog commessa */}
      <DialogCommessa
        open={dialogCommessa}
        onOpenChange={(v) => { setDialogCommessa(v); if (!v) setEditingCommessa(null) }}
        commessa={editingCommessa}
        preventivi={preventivi}
        utenti={utenti}
        preventivoDaConvertire={!editingCommessa ? preventivoDaConvertire : null}
      />

      {/* Dialog acconti */}
      {dialogAcconto && (
        <DialogAcconto
          open={!!dialogAcconto}
          onOpenChange={(v) => { if (!v) setDialogAcconto(null) }}
          commessaId={dialogAcconto.id}
          clienteNome={dialogAcconto.cliente_nome}
          acconti={dialogAcconto.acconti}
        />
      )}

      {/* Dialog documenti */}
      {dialogDocumenti && (
        <DialogDocumenti
          open={!!dialogDocumenti}
          onOpenChange={(v) => { if (!v) setDialogDocumenti(null) }}
          commessaId={dialogDocumenti.id}
          clienteNome={dialogDocumenti.cliente_nome}
          documenti={dialogDocumenti.documenti}
        />
      )}

      {/* Confirm delete */}
      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina commessa</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è irreversibile. La commessa, tutti gli acconti e i documenti allegati verranno eliminati definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Eliminazione...' : 'Elimina'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
