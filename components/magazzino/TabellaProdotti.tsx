'use client'

import { useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, RefreshCw, Loader2 } from 'lucide-react'
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
import { deleteProdotto, getPrezzoLive } from '@/actions/magazzino'
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
  onSync,
}: {
  codice: string
  reparto?: number | null
  prezzoIniziale: PrezzoLive | null
  onSync: (p: PrezzoLive) => void
}) {
  const [stato, setStato] = useState<'idle' | 'loading'>('idle')
  const [prezzo, setPrezzo] = useState<PrezzoLive | null>(prezzoIniziale)

  async function sincronizza(e: React.MouseEvent) {
    e.stopPropagation()
    if (stato === 'loading') return
    setStato('loading')
    try {
      const p = await getPrezzoLive(codice, reparto)
      if (p) {
        setPrezzo(p)
        onSync(p)
        if (p.da_cache) {
          toast.warning(`${codice}: non aggiornato sul CRM, dati in cache`)
        } else {
          toast.success(`${codice} sincronizzato`)
        }
      } else {
        toast.error(`${codice}: articolo non trovato sul CRM`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore'
      if (msg.includes('in corso')) {
        toast.warning('Altra sincronizzazione in corso, riprova tra qualche secondo')
      } else {
        toast.error(`Errore: ${msg}`)
      }
    } finally {
      setStato('idle')
    }
  }

  const btn = (
    <button
      onClick={sincronizza}
      disabled={stato === 'loading'}
      className="text-muted-foreground hover:text-blue-600 transition-colors disabled:opacity-50"
      title="Sincronizza da Edilsider CRM"
    >
      {stato === 'loading'
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : <RefreshCw className="h-3.5 w-3.5" />
      }
    </button>
  )

  if (!prezzo) {
    return <div className="flex items-center gap-1 text-muted-foreground">—{btn}</div>
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs font-semibold text-gray-900 tabular-nums">
        {prezzo.prezzo != null ? `€ ${Number(prezzo.prezzo).toFixed(2)}` : '—'}
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
}

export default function TabellaProdotti({ prodotti, totale, pagina, categorie, fornitori, posizioni }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  // Stato locale prezzi — aggiornato dal sync, inizializzato dalla cache server
  const [prezziMap, setPrezziMap] = useState<Record<string, PrezzoLive>>(() =>
    Object.fromEntries(prodotti.filter((p) => p.prezzo_cache).map((p) => [p.codice, p.prezzo_cache!]))
  )

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
        <Table className="min-w-[900px] text-xs">
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="w-9 py-2" />
              <TableHead className="w-28 py-2">Codice</TableHead>
              <TableHead className="py-2">Descrizione</TableHead>
              <TableHead className="w-24 py-2">Reparto</TableHead>
              <TableHead className="w-10 py-2 text-center">U.M.</TableHead>
              <TableHead className="w-28 py-2">Prezzo</TableHead>
              <TableHead className="w-20 py-2 text-center">
                <span className="text-green-700 font-semibold">AL</span>
                <span className="text-muted-foreground font-normal"> Alcamo</span>
              </TableHead>
              <TableHead className="w-20 py-2 text-center">
                <span className="text-blue-700 font-semibold">CT</span>
                <span className="text-muted-foreground font-normal"> Catania</span>
              </TableHead>
              <TableHead className="w-14 py-2" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {prodotti.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                  Nessun articolo trovato
                </TableCell>
              </TableRow>
            )}
            {prodotti.map((p) => {
              const cache = prezziMap[p.codice] ?? null
              return (
                <TableRow key={p.id} className="hover:bg-gray-50/50">
                  {/* Foto */}
                  <TableCell className="py-1 px-2">
                    {p.preview_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
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

                  {/* Descrizione */}
                  <TableCell className="py-1.5 max-w-0">
                    <p className="truncate text-gray-900 font-medium" title={p.descrizione}>{p.descrizione}</p>
                    {p.gruppo && (
                      <p className="truncate text-[10px] text-muted-foreground">{p.gruppo}</p>
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
                      onSync={(aggiornato) => setPrezziMap((prev) => ({ ...prev, [p.codice]: aggiornato }))}
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
