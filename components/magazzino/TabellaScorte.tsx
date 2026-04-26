'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Search, Filter, ChevronRight, ChevronDown, Loader2,
  AlertTriangle, CheckCircle2, XCircle,
  ArrowDownToLine, ArrowUpFromLine, Pencil, Trash2, Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import DialogMovimento from './DialogMovimento'
import DialogProdotto from './DialogProdotto'
import PreviewMiniatura from './PreviewMiniatura'
import { deleteProdotto } from '@/actions/magazzino'
import { getGiacenzaDettaglioProdotto } from '@/actions/magazzino'
import type { GiacenzaConSoglia, GiacenzaBreakdownRow, ProdottoConCategoria } from '@/actions/magazzino'
import type { CategoriaMagazzino, Fornitore, PosizioneMagazzino, UnitaMisura } from '@/types/magazzino'
import { UNITA_MISURA_LABELS, TIPO_CATEGORIA_LABELS } from '@/types/magazzino'
import { cn } from '@/lib/utils'

type ProdottoConPreview = ProdottoConCategoria & {
  preview_url: string | null
  preview_tipo: 'foto' | 'dxf' | null
}

interface Props {
  prodotti: ProdottoConPreview[]
  giacenze: GiacenzaConSoglia[]
  categorie: CategoriaMagazzino[]
  fornitori: Fornitore[]
  posizioni: PosizioneMagazzino[]
}

type Stato = 'ok' | 'alert' | 'negativa'

type ProdottoConStock = ProdottoConPreview & {
  giacenza_totale: number
  finiture_nomi: string[]
}

function getStato(giacenza: number, soglia_minima: number | null, soglia_abilitata: boolean): Stato {
  if (giacenza < 0) return 'negativa'
  if (soglia_abilitata && soglia_minima !== null && giacenza < soglia_minima) return 'alert'
  return 'ok'
}

function fmtQty(n: number, udm: UnitaMisura) {
  return `${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${UNITA_MISURA_LABELS[udm]}`
}

