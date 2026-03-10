'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus, Search, Trash2, Eye, Clock, Printer, BarChart2 } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { deletePreventivo } from '@/actions/preventivi'
import { formatEuro } from '@/lib/pricing'
import { db } from '@/lib/db'
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
import type { Preventivo, StatoPreventivo } from '@/types/preventivo'

const STATO_CONFIG: Record<
  StatoPreventivo,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  bozza:     { label: 'Bozza',     variant: 'secondary' },
  inviato:   { label: 'Inviato',   variant: 'default' },
  accettato: { label: 'Accettato', variant: 'default' },
  rifiutato: { label: 'Rifiutato', variant: 'destructive' },
  scaduto:   { label: 'Scaduto',   variant: 'outline' },
}

function nomeCliente(p: Preventivo): string {
  const s = p.cliente_snapshot
  const nome = [s.cognome, s.nome].filter(Boolean).join(' ')
  return nome || s.telefono || s.email || '—'
}

interface Props {
  preventivi: Preventivo[]
}

export default function TabellaPreventivi({ preventivi }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const pendingPreventivi = useLiveQuery(() => db.pendingPreventivi.toArray(), []) ?? []

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return preventivi
    return preventivi.filter((p) => {
      const s = p.cliente_snapshot
      return [s.nome, s.cognome, s.telefono, s.email, p.numero].some((f) =>
        f?.toLowerCase().includes(q)
      )
    })
  }, [preventivi, search])

  const handleDelete = async () => {
    if (!deletingId) return
    setDeleting(true)
    try {
      await deletePreventivo(deletingId)
      toast.success('Preventivo eliminato')
      router.refresh()
    } catch {
      toast.error('Errore durante l\'eliminazione')
    } finally {
      setDeleting(false)
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Cerca cliente o numero..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button asChild>
          <Link href="/preventivi/nuovo">
            <Plus className="h-4 w-4 mr-1" />
            Nuovo preventivo
          </Link>
        </Button>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && pendingPreventivi.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          {preventivi.length === 0 ? (
            <>
              <p className="text-lg font-medium mb-2">Nessun preventivo</p>
              <p className="text-sm mb-4">Crea il primo preventivo per iniziare.</p>
              <Button asChild>
                <Link href="/preventivi/nuovo">
                  <Plus className="h-4 w-4 mr-1" />
                  Nuovo preventivo
                </Link>
              </Button>
            </>
          ) : (
            <p className="text-sm">Nessun risultato per &quot;{search}&quot;</p>
          )}
        </div>
      )}

      {/* Table */}
      {(filtered.length > 0 || pendingPreventivi.length > 0) && (
        <div className="rounded-md border bg-white overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Numero</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-center">Pezzi</TableHead>
                <TableHead className="text-right">Totale</TableHead>
                <TableHead className="text-center">Stato</TableHead>
                <TableHead className="text-right text-xs text-gray-400">Data</TableHead>
                <TableHead className="w-36" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Preventivi in attesa di sync (offline) */}
              {pendingPreventivi.map((p) => {
                const s = p.input.clienteSnapshot
                const nome = [s.cognome, s.nome].filter(Boolean).join(' ') || s.telefono || s.email || '—'
                const totPezzi = p.input.articoli.reduce((sum, a) => sum + a.quantita, 0)
                return (
                  <TableRow key={`pending-${p.tempId}`} className="bg-amber-50">
                    <TableCell className="font-mono text-sm text-gray-500">
                      {p.input.numero || '—'}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{nome}</p>
                        {s.cantiere && (
                          <p className="text-xs text-gray-400">{s.cantiere}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-sm text-gray-600">
                      {totPezzi}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm text-gray-400">
                      —
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className="text-xs bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-100">
                        <Clock className="h-3 w-3 mr-1" />
                        In attesa di sync
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-gray-400 whitespace-nowrap">
                      {new Date(p.createdAt).toLocaleDateString('it-IT')}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                )
              })}
              {filtered.map((p) => {
                const cfg = STATO_CONFIG[p.stato]
                return (
                  <TableRow key={p.id} className="group">
                    <TableCell className="font-mono text-sm text-gray-500">
                      {p.numero ?? '—'}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{nomeCliente(p)}</p>
                        {p.cliente_snapshot.cantiere && (
                          <p className="text-xs text-gray-400">{p.cliente_snapshot.cantiere}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-sm text-gray-600">
                      {p.totale_pezzi}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm">
                      € {formatEuro(p.totale_finale)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={cfg.variant} className="text-xs">
                        {cfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-gray-400 whitespace-nowrap">
                      {new Date(p.created_at).toLocaleDateString('it-IT')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="Apri">
                          <Link href={`/preventivi/${p.id}`}>
                            <Eye className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="Stampa preventivo">
                          <Link href={`/preventivi/${p.id}/stampa`}>
                            <Printer className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600 hover:text-amber-800" asChild title="Stampa calcoli">
                          <Link href={`/preventivi/${p.id}/stampa-calcoli`}>
                            <BarChart2 className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-400 hover:text-red-600"
                          onClick={() => setDeletingId(p.id)}
                          title="Elimina"
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

      {/* Confirm delete dialog */}
      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina preventivo</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è irreversibile. Il preventivo e tutti i suoi articoli verranno eliminati definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Eliminazione...' : 'Elimina'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
