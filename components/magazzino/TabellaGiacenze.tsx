'use client'

import { useState, useMemo } from 'react'
import { Search, AlertTriangle, CheckCircle2, XCircle, Filter, ChevronRight, ChevronDown, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { GiacenzaConSoglia, GiacenzaBreakdownRow } from '@/actions/magazzino'
import { getGiacenzaDettaglioProdotto } from '@/actions/magazzino'
import type { CategoriaMagazzino, UnitaMisura } from '@/types/magazzino'
import { UNITA_MISURA_LABELS } from '@/types/magazzino'
import PreviewMiniatura, { prodottoPreviewProps } from './PreviewMiniatura'

type ProdottoFoto = { foto_url: string | null; dxf_url: string | null }

interface Props {
  giacenze: GiacenzaConSoglia[]
  categorie: CategoriaMagazzino[]
  categoriaPerProdotto: Record<string, string>
  previewPerProdotto: Record<string, ProdottoFoto>
}

type Stato = 'ok' | 'alert' | 'negativa'

type GruppoGiacenza = {
  prodotto_id: string
  codice: string
  prodotto_nome: string
  unita_misura: UnitaMisura
  giacenza_totale: number
  soglia_minima: number | null
  soglia_abilitata: boolean
}

function getStato(g: { giacenza_totale: number; soglia_minima: number | null; soglia_abilitata: boolean }): Stato {
  if (g.giacenza_totale < 0) return 'negativa'
  if (g.soglia_abilitata && g.soglia_minima !== null && g.giacenza_totale < g.soglia_minima) return 'alert'
  return 'ok'
}

function fmtQty(n: number, udm: UnitaMisura) {
  return `${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${UNITA_MISURA_LABELS[udm]}`
}

export default function TabellaGiacenze({ giacenze, categorie, categoriaPerProdotto, previewPerProdotto }: Props) {
  const [search, setSearch] = useState('')
  const [filterStato, setFilterStato] = useState<'all' | 'alert' | 'negativa' | 'ok'>('all')
  const [filterCategoria, setFilterCategoria] = useState('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [breakdown, setBreakdown] = useState<Record<string, GiacenzaBreakdownRow[]>>({})
  const [loading, setLoading] = useState<Set<string>>(new Set())

  // Raggruppa per prodotto_id sommando le giacenze
  const gruppi = useMemo<GruppoGiacenza[]>(() => {
    const map = new Map<string, GruppoGiacenza>()
    for (const g of giacenze) {
      const existing = map.get(g.prodotto_id)
      if (existing) {
        existing.giacenza_totale += g.giacenza_attuale
      } else {
        map.set(g.prodotto_id, {
          prodotto_id: g.prodotto_id,
          codice: g.codice,
          prodotto_nome: g.prodotto_nome,
          unita_misura: g.unita_misura,
          giacenza_totale: g.giacenza_attuale,
          soglia_minima: g.soglia_minima,
          soglia_abilitata: g.soglia_abilitata,
        })
      }
    }
    return Array.from(map.values())
  }, [giacenze])

  const stats = useMemo(() => ({
    totale: gruppi.length,
    alert: gruppi.filter((g) => getStato(g) === 'alert').length,
    negative: gruppi.filter((g) => getStato(g) === 'negativa').length,
  }), [gruppi])

  const filtered = useMemo(() => {
    let list = gruppi
    if (filterStato !== 'all') list = list.filter((g) => getStato(g) === filterStato)
    if (filterCategoria !== 'all') {
      list = list.filter((g) => categoriaPerProdotto[g.prodotto_id] === filterCategoria)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((g) =>
        [g.codice, g.prodotto_nome].some((f) => f?.toLowerCase().includes(q))
      )
    }
    return list
  }, [gruppi, filterStato, filterCategoria, search, categoriaPerProdotto])

  const toggleExpand = async (prodottoId: string) => {
    const next = new Set(expanded)
    if (next.has(prodottoId)) {
      next.delete(prodottoId)
    } else {
      next.add(prodottoId)
      if (!breakdown[prodottoId]) {
        setLoading((prev) => new Set(prev).add(prodottoId))
        try {
          const rows = await getGiacenzaDettaglioProdotto(prodottoId)
          setBreakdown((prev) => ({ ...prev, [prodottoId]: rows }))
        } finally {
          setLoading((prev) => { const s = new Set(prev); s.delete(prodottoId); return s })
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
          <p className="text-xs text-gray-500">Voci in giacenza</p>
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
            className="pl-8 h-8 text-sm w-48"
            placeholder="Cerca prodotto..."
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
              <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStato} onValueChange={(v) => setFilterStato(v as typeof filterStato)}>
          <SelectTrigger className="h-8 w-44 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
            <SelectItem value="alert">Sotto scorta</SelectItem>
            <SelectItem value="negativa">Giacenza negativa</SelectItem>
          </SelectContent>
        </Select>
        {(filterStato !== 'all' || filterCategoria !== 'all' || search) && (
          <button
            className="text-xs text-gray-400 hover:text-gray-600 ml-1"
            onClick={() => { setFilterStato('all'); setFilterCategoria('all'); setSearch('') }}
          >
            Azzera
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          {giacenze.length === 0 ? 'Nessun prodotto con movimenti.' : 'Nessun risultato.'}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead className="min-w-56">Prodotto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Giacenza</TableHead>
                <TableHead className="text-right">Scorta min.</TableHead>
                <TableHead>Stato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((g) => {
                const stato = getStato(g)
                const catId = categoriaPerProdotto[g.prodotto_id]
                const cat = categorie.find((c) => c.id === catId)
                const isExpanded = expanded.has(g.prodotto_id)
                const isLoading = loading.has(g.prodotto_id)
                const rows = breakdown[g.prodotto_id] ?? []
                const foto = previewPerProdotto[g.prodotto_id]
                const preview = prodottoPreviewProps(foto?.foto_url ?? null, foto?.dxf_url ?? null)

                return (
                  <>
                    {/* Riga gruppo */}
                    <TableRow
                      key={g.prodotto_id}
                      className={cn(
                        'cursor-pointer select-none',
                        stato === 'negativa' && 'bg-red-50 hover:bg-red-100',
                        stato === 'alert' && 'bg-amber-50 hover:bg-amber-100',
                        stato === 'ok' && 'hover:bg-gray-50',
                      )}
                      onClick={() => toggleExpand(g.prodotto_id)}
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
                          <PreviewMiniatura url={preview.url} tipo={preview.tipo} size={36} />
                          <div>
                            <span className="font-bold text-sm text-gray-900 mr-1.5">{g.codice}</span>
                            <span className="text-sm text-gray-700">{g.prodotto_nome}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">{cat?.nome ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        <span className={cn(
                          'font-bold text-base',
                          stato === 'negativa' && 'text-red-600',
                          stato === 'alert' && 'text-amber-600',
                          stato === 'ok' && 'text-gray-900',
                        )}>
                          {Number(g.giacenza_totale).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                        </span>
                        <span className="text-xs text-gray-400 ml-1">{UNITA_MISURA_LABELS[g.unita_misura]}</span>
                      </TableCell>
                      <TableCell className="text-right text-sm text-gray-500">
                        {g.soglia_abilitata && g.soglia_minima !== null
                          ? `${Number(g.soglia_minima).toLocaleString('it-IT', { maximumFractionDigits: 3 })} ${UNITA_MISURA_LABELS[g.unita_misura]}`
                          : <span className="text-gray-300">—</span>}
                      </TableCell>
                      <TableCell>
                        {stato === 'negativa' && <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">Negativa</Badge>}
                        {stato === 'alert' && <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">Sotto scorta</Badge>}
                        {stato === 'ok' && g.soglia_abilitata && <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">OK</Badge>}
                        {stato === 'ok' && !g.soglia_abilitata && <CheckCircle2 className="h-4 w-4 text-green-400" />}
                      </TableCell>
                    </TableRow>

                    {/* Righe dettaglio accordion */}
                    {isExpanded && !isLoading && rows.length === 0 && (
                      <TableRow key={`${g.prodotto_id}-empty`} className="bg-gray-50 border-b-0">
                        <TableCell />
                        <TableCell colSpan={5} className="py-2 pl-12 text-xs text-gray-400 italic">
                          Nessun dettaglio disponibile
                        </TableCell>
                      </TableRow>
                    )}
                    {isExpanded && rows.map((sub, i) => (
                      <TableRow
                        key={`${g.prodotto_id}-sub-${i}`}
                        className="bg-gray-50 hover:bg-gray-100"
                      >
                        <TableCell />
                        <TableCell className="py-2 pl-10">
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
                        <TableCell />
                        <TableCell className="text-right py-2">
                          <span className={cn(
                            'text-sm font-semibold',
                            sub.giacenza < 0 ? 'text-red-600' : 'text-gray-700',
                          )}>
                            {fmtQty(sub.giacenza, g.unita_misura)}
                          </span>
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
            {filtered.length !== gruppi.length && ` (su ${gruppi.length} totali)`}
          </div>
        </div>
      )}
    </div>
  )
}
