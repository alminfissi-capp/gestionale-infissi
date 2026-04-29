'use client'

import { useState, useMemo, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus, Search, Trash2, Eye, Clock, Printer, BarChart2, CheckCircle2, Copy, ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { deletePreventivo, duplicaPreventivo, aggiornaStatoPreventivo } from '@/actions/preventivi'
import { usePermissions } from '@/contexts/PermissionsContext'
import { formatEuro } from '@/lib/pricing'
import { db } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; className: string }
> = {
  bozza:     { label: 'Bozza',     variant: 'secondary',    className: 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200' },
  inviato:   { label: 'Inviato',   variant: 'default',      className: 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200' },
  accettato: { label: 'Accettato', variant: 'default',      className: 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200' },
  rifiutato: { label: 'Rifiutato', variant: 'destructive',  className: 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200' },
  scaduto:   { label: 'Scaduto',   variant: 'outline',      className: 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100' },
}

const TUTTI_STATI = Object.entries(STATO_CONFIG) as [StatoPreventivo, typeof STATO_CONFIG[StatoPreventivo]][]

function nomeCliente(p: Preventivo): string {
  const s = p.cliente_snapshot
  if (s.tipo === 'azienda') return s.ragione_sociale || s.email || s.telefono || '—'
  const nome = [s.cognome, s.nome].filter(Boolean).join(' ')
  return nome || s.email || s.telefono || '—'
}

interface Props {
  preventivi: Preventivo[]
}

export default function TabellaPreventivi({ preventivi }: Props) {
  const router = useRouter()
  const { canEdit } = usePermissions()
  const editEnabled = canEdit('preventivi')
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [isDuplicating, startDuplicate] = useTransition()
  const [updatingStatoId, setUpdatingStatoId] = useState<string | null>(null)

  const handleCambiaStato = (id: string, stato: StatoPreventivo) => {
    setUpdatingStatoId(id)
    aggiornaStatoPreventivo(id, stato)
      .then(() => router.refresh())
      .catch(() => toast.error('Errore aggiornamento stato'))
      .finally(() => setUpdatingStatoId(null))
  }

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const pendingPreventiviRaw = useLiveQuery(() => db.pendingPreventivi.toArray(), []) ?? []
  const bozzeWizardRaw = useLiveQuery(() => db.bozzeWizard.toArray(), []) ?? []
  const pendingPreventivi = mounted ? pendingPreventiviRaw : []
  const bozzeWizard = mounted ? bozzeWizardRaw : []

  const handleScartaBozza = async (id: string) => {
    await db.bozzeWizard.delete(id)
    toast.success('Bozza scartata')
  }

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

  const handleDuplica = (id: string) => {
    setDuplicatingId(id)
    startDuplicate(async () => {
      try {
        const { id: newId } = await duplicaPreventivo(id)
        toast.success('Preventivo duplicato')
        router.push(`/preventivi/${newId}`)
      } catch {
        toast.error('Errore durante la duplicazione')
      } finally {
        setDuplicatingId(null)
      }
    })
  }

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
        <Button variant="outline" asChild>
          <Link href="/preventivi/scorrevoli">
            <SlidersHorizontal className="h-4 w-4 mr-1" />
            Scorrevoli
          </Link>
        </Button>
        {editEnabled && (
          <Button asChild>
            <Link href="/preventivi/nuovo">
              <Plus className="h-4 w-4 mr-1" />
              Nuovo preventivo
            </Link>
          </Button>
        )}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && pendingPreventivi.length === 0 && bozzeWizard.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          {preventivi.length === 0 ? (
            <>
              <p className="text-lg font-medium mb-2">Nessun preventivo</p>
              {editEnabled && (
                <>
                  <p className="text-sm mb-4">Crea il primo preventivo per iniziare.</p>
                  <Button asChild>
                    <Link href="/preventivi/nuovo">
                      <Plus className="h-4 w-4 mr-1" />
                      Nuovo preventivo
                    </Link>
                  </Button>
                </>
              )}
            </>
          ) : (
            <p className="text-sm">Nessun risultato per &quot;{search}&quot;</p>
          )}
        </div>
      )}

      {/* Table */}
      {(filtered.length > 0 || pendingPreventivi.length > 0 || bozzeWizard.length > 0) && (
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
              {/* Bozze salvate localmente (non ancora create) */}
              {bozzeWizard.map((bozza) => {
                const s = bozza.snapshot
                const nome = s.tipo === 'azienda'
                  ? s.ragione_sociale || s.email || s.telefono || '—'
                  : [s.cognome, s.nome].filter(Boolean).join(' ') || s.email || s.telefono || '—'
                const nPezzi = bozza.articoli.reduce((sum, a) => sum + a.quantita, 0)
                return (
                  <TableRow key={`bozza-${bozza.id}`} className="bg-yellow-50 hover:bg-yellow-100 cursor-pointer" onClick={() => router.push('/preventivi/nuovo')}>
                    <TableCell className="font-mono text-sm text-gray-400">—</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{nome || 'Preventivo in lavorazione'}</p>
                        {s.cantiere && (
                          <p className="text-xs text-gray-400">{s.cantiere}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-sm text-gray-600">
                      {nPezzi > 0 ? nPezzi : '—'}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm text-gray-400">—</TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border bg-yellow-100 text-yellow-700 border-yellow-300">
                        <RotateCcw className="h-3 w-3" />
                        Bozza locale
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-xs text-gray-400 whitespace-nowrap">
                      {new Date(bozza.updatedAt).toLocaleDateString('it-IT')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="Continua bozza">
                          <Link href="/preventivi/nuovo">
                            <Eye className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-400 hover:text-red-600"
                          onClick={() => handleScartaBozza(bozza.id)}
                          title="Scarta bozza"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
              {/* Preventivi in attesa di sync (offline) */}
              {pendingPreventivi.map((p) => {
                const s = p.input.clienteSnapshot
                const nome = s.tipo === 'azienda'
                  ? s.ragione_sociale || s.email || s.telefono || '—'
                  : [s.cognome, s.nome].filter(Boolean).join(' ') || s.email || s.telefono || '—'
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
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-sm">{nomeCliente(p)}</p>
                          {p.visualizzato_at && (
                            <span title={`Visionato il ${new Date(p.visualizzato_at).toLocaleDateString('it-IT')}`}>
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                            </span>
                          )}
                        </div>
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border cursor-pointer transition-colors ${cfg.className}`}
                            disabled={updatingStatoId === p.id}
                          >
                            {cfg.label}
                            <ChevronDown className="h-2.5 w-2.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center">
                          {TUTTI_STATI.map(([stato, scfg]) => (
                            <DropdownMenuItem
                              key={stato}
                              onClick={() => handleCambiaStato(p.id, stato)}
                              className={stato === p.stato ? 'font-semibold' : ''}
                            >
                              <span className={`w-2 h-2 rounded-full mr-2 ${
                                stato === 'accettato' ? 'bg-green-500' :
                                stato === 'rifiutato' ? 'bg-red-500' :
                                stato === 'bozza' ? 'bg-gray-400' :
                                stato === 'inviato' ? 'bg-blue-500' : 'bg-orange-400'
                              }`} />
                              {scfg.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    <TableCell className="text-right text-xs text-gray-400 whitespace-nowrap">
                      {new Date(p.created_at).toLocaleDateString('it-IT')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
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
                          className="h-8 w-8 text-gray-400 hover:text-teal-600"
                          onClick={() => handleDuplica(p.id)}
                          disabled={isDuplicating && duplicatingId === p.id}
                          title="Duplica preventivo"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        {editEnabled && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-400 hover:text-red-600"
                            onClick={() => setDeletingId(p.id)}
                            title="Elimina"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
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
