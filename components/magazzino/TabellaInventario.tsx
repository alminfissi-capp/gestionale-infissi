'use client'

import { useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Search, Pencil, Trash2, Copy, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import DialogArticoloMagazzino from './DialogArticoloMagazzino'
import {
  updateQuantitaArticolo, deleteArticoloMagazzino, duplicaArticoloMagazzino,
} from '@/actions/magazzino'
import type { ArticoloMagazzinoConDettagli } from '@/types/magazzino'
import type { AnagraficaProdotto, CategoriaMagazzino, Fornitore, PosizioneMagazzino } from '@/types/magazzino'
import { UNITA_MISURA_LABELS, TIPO_CATEGORIA_LABELS } from '@/types/magazzino'
import { cn } from '@/lib/utils'

interface Props {
  articoli: ArticoloMagazzinoConDettagli[]
  prodotti: AnagraficaProdotto[]
  categorie: CategoriaMagazzino[]
  fornitori: Fornitore[]
  posizioni: PosizioneMagazzino[]
}

function MiniPhoto({ url, tipo }: { url?: string | null; tipo?: 'foto' | 'dxf' | null }) {
  if (!url || tipo === 'dxf') {
    return <div className="w-9 h-9 rounded bg-gray-100 flex items-center justify-center text-gray-300 text-xs shrink-0">—</div>
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="w-9 h-9 rounded object-cover shrink-0 border border-gray-100" />
  )
}

function QtyCell({ articolo, onSaved }: { articolo: ArticoloMagazzinoConDettagli; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(articolo.quantita))
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = () => {
    setValue(String(articolo.quantita))
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const save = async () => {
    const q = parseFloat(value)
    if (!isNaN(q)) {
      try {
        await updateQuantitaArticolo(articolo.id, q)
        onSaved()
      } catch {
        toast.error('Errore aggiornamento quantità')
      }
    }
    setEditing(false)
  }

  const adjust = async (delta: number) => {
    const newQty = Math.max(0, articolo.quantita + delta)
    try {
      await updateQuantitaArticolo(articolo.id, newQty)
      onSaved()
    } catch {
      toast.error('Errore aggiornamento quantità')
    }
  }

  const um = articolo.prodotto ? UNITA_MISURA_LABELS[articolo.prodotto.unita_misura] : ''

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          type="number"
          step="0.001"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          className="w-20 h-7 text-sm px-1.5"
        />
        <span className="text-xs text-gray-400">{um}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => adjust(-1)}>
        <Minus className="h-3 w-3" />
      </Button>
      <button
        onClick={startEdit}
        className={cn(
          'text-sm font-medium tabular-nums px-1 rounded hover:bg-gray-100 transition-colors min-w-[2rem] text-center',
          articolo.quantita <= 0 ? 'text-red-600' : 'text-gray-900'
        )}
      >
        {Number(articolo.quantita).toLocaleString('it-IT', { maximumFractionDigits: 3 })}
      </button>
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => adjust(1)}>
        <Plus className="h-3 w-3" />
      </Button>
      <span className="text-xs text-gray-400">{um}</span>
    </div>
  )
}

