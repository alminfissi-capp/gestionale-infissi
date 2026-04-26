'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Search, Filter, AlertTriangle, CheckCircle2, XCircle,
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
import type { GiacenzaFlatRow, ProdottoConCategoria } from '@/actions/magazzino'
import type { CategoriaMagazzino, Fornitore, PosizioneMagazzino } from '@/types/magazzino'
import { UNITA_MISURA_LABELS, TIPO_CATEGORIA_LABELS } from '@/types/magazzino'
import { cn } from '@/lib/utils'

type ProdottoConPreview = ProdottoConCategoria & {
  preview_url: string | null
  preview_tipo: 'foto' | 'dxf' | null
}

interface Props {
  prodotti: ProdottoConPreview[]
  giacenzaFlat: GiacenzaFlatRow[]
  categorie: CategoriaMagazzino[]
  fornitori: Fornitore[]
  posizioni: PosizioneMagazzino[]
}

type Stato = 'ok' | 'alert' | 'negativa'

function getStato(giacenza: number, soglia_minima: number | null, soglia_abilitata: boolean): Stato {
  if (giacenza < 0) return 'negativa'
  if (soglia_abilitata && soglia_minima !== null && giacenza < soglia_minima) return 'alert'
  return 'ok'
}

type DisplayRow = {
  key: string
  prodotto: ProdottoConPreview
  variante_nome: string | null
  finitura_nome: string | null
  lunghezza: number | null
  giacenza: number
  giacenzaTotaleProdotto: number
  fornitori: string[]
  commesse: string[]
  isFirstOfProduct: boolean
}