export default function TabellaScorte({ prodotti, giacenze, categorie, fornitori, posizioni }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filterCategoria, setFilterCategoria] = useState('all')
  const [filterStato, setFilterStato] = useState<'all' | 'ok' | 'alert' | 'negativa'>('all')

  // Accordion
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [breakdown, setBreakdown] = useState<Record<string, GiacenzaBreakdownRow[]>>({})
  const [loadingBreakdown, setLoadingBreakdown] = useState<Set<string>>(new Set())

  // Dialog movimento
  const [movimentoOpen, setMovimentoOpen] = useState(false)
  const [movimentoProdottoId, setMovimentoProdottoId] = useState<string | undefined>()
  const [movimentoTipo, setMovimentoTipo] = useState<'entrata' | 'uscita'>('entrata')

  // Dialog prodotto (modifica)
  const [prodottoDialogOpen, setProdottoDialogOpen] = useState(false)
  const [editingProdotto, setEditingProdotto] = useState<ProdottoConCategoria | null>(null)

  // Dialog elimina
  const [deletingProdotto, setDeletingProdotto] = useState<ProdottoConPreview | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Merge giacenze into prodotti
  const items = useMemo<ProdottoConStock[]>(() => {
    const giacenzaMap = new Map<string, { totale: number; finiture_nomi: string[] }>()
    for (const g of giacenze) {
      const ex = giacenzaMap.get(g.prodotto_id)
      if (ex) {
        ex.totale += g.giacenza_attuale
      } else {
        giacenzaMap.set(g.prodotto_id, { totale: g.giacenza_attuale, finiture_nomi: g.finiture_nomi })
      }
    }
    return prodotti.map((p) => ({
      ...p,
      giacenza_totale: giacenzaMap.get(p.id)?.totale ?? 0,
      finiture_nomi: giacenzaMap.get(p.id)?.finiture_nomi ?? [],
    }))
  }, [prodotti, giacenze])

  const stats = useMemo(() => ({
    totale: items.length,
    alert: items.filter((p) => getStato(p.giacenza_totale, p.soglia_minima, p.soglia_abilitata) === 'alert').length,
    negative: items.filter((p) => getStato(p.giacenza_totale, p.soglia_minima, p.soglia_abilitata) === 'negativa').length,
  }), [items])

  const filtered = useMemo(() => {
    let list = items
    if (filterStato !== 'all') list = list.filter((p) => getStato(p.giacenza_totale, p.soglia_minima, p.soglia_abilitata) === filterStato)
    if (filterCategoria !== 'all') list = list.filter((p) => p.categoria_id === filterCategoria)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((p) =>
        [p.codice, p.nome, p.descrizione, ...p.finiture_nomi].some((f) => f?.toLowerCase().includes(q))
      )
    }
    return list
  }, [items, filterStato, filterCategoria, search])

  const openMovimento = (prodottoId: string, tipo: 'entrata' | 'uscita', e: React.MouseEvent) => {
    e.stopPropagation()
    setMovimentoProdottoId(prodottoId)
    setMovimentoTipo(tipo)
    setMovimentoOpen(true)
  }

  const openEdit = (p: ProdottoConPreview, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingProdotto(p)
    setProdottoDialogOpen(true)
  }

  const openDelete = (p: ProdottoConPreview, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeletingProdotto(p)
  }

  const handleDelete = async () => {
    if (!deletingProdotto) return
    setDeleting(true)
    try {
      await deleteProdotto(deletingProdotto.id, deletingProdotto.foto_url, deletingProdotto.dxf_url)
      toast.success('Prodotto eliminato')
      router.refresh()
    } catch {
      toast.error('Impossibile eliminare: il prodotto ha movimenti associati')
    } finally {
      setDeleting(false)
      setDeletingProdotto(null)
    }
  }

  const toggleExpand = async (prodottoId: string) => {
    const next = new Set(expanded)
    if (next.has(prodottoId)) {
      next.delete(prodottoId)
    } else {
      next.add(prodottoId)
      if (!breakdown[prodottoId]) {
        setLoadingBreakdown((prev) => new Set(prev).add(prodottoId))
        try {
          const rows = await getGiacenzaDettaglioProdotto(prodottoId)
          setBreakdown((prev) => ({ ...prev, [prodottoId]: rows }))
        } finally {
          setLoadingBreakdown((prev) => { const s = new Set(prev); s.delete(prodottoId); return s })
        }
      }
    }
    setExpanded(next)
  }

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-gray-500">Prodotti in anagrafica</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totale}</p>
        </div>
        <div
          className={cn('rounded-xl border p-4 cursor-pointer transition-colors', stats.alert > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white')}
          onClick={() => setFilterStato((s) => s === 'alert' ? 'all' : 'alert')}
        >
          <div className="flex items-center gap-1.5">
            <AlertTriangle className={cn('h-4 w-4', stats.alert > 0 ? 'text-amber-500' : 'text-gray-300')} />
            <p className="text-xs text-gray-500">Sotto scorta minima</p>
          </div>
          <p className={cn('text-2xl font-bold mt-1', stats.alert > 0 ? 'text-amber-600' : 'text-gray-400')}>{stats.alert}</p>
        </div>
        <div
          className={cn('rounded-xl border p-4 cursor-pointer transition-colors', stats.negative > 0 ? 'bg-red-50 border-red-200' : 'bg-white')}
          onClick={() => setFilterStato((s) => s === 'negativa' ? 'all' : 'negativa')}
        >
          <div className="flex items-center gap-1.5">
            <XCircle className={cn('h-4 w-4', stats.negative > 0 ? 'text-red-500' : 'text-gray-300')} />
            <p className="text-xs text-gray-500">Giacenza negativa</p>
          </div>
          <p className={cn('text-2xl font-bold mt-1', stats.negative > 0 ? 'text-red-600' : 'text-gray-400')}>{stats.negative}</p>
        </div>
      </div>

      {/* Filtri + nuovo prodotto */}
      <div className="flex flex-wrap gap-2 items-center p-3 rounded-lg bg-gray-50 border">
        <Filter className="h-4 w-4 text-gray-400 shrink-0" />
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            className="pl-8 h-8 text-sm w-52"
            placeholder="Codice, nome, finitura..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterCategoria} onValueChange={setFilterCategoria}>
          <SelectTrigger className="h-8 w-44 text-sm">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le categorie</SelectItem>
            {categorie.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome} <span className="text-gray-400">({TIPO_CATEGORIA_LABELS[c.tipo]})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStato} onValueChange={(v) => setFilterStato(v as typeof filterStato)}>
          <SelectTrigger className="h-8 w-40 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
            <SelectItem value="alert">Sotto scorta</SelectItem>
            <SelectItem value="negativa">Negativa</SelectItem>
          </SelectContent>
        </Select>
        {(filterStato !== 'all' || filterCategoria !== 'all' || search) && (
          <button
            className="text-xs text-gray-400 hover:text-gray-600"
            onClick={() => { setFilterStato('all'); setFilterCategoria('all'); setSearch('') }}
          >
            Azzera
          </button>
        )}
        <Button
          className="ml-auto gap-2 h-8 text-sm"
          onClick={(e) => { e.stopPropagation(); setEditingProdotto(null); setProdottoDialogOpen(true) }}
        >
          <Plus className="h-3.5 w-3.5" />
          Nuovo prodotto
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          {prodotti.length === 0 ? 'Nessun prodotto. Creane uno con il pulsante in alto.' : 'Nessun risultato.'}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead className="min-w-60">Prodotto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Giacenza</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="w-52" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const stato = getStato(p.giacenza_totale, p.soglia_minima, p.soglia_abilitata)
                const isExpanded = expanded.has(p.id)
                const isLoading = loadingBreakdown.has(p.id)
                const rows = breakdown[p.id] ?? []

                return (
                  <>
                    <TableRow
                      key={p.id}
                      className={cn(
                        'cursor-pointer select-none',
                        stato === 'negativa' && 'bg-red-50 hover:bg-red-100',
                        stato === 'alert' && 'bg-amber-50 hover:bg-amber-100',
                        stato === 'ok' && 'hover:bg-gray-50',
                      )}
                      onClick={() => toggleExpand(p.id)}
                    >
                      <TableCell className="text-gray-400 w-8">
                        {isLoading
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : isExpanded
                            ? <ChevronDown className="h-4 w-4" />
                            : <ChevronRight className="h-4 w-4" />
                        }
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <PreviewMiniatura url={p.preview_url} tipo={p.preview_tipo} size={36} />
                          <div>
                            <span className="font-bold text-sm text-gray-900 mr-1.5">{p.codice}</span>
                            <span className="text-sm text-gray-700">{p.nome}</span>
                            {p.descrizione && (
                              <p className="text-xs text-gray-400 truncate max-w-56">{p.descrizione}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-sm text-gray-500">
                        {p.categoria?.nome ?? '—'}
                      </TableCell>

                      <TableCell className="text-right">
                        <span className={cn(
                          'font-bold text-base',
                          stato === 'negativa' && 'text-red-600',
                          stato === 'alert' && 'text-amber-600',
                          stato === 'ok' && p.giacenza_totale > 0 && 'text-gray-900',
                          p.giacenza_totale === 0 && 'text-gray-400',
                        )}>
                          {Number(p.giacenza_totale).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                        </span>
                        <span className="text-xs text-gray-400 ml-1">{UNITA_MISURA_LABELS[p.unita_misura]}</span>
                      </TableCell>

                      <TableCell>
                        {stato === 'negativa' && <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">Negativa</Badge>}
                        {stato === 'alert' && <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">Sotto scorta</Badge>}
                        {stato === 'ok' && p.soglia_abilitata && p.giacenza_totale > 0 && <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">OK</Badge>}
                        {stato === 'ok' && !p.soglia_abilitata && p.giacenza_totale > 0 && <CheckCircle2 className="h-4 w-4 text-green-400" />}
                        {p.giacenza_totale === 0 && <span className="text-xs text-gray-400">—</span>}
                      </TableCell>

                      {/* Azioni */}
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 gap-1 h-7 text-xs px-2"
                            onClick={(e) => openMovimento(p.id, 'entrata', e)}
                          >
                            <ArrowDownToLine className="h-3 w-3" />
                            Carico
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-orange-600 border-orange-300 hover:bg-orange-50 gap-1 h-7 text-xs px-2"
                            onClick={(e) => openMovimento(p.id, 'uscita', e)}
                          >
                            <ArrowUpFromLine className="h-3 w-3" />
                            Scarico
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-gray-500 hover:text-gray-700"
                            onClick={(e) => openEdit(p, e)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-red-400 hover:text-red-600"
                            onClick={(e) => openDelete(p, e)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Accordion: dettaglio per finitura/variante/commessa */}
                    {isExpanded && !isLoading && rows.length === 0 && (
                      <TableRow key={`${p.id}-empty`} className="bg-gray-50">
                        <TableCell />
                        <TableCell colSpan={5} className="py-2 pl-12 text-xs text-gray-400 italic">
                          Nessun movimento registrato
                        </TableCell>
                      </TableRow>
                    )}
                    {isExpanded && rows.map((sub, i) => (
                      <TableRow key={`${p.id}-sub-${i}`} className="bg-gray-50 hover:bg-gray-100">
                        <TableCell />
                        <TableCell className="py-2 pl-10" colSpan={2}>
                          <div className="flex flex-wrap items-center gap-2">
                            {sub.finitura_nome && (
                              <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-100 text-xs font-normal">
                                {sub.finitura_nome}
                              </Badge>
                            )}
                            {sub.variante_nome && (
                              <Badge variant="secondary" className="text-xs font-normal">
                                {sub.variante_nome}
                              </Badge>
                            )}
                            {sub.commessa_ref && (
                              <span className="text-xs text-violet-600 font-medium">{sub.commessa_ref}</span>
                            )}
                            {!sub.finitura_nome && !sub.variante_nome && !sub.commessa_ref && (
                              <span className="text-xs text-gray-400">Stock generico</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right py-2">
                          <span className={cn('text-sm font-semibold', sub.giacenza < 0 ? 'text-red-600' : 'text-gray-700')}>
                            {fmtQty(sub.giacenza, p.unita_misura)}
                          </span>
                          {sub.lunghezza != null && (
                            <span className="text-xs text-gray-400 ml-1">
                              a {Number(sub.lunghezza).toLocaleString('it-IT')} mm
                            </span>
                          )}
                        </TableCell>
                        <TableCell />
                        <TableCell />
                      </TableRow>
                    ))}
                  </>
                )
              })}
            </TableBody>
          </Table>
          <div className="px-4 py-2 border-t text-xs text-gray-400">
            {filtered.length} prodott{filtered.length === 1 ? 'o' : 'i'}
            {filtered.length !== items.length && ` (su ${items.length} totali)`}
          </div>
        </div>
      )}

      <DialogMovimento
        open={movimentoOpen}
        onOpenChange={(v) => { setMovimentoOpen(v); if (!v) router.refresh() }}
        prodotti={prodotti}
        fornitori={fornitori}
        defaultTipo={movimentoTipo}
        defaultProdottoId={movimentoProdottoId}
      />

      <DialogProdotto
        open={prodottoDialogOpen}
        onOpenChange={setProdottoDialogOpen}
        prodotto={editingProdotto}
        categorie={categorie}
        fornitori={fornitori}
        posizioni={posizioni}
      />

      <AlertDialog open={!!deletingProdotto} onOpenChange={(v) => !v && setDeletingProdotto(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina prodotto</AlertDialogTitle>
            <AlertDialogDescription>
              Elimini <strong>{deletingProdotto?.nome}</strong>? Verranno rimossi anche i file allegati.
              L&apos;operazione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Eliminazione...' : 'Elimina'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