export default function TabellaInventario({ articoli, prodotti, categorie, fornitori, posizioni }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filterCategoria, setFilterCategoria] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingArticolo, setEditingArticolo] = useState<ArticoloMagazzinoConDettagli | null>(null)
  const [deletingArticolo, setDeletingArticolo] = useState<ArticoloMagazzinoConDettagli | null>(null)
  const [deleting, setDeleting] = useState(false)

  const categorieMap = useMemo(() => new Map(categorie.map((c) => [c.id, c])), [categorie])

  const filtered = useMemo(() => {
    let list = articoli
    if (filterCategoria !== 'all') {
      list = list.filter((a) => a.prodotto?.categoria_id === filterCategoria)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((a) => {
        const p = a.prodotto
        return [
          p?.codice, p?.nome, p?.descrizione,
          a.finitura, a.commessa, a.posizione?.nome, a.fornitore?.nome,
        ].some((f) => f?.toLowerCase().includes(q))
      })
    }
    return list
  }, [articoli, filterCategoria, search])

  const handleDelete = async () => {
    if (!deletingArticolo) return
    setDeleting(true)
    try {
      await deleteArticoloMagazzino(deletingArticolo.id)
      toast.success('Articolo eliminato')
      router.refresh()
    } catch {
      toast.error('Errore durante l\'eliminazione')
    } finally {
      setDeleting(false)
      setDeletingArticolo(null)
    }
  }

  const handleDuplica = async (a: ArticoloMagazzinoConDettagli) => {
    try {
      await duplicaArticoloMagazzino(a.id)
      toast.success('Articolo duplicato')
      router.refresh()
    } catch {
      toast.error('Errore nella duplicazione')
    }
  }

  const openNew = () => { setEditingArticolo(null); setDialogOpen(true) }
  const openEdit = (a: ArticoloMagazzinoConDettagli) => { setEditingArticolo(a); setDialogOpen(true) }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-40 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Cerca codice, nome, finitura, commessa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterCategoria} onValueChange={setFilterCategoria}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tutte le categorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le categorie</SelectItem>
            {categorie.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome}
                <span className="text-gray-400 ml-1 text-xs">({TIPO_CATEGORIA_LABELS[c.tipo]})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={openNew} className="gap-2 ml-auto">
          <Plus className="h-4 w-4" />
          Aggiungi
        </Button>
      </div>

      {/* Contatore */}
      <p className="text-xs text-gray-400">
        {filtered.length} articol{filtered.length === 1 ? 'o' : 'i'}
        {filtered.length !== articoli.length && ` (su ${articoli.length} totali)`}
      </p>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          {articoli.length === 0
            ? 'Nessun articolo in magazzino. Clicca "Aggiungi" per iniziare.'
            : 'Nessun risultato per la ricerca.'}
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Codice</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Finitura</TableHead>
                <TableHead>Quantità</TableHead>
                <TableHead>Q.2</TableHead>
                <TableHead>Posizione</TableHead>
                <TableHead>Fornitore</TableHead>
                <TableHead>Commessa</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => {
                const p = a.prodotto
                const cat = p?.categoria_id ? categorieMap.get(p.categoria_id) : null
                return (
                  <TableRow key={a.id} className="group">
                    {/* Foto */}
                    <TableCell className="py-1.5 pl-3 pr-0">
                      <MiniPhoto url={a.preview_url} tipo={a.preview_tipo} />
                    </TableCell>

                    {/* Codice */}
                    <TableCell className="py-1.5 font-mono text-xs text-gray-600 whitespace-nowrap">
                      {p?.codice ?? <span className="text-gray-300">—</span>}
                    </TableCell>

                    {/* Nome + categoria */}
                    <TableCell className="py-1.5">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">{p?.nome ?? <span className="text-gray-400 italic">Prodotto eliminato</span>}</span>
                        {cat && (
                          <Badge variant="outline" className="text-xs w-fit mt-0.5 py-0 font-normal text-gray-500">
                            {cat.nome}
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Finitura */}
                    <TableCell className="py-1.5 text-sm text-gray-700">
                      {a.finitura ?? <span className="text-gray-300">—</span>}
                    </TableCell>

                    {/* Quantità (inline editable) */}
                    <TableCell className="py-1.5">
                      <QtyCell articolo={a} onSaved={() => router.refresh()} />
                    </TableCell>

                    {/* Quantità 2 */}
                    <TableCell className="py-1.5 text-sm text-gray-600 whitespace-nowrap">
                      {a.quantita_2 != null
                        ? `${Number(a.quantita_2).toLocaleString('it-IT', { maximumFractionDigits: 3 })}${a.unita_misura_2 ? ` ${a.unita_misura_2}` : ''}`
                        : <span className="text-gray-300">—</span>}
                    </TableCell>

                    {/* Posizione */}
                    <TableCell className="py-1.5 text-sm text-gray-700">
                      {a.posizione?.nome ?? <span className="text-gray-300">—</span>}
                    </TableCell>

                    {/* Fornitore */}
                    <TableCell className="py-1.5 text-sm text-blue-600">
                      {a.fornitore?.nome ?? <span className="text-gray-300">—</span>}
                    </TableCell>

                    {/* Commessa */}
                    <TableCell className="py-1.5 text-sm text-violet-600">
                      {a.commessa ?? <span className="text-gray-300">—</span>}
                    </TableCell>

                    {/* Azioni */}
                    <TableCell className="py-1.5">
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(a)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-500" onClick={() => handleDuplica(a)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => setDeletingArticolo(a)}>
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

      <DialogArticoloMagazzino
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        articolo={editingArticolo}
        prodotti={prodotti}
        categorie={categorie}
        fornitori={fornitori}
        posizioni={posizioni}
        onSaved={() => router.refresh()}
      />

      <AlertDialog open={!!deletingArticolo} onOpenChange={(v) => !v && setDeletingArticolo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina articolo</AlertDialogTitle>
            <AlertDialogDescription>
              Elimini <strong>{deletingArticolo?.prodotto?.nome ?? 'questo articolo'}</strong>
              {deletingArticolo?.finitura ? ` (${deletingArticolo.finitura})` : ''}
              {deletingArticolo?.commessa ? ` — commessa: ${deletingArticolo.commessa}` : ''}?
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