export default function TabellaScorte({ prodotti, giacenzaFlat, categorie, fornitori, posizioni }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filterCategoria, setFilterCategoria] = useState('all')
  const [filterStato, setFilterStato] = useState<'all' | 'ok' | 'alert' | 'negativa'>('all')

  const [movimentoOpen, setMovimentoOpen] = useState(false)
  const [movimentoProdottoId, setMovimentoProdottoId] = useState<string | undefined>()
  const [movimentoTipo, setMovimentoTipo] = useState<'entrata' | 'uscita'>('entrata')

  const [prodottoDialogOpen, setProdottoDialogOpen] = useState(false)
  const [editingProdotto, setEditingProdotto] = useState<ProdottoConCategoria | null>(null)

  const [deletingProdotto, setDeletingProdotto] = useState<ProdottoConPreview | null>(null)
  const [deleting, setDeleting] = useState(false)

  const prodottiMap = useMemo(
    () => new Map(prodotti.map((p) => [p.id, p])),
    [prodotti]
  )

  // Giacenza totale per prodotto (per stato e KPI)
  const giacenzaTotaleMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of giacenzaFlat) {
      map.set(r.prodotto_id, (map.get(r.prodotto_id) ?? 0) + r.giacenza)
    }
    return map
  }, [giacenzaFlat])

  // Costruisce le righe flat, con prodotti senza movimenti in fondo (giacenza 0)
  const allRows = useMemo<DisplayRow[]>(() => {
    const prodottiConMovimenti = new Set(giacenzaFlat.map((r) => r.prodotto_id))

    // Raggruppa flat rows per prodotto mantenendo ordine
    const byProdotto = new Map<string, GiacenzaFlatRow[]>()
    for (const r of giacenzaFlat) {
      if (!byProdotto.has(r.prodotto_id)) byProdotto.set(r.prodotto_id, [])
      byProdotto.get(r.prodotto_id)!.push(r)
    }

    const rows: DisplayRow[] = []

    for (const [prodId, flatRows] of byProdotto) {
      const prodotto = prodottiMap.get(prodId)
      if (!prodotto) continue
      const giacenzaTotale = giacenzaTotaleMap.get(prodId) ?? 0
      flatRows.forEach((fr, i) => {
        rows.push({
          key: `${prodId}-${i}`,
          prodotto,
          variante_nome: fr.variante_nome,
          finitura_nome: fr.finitura_nome,
          lunghezza: fr.lunghezza,
          giacenza: fr.giacenza,
          giacenzaTotaleProdotto: giacenzaTotale,
          fornitori: fr.fornitori,
          commesse: fr.commesse,
          isFirstOfProduct: i === 0,
        })
      })
    }

    // Prodotti senza movimenti
    for (const prodotto of prodotti) {
      if (!prodottiConMovimenti.has(prodotto.id)) {
        rows.push({
          key: `${prodotto.id}-zero`,
          prodotto,
          variante_nome: null,
          finitura_nome: null,
          lunghezza: null,
          giacenza: 0,
          giacenzaTotaleProdotto: 0,
          fornitori: [],
          commesse: [],
          isFirstOfProduct: true,
        })
      }
    }

    return rows
  }, [prodotti, giacenzaFlat, prodottiMap, giacenzaTotaleMap])

  const stats = useMemo(() => {
    const unici = new Map<string, number>()
    for (const r of allRows) unici.set(r.prodotto.id, r.giacenzaTotaleProdotto)
    const vals = Array.from(unici.entries())
    return {
      totale: vals.length,
      alert: vals.filter(([id]) => {
        const p = prodottiMap.get(id)!
        return getStato(unici.get(id)!, p.soglia_minima, p.soglia_abilitata) === 'alert'
      }).length,
      negative: vals.filter(([id]) => {
        const p = prodottiMap.get(id)!
        return getStato(unici.get(id)!, p.soglia_minima, p.soglia_abilitata) === 'negativa'
      }).length,
    }
  }, [allRows, prodottiMap])

  const filtered = useMemo(() => {
    let list = allRows
    if (filterStato !== 'all') {
      list = list.filter((r) => {
        const p = r.prodotto
        return getStato(r.giacenzaTotaleProdotto, p.soglia_minima, p.soglia_abilitata) === filterStato
      })
    }
    if (filterCategoria !== 'all') {
      list = list.filter((r) => r.prodotto.categoria_id === filterCategoria)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((r) =>
        [r.prodotto.codice, r.prodotto.nome, r.finitura_nome, r.variante_nome, ...r.commesse, ...r.fornitori]
          .some((f) => f?.toLowerCase().includes(q))
      )
    }
    return list
  }, [allRows, filterStato, filterCategoria, search])

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

      {/* Filtri */}
      <div className="flex flex-wrap gap-2 items-center p-3 rounded-lg bg-gray-50 border">
        <Filter className="h-4 w-4 text-gray-400 shrink-0" />
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            className="pl-8 h-8 text-sm w-52"
            placeholder="Codice, nome, finitura, commessa..."
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
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-56">Prodotto</TableHead>
                <TableHead>Finitura / Variante</TableHead>
                <TableHead>Lunghezza</TableHead>
                <TableHead className="text-right">Giacenza</TableHead>
                <TableHead>Fornitore</TableHead>
                <TableHead>Commessa</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="w-48" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r, idx) => {
                const p = r.prodotto
                const stato = getStato(r.giacenzaTotaleProdotto, p.soglia_minima, p.soglia_abilitata)
                const prevProdottoId = idx > 0 ? filtered[idx - 1].prodotto.id : null
                const isNewProduct = prevProdottoId !== p.id

                return (
                  <TableRow
                    key={r.key}
                    className={cn(
                      stato === 'negativa' && 'bg-red-50',
                      stato === 'alert' && 'bg-amber-50',
                      isNewProduct && idx > 0 && 'border-t-2 border-gray-200',
                    )}
                  >
                    {/* Prodotto: thumbnail + codice + nome solo sulla prima riga del gruppo */}
                    <TableCell className="py-2">
                      {isNewProduct ? (
                        <div className="flex items-center gap-2.5">
                          <PreviewMiniatura url={p.preview_url} tipo={p.preview_tipo} size={36} />
                          <div>
                            <span className="font-bold text-sm text-gray-900 mr-1.5">{p.codice}</span>
                            <span className="text-sm text-gray-700">{p.nome}</span>
                            {p.descrizione && (
                              <p className="text-xs text-gray-400 truncate max-w-52">{p.descrizione}</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="pl-11 text-xs text-gray-300 select-none">↳</div>
                      )}
                    </TableCell>

                    {/* Finitura / Variante */}
                    <TableCell className="py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {r.finitura_nome && (
                          <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-100 text-xs font-normal">
                            {r.finitura_nome}
                          </Badge>
                        )}
                        {r.variante_nome && (
                          <Badge variant="secondary" className="text-xs font-normal">
                            {r.variante_nome}
                          </Badge>
                        )}
                        {!r.finitura_nome && !r.variante_nome && (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Lunghezza */}
                    <TableCell className="py-2 text-sm text-gray-600 whitespace-nowrap">
                      {r.lunghezza != null
                        ? `${Number(r.lunghezza).toLocaleString('it-IT')} mm`
                        : <span className="text-gray-300">—</span>}
                    </TableCell>

                    {/* Giacenza */}
                    <TableCell className="text-right py-2 whitespace-nowrap">
                      <span className={cn(
                        'font-bold text-sm',
                        r.giacenza < 0 && 'text-red-600',
                        r.giacenza === 0 && 'text-gray-400',
                        r.giacenza > 0 && stato === 'alert' && 'text-amber-600',
                        r.giacenza > 0 && stato === 'ok' && 'text-gray-900',
                      )}>
                        {Number(r.giacenza).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                      </span>
                      <span className="text-xs text-gray-400 ml-1">{UNITA_MISURA_LABELS[p.unita_misura]}</span>
                    </TableCell>

                    {/* Fornitore */}
                    <TableCell className="py-2 text-sm">
                      {r.fornitori.length > 0
                        ? <span className="text-blue-600">{r.fornitori.join(', ')}</span>
                        : <span className="text-gray-300">—</span>}
                    </TableCell>

                    {/* Commessa */}
                    <TableCell className="py-2 text-sm">
                      {r.commesse.length > 0
                        ? <span className="text-violet-600">{r.commesse.join(', ')}</span>
                        : <span className="text-gray-300">—</span>}
                    </TableCell>

                    {/* Stato — solo sulla prima riga del prodotto */}
                    <TableCell className="py-2">
                      {isNewProduct && (
                        <>
                          {stato === 'negativa' && <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">Negativa</Badge>}
                          {stato === 'alert' && <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">Sotto scorta</Badge>}
                          {stato === 'ok' && p.soglia_abilitata && r.giacenzaTotaleProdotto > 0 && <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">OK</Badge>}
                          {stato === 'ok' && !p.soglia_abilitata && r.giacenzaTotaleProdotto > 0 && <CheckCircle2 className="h-4 w-4 text-green-400" />}
                        </>
                      )}
                    </TableCell>

                    {/* Azioni */}
                    <TableCell className="py-2">
                      <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-1 h-7 text-xs px-2" onClick={(e) => openMovimento(p.id, 'entrata', e)}>
                          <ArrowDownToLine className="h-3 w-3" />
                          Carico
                        </Button>
                        <Button size="sm" variant="outline" className="text-orange-600 border-orange-300 hover:bg-orange-50 gap-1 h-7 text-xs px-2" onClick={(e) => openMovimento(p.id, 'uscita', e)}>
                          <ArrowUpFromLine className="h-3 w-3" />
                          Scarico
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-500 hover:text-gray-700" onClick={(e) => openEdit(p, e)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={(e) => { e.stopPropagation(); setDeletingProdotto(p) }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <div className="px-4 py-2 border-t text-xs text-gray-400">
            {filtered.length} rig{filtered.length === 1 ? 'a' : 'he'}
            {filtered.length !== allRows.length && ` (su ${allRows.length} totali)`}
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
              Elimini <strong>{deletingProdotto?.nome}</strong>? L&apos;operazione non è reversibile.
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
