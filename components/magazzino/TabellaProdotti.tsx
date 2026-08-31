'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, RefreshCw, Loader2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import DialogProdotto from './DialogProdotto'
import { useSyncQueue } from './useSyncQueue'
import { deleteProdotto, getPrezzoLive, warmupESPBackend } from '@/actions/magazzino'
import type { ArticoloCatalogo, PrezzoLive } from '@/types/catalogo-esp'
import type { CategoriaMagazzino, Fornitore, PosizioneMagazzino, CatalogoArticolo } from '@/types/magazzino'
import { REPARTI } from '@/types/catalogo-esp'

type ArticoloConUrl = ArticoloCatalogo & {
  preview_url: string | null
  prezzo_cache: PrezzoLive | null
}

// ── Cella disponibilità + quantità ──────────────────────────────────────────
function CellDisp({ disponibile, qty }: { disponibile: boolean; qty: number }) {
  return (
    <div className="flex items-center gap-1">
      <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${disponibile ? 'bg-green-500' : 'bg-red-400'}`} />
      <span className={`text-xs font-semibold tabular-nums ${disponibile ? 'text-green-700' : 'text-red-500'}`}>
        {qty > 0 ? qty.toLocaleString('it-IT') : '0'}
      </span>
    </div>
  )
}

// ── Cella sincronizzazione prezzo ────────────────────────────────────────────
function CellSync({
  codice,
  reparto,
  prezzoIniziale,
  livePrezzo,
  isSyncLocked,
  onSyncStart,
  onSyncDone,
}: {
  codice: string
  reparto?: number | null
  prezzoIniziale: PrezzoLive | null
  livePrezzo?: number
  isSyncLocked: boolean
  onSyncStart: (codice: string) => void
  onSyncDone: (p: PrezzoLive | null) => void
}) {
  const [prezzo, setPrezzo] = useState<PrezzoLive | null>(prezzoIniziale)
  const [isLoading, setIsLoading] = useState(false)

  // Prezzo aggiornato dalla coda (Realtime) durante un bulk sync
  const prezzoDisplay = livePrezzo != null ? livePrezzo : prezzo?.prezzo ?? null

  async function sincronizza(e: React.MouseEvent) {
    e.stopPropagation()
    if (isSyncLocked) return
    setIsLoading(true)
    onSyncStart(codice)
    try {
      const p = await getPrezzoLive(codice, reparto)
      if (p) {
        setPrezzo(p)
        if (p.da_cache) {
          toast.warning(`${codice}: dati in cache, prezzo non aggiornato`)
        } else if (p.prezzo == null) {
          toast.warning(`${codice}: trovato sul CRM ma prezzo non disponibile (richiede finitura/configurazione)`)
        } else {
          toast.success(`${codice}: € ${p.prezzo.toFixed(2)} sincronizzato`)
        }
      } else {
        toast.error(`${codice}: articolo non trovato sul CRM`)
      }
      onSyncDone(p)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore'
      if (msg === 'timeout') {
        toast.error(`${codice}: timeout — il backend CRM è in avvio (cold start), riprova tra 30 secondi`)
      } else {
        toast.error(`Errore: ${msg}`)
      }
      onSyncDone(null)
    } finally {
      setIsLoading(false)
    }
  }

  const isDisabled = isSyncLocked && !isLoading

  const btn = (
    <button
      onClick={sincronizza}
      disabled={isDisabled || isLoading}
      className="text-muted-foreground hover:text-blue-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      title={isDisabled ? 'Sincronizzazione in corso su un altro articolo' : 'Sincronizza da Edilsider CRM'}
    >
      {isLoading
        ? <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
        : <RefreshCw className="h-3.5 w-3.5" />
      }
    </button>
  )

  if (prezzoDisplay == null && !prezzo) {
    return <div className="flex items-center gap-1 text-muted-foreground">—{btn}</div>
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs font-semibold text-gray-900 tabular-nums">
        {prezzoDisplay != null ? `€ ${Number(prezzoDisplay).toFixed(2)}` : '—'}
      </span>
      {btn}
    </div>
  )
}

const PAGE_SIZE = 50

const REPARTO_COLORS: Record<number, string> = {
  1: 'bg-blue-100 text-blue-700',
  2: 'bg-slate-100 text-slate-700',
  3: 'bg-purple-100 text-purple-700',
  4: 'bg-orange-100 text-orange-700',
  5: 'bg-cyan-100 text-cyan-700',
  6: 'bg-green-100 text-green-700',
}

interface Props {
  prodotti: ArticoloConUrl[]
  totale: number
  pagina: number
  categorie: CategoriaMagazzino[]
  fornitori: Fornitore[]
  posizioni: PosizioneMagazzino[]
  orgId: string
}

export default function TabellaProdotti({ prodotti, totale, pagina, categorie, fornitori, posizioni, orgId }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  // Stato locale prezzi — aggiornato dal sync, inizializzato dalla cache server
  const [prezziMap, setPrezziMap] = useState<Record<string, PrezzoLive>>(() =>
    Object.fromEntries(prodotti.filter((p) => p.prezzo_cache).map((p) => [p.codice, p.prezzo_cache!]))
  )

  // Scalda il backend ESP al mount della pagina (fire & forget)
  useEffect(() => { warmupESPBackend() }, [])

  // Lock globale: un solo sync alla volta; isPending=true durante router.refresh()
  const [syncingCodice, setSyncingCodice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Coda di sincronizzazione persistente (Supabase + Realtime, cross-utente)
  const { queueStatus, livePrezzi, total, completed, active, amIOwner, enqueue, cancel, forceReset } =
    useSyncQueue(orgId, () => startTransition(() => { router.refresh() }))

  // Selezione multipla — illimitata, processata a batch di 10 dal processore
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set())

  const isBulkRunning = active
  const isSyncLocked  = syncingCodice !== null || isPending || isBulkRunning

  function toggleSelect(codice: string) {
    setSelectedSet(prev => {
      const next = new Set(prev)
      if (next.has(codice)) next.delete(codice)
      else next.add(codice)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedSet(prev =>
      prev.size === prodotti.length ? new Set() : new Set(prodotti.map(p => p.codice))
    )
  }

  function sincronizzaSelezionati() {
    const items = Array.from(selectedSet).map(codice => ({
      codice,
      reparto: prodotti.find(p => p.codice === codice)?.reparto ?? null,
    }))
    setSelectedSet(new Set())
    enqueue(items)
    toast.info(`${items.length} articoli in coda — sincronizzazione avviata`)
  }

  function handleSyncStart(codice: string) {
    setSyncingCodice(codice)
  }

  function handleSyncDone(p: PrezzoLive | null) {
    if (p && !p.da_cache) {
      setPrezziMap((prev) => ({ ...prev, [p.codice]: p }))
    }
    setSyncingCodice(null)
    startTransition(() => { router.refresh() })
  }

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CatalogoArticolo | null>(null)
  const [deleting, setDeleting] = useState<ArticoloConUrl | null>(null)
  const [deletingLoading, setDeletingLoading] = useState(false)

  const totalePagine = Math.ceil(totale / PAGE_SIZE)

  function navPagina(p: number) {
    const np = new URLSearchParams(params.toString())
    np.set('pagina', String(p))
    router.push(`${pathname}?${np.toString()}`)
  }

  const openCreate = () => { setEditing(null); setDialogOpen(true) }
  const openEdit = (p: ArticoloConUrl) => { setEditing(p as CatalogoArticolo); setDialogOpen(true) }

  const handleDelete = async () => {
    if (!deleting) return
    setDeletingLoading(true)
    try {
      await deleteProdotto(deleting.id, deleting.foto_url, deleting.dxf_url)
      toast.success('Articolo eliminato')
      router.refresh()
    } catch {
      toast.error('Errore durante l\'eliminazione')
    } finally {
      setDeletingLoading(false)
      setDeleting(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Banner sync in corso */}
      {isSyncLocked && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-50 border border-blue-200 text-blue-700 text-sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          <span className="flex-1">
            {isBulkRunning
              ? `Sincronizzazione in corso: ${completed}/${total} completati…`
              : isPending
                ? 'Aggiornamento dati in corso…'
                : `Sincronizzazione ${syncingCodice} in corso…`}
          </span>
          {isBulkRunning && (amIOwner ? (
            <button
              onClick={cancel}
              className="text-xs font-medium text-blue-500 hover:text-red-600 transition-colors underline"
            >
              Annulla
            </button>
          ) : (
            <button
              onClick={forceReset}
              className="text-xs text-blue-400 hover:text-red-600 transition-colors underline"
              title="Forza l'annullamento se la scansione sembra bloccata"
            >
              Forza annullamento
            </button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {totale.toLocaleString('it-IT')} articoli trovati
        </span>
        <div className="flex items-center gap-3">
          {totalePagine > 1 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" disabled={pagina <= 1} onClick={() => navPagina(pagina - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">Pag. {pagina} / {totalePagine}</span>
              <Button variant="outline" size="icon" disabled={pagina >= totalePagine} onClick={() => navPagina(pagina + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Nuovo articolo
          </Button>
        </div>
      </div>

      {/* Tabella — scroll orizzontale se necessario */}
      <div className="border rounded-lg overflow-x-auto">
        <Table className="w-full text-xs">
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="w-9 py-2 pl-3">
                <Checkbox
                  checked={selectedSet.size > 0 && selectedSet.size === prodotti.length}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Seleziona tutti"
                />
              </TableHead>
              <TableHead className="w-12 py-2">Foto</TableHead>
              <TableHead className="w-28 py-2">Codice</TableHead>
              <TableHead className="py-2 min-w-[280px]">Descrizione</TableHead>
              <TableHead className="w-28 py-2">Reparto</TableHead>
              <TableHead className="w-12 py-2 text-center">U.M.</TableHead>
              <TableHead className="w-28 py-2">Prezzo</TableHead>
              <TableHead className="w-16 py-2 text-center">
                <span className="text-green-700 font-semibold">AL</span>
                <span className="text-muted-foreground font-normal"> Alcamo</span>
              </TableHead>
              <TableHead className="w-16 py-2 text-center">
                <span className="text-blue-700 font-semibold">CT</span>
                <span className="text-muted-foreground font-normal"> Catania</span>
              </TableHead>
              <TableHead className="w-14 py-2" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {prodotti.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-12">
                  Nessun articolo trovato
                </TableCell>
              </TableRow>
            )}
            {prodotti.map((p) => {
              const cache  = prezziMap[p.codice] ?? null
              const qStatus = queueStatus[p.codice]
              const inCoda  = qStatus === 'pending' || qStatus === 'processing'
              return (
                <TableRow
                  key={p.id}
                  className={`hover:bg-gray-50/50 ${selectedSet.has(p.codice) ? 'bg-blue-50/60' : ''}`}
                >
                  {/* Checkbox selezione / stato coda */}
                  <TableCell className="py-1 pl-3 pr-1" onClick={(e) => e.stopPropagation()}>
                    {qStatus === 'processing'
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                      : qStatus === 'pending'
                        ? <span className="block h-2 w-2 rounded-full bg-amber-400 mx-auto" title="In coda" />
                        : <Checkbox
                            checked={selectedSet.has(p.codice)}
                            onCheckedChange={() => toggleSelect(p.codice)}
                            disabled={inCoda}
                            aria-label={`Seleziona ${p.codice}`}
                          />
                    }
                  </TableCell>

                  {/* Foto — ora seconda colonna */}
                  <TableCell className="py-1 px-2">
                    {p.preview_url ? (

                      <img
                        src={p.preview_url}
                        alt={p.codice}
                        className="h-8 w-8 object-contain rounded border bg-gray-50"
                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                      />
                    ) : (
                      <div className="h-8 w-8 rounded border bg-gray-50" />
                    )}
                  </TableCell>

                  {/* Codice */}
                  <TableCell className="py-1.5 font-mono text-[11px] text-gray-600">
                    {p.codice}
                  </TableCell>

                  {/* Descrizione — testo completo, va a capo */}
                  <TableCell className="py-1.5 min-w-[280px]">
                    <p className="text-gray-900 font-medium whitespace-normal break-words leading-snug">{p.descrizione}</p>
                    {p.gruppo && (
                      <p className="text-[10px] text-muted-foreground">{p.gruppo}</p>
                    )}
                  </TableCell>

                  {/* Reparto */}
                  <TableCell className="py-1.5">
                    {p.reparto != null ? (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${REPARTO_COLORS[p.reparto] ?? 'bg-gray-100 text-gray-700'}`}>
                        {REPARTI[p.reparto] ?? `Rep.${p.reparto}`}
                      </span>
                    ) : '—'}
                  </TableCell>

                  {/* U.M. */}
                  <TableCell className="py-1.5 text-center text-muted-foreground text-[11px]">
                    {p.um || '—'}
                  </TableCell>

                  {/* Prezzo + sync */}
                  <TableCell className="py-1.5">
                    <CellSync
                      codice={p.codice}
                      reparto={p.reparto}
                      prezzoIniziale={cache}
                      livePrezzo={livePrezzi[p.codice]}
                      isSyncLocked={isSyncLocked}
                      onSyncStart={handleSyncStart}
                      onSyncDone={handleSyncDone}
                    />
                  </TableCell>

                  {/* AL — Alcamo */}
                  <TableCell className="py-1.5">
                    {cache
                      ? <CellDisp disponibile={cache.disponibile_al} qty={cache.qty_al} />
                      : <span className="text-muted-foreground">—</span>
                    }
                  </TableCell>

                  {/* CT — Catania */}
                  <TableCell className="py-1.5">
                    {cache
                      ? <CellDisp disponibile={cache.disponibile_ct} qty={cache.qty_ct} />
                      : <span className="text-muted-foreground">—</span>
                    }
                  </TableCell>

                  {/* Azioni */}
                  <TableCell className="py-1.5 px-2">
                    <div className="flex gap-0.5 justify-end">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(p)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-red-400 hover:text-red-600"
                        onClick={() => setDeleting(p)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Paginazione bottom */}
      {totalePagine > 1 && (
        <div className="flex justify-center gap-2 pt-1">
          <Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => navPagina(pagina - 1)}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Precedente
          </Button>
          <span className="flex items-center text-sm text-muted-foreground px-2">
            {pagina} / {totalePagine}
          </span>
          <Button variant="outline" size="sm" disabled={pagina >= totalePagine} onClick={() => navPagina(pagina + 1)}>
            Successiva <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      <DialogProdotto
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        prodotto={editing as never}
        categorie={categorie}
        fornitori={fornitori}
        posizioni={posizioni}
      />

      {/* Barra fluttuante selezione multipla */}
      {(selectedSet.size > 0 || isBulkRunning) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white border shadow-xl rounded-full px-5 py-3">
          {isBulkRunning ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <span className="text-sm font-medium">
                Sincronizzazione: {completed}/{total} completati…
              </span>
              <span className="text-xs text-muted-foreground">(a gruppi di 10)</span>
              {amIOwner ? (
                <button
                  onClick={cancel}
                  className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors ml-1"
                >
                  Annulla
                </button>
              ) : (
                <button
                  onClick={forceReset}
                  className="text-xs text-muted-foreground hover:text-red-600 transition-colors ml-1"
                  title="Forza l'annullamento se la scansione sembra bloccata"
                >
                  Forza annullamento
                </button>
              )}
            </>
          ) : (
            <>
              <span className="text-sm font-medium text-gray-700">
                {selectedSet.size} selezionat{selectedSet.size === 1 ? 'o' : 'i'}
              </span>
              <Button size="sm" onClick={sincronizzaSelezionati} className="rounded-full gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Sincronizza
              </Button>
              <button
                onClick={() => setSelectedSet(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Annulla
              </button>
            </>
          )}
        </div>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina articolo</AlertDialogTitle>
            <AlertDialogDescription>
              Elimini <strong>{deleting?.descrizione ?? deleting?.codice}</strong>?
              Questa operazione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
              disabled={deletingLoading}
            >
              {deletingLoading ? 'Eliminazione...' : 'Elimina'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
