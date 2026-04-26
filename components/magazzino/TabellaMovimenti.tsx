'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowDownToLine, ArrowUpFromLine, Plus, Trash2, Search,
  Filter,
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
import { deleteMovimento } from '@/actions/magazzino'
import type { MovimentoConDettagli, ProdottoConCategoria } from '@/actions/magazzino'
import type { Fornitore } from '@/types/magazzino'
import { UNITA_MISURA_LABELS } from '@/types/magazzino'

interface Props {
  movimenti: MovimentoConDettagli[]
  prodotti: ProdottoConCategoria[]
  fornitori: Fornitore[]
}

function formatData(d: string) {
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function TabellaMovimenti({ movimenti, prodotti, fornitori }: Props) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [defaultTipo, setDefaultTipo] = useState<'entrata' | 'uscita'>('entrata')
  const [search, setSearch] = useState('')
  const [filterTipo, setFilterTipo] = useState<'all' | 'entrata' | 'uscita'>('all')
  const [filterFornitore, setFilterFornitore] = useState('all')
  const [filterDal, setFilterDal] = useState('')
  const [filterAl, setFilterAl] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const filtered = useMemo(() => {
    let list = movimenti
    if (filterTipo !== 'all') list = list.filter((m) => m.tipo === filterTipo)
    if (filterFornitore !== 'all') list = list.filter((m) => m.fornitore_id === filterFornitore)
    if (filterDal) list = list.filter((m) => m.data >= filterDal)
    if (filterAl) list = list.filter((m) => m.data <= filterAl)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((m) =>
        [m.prodotto?.codice, m.prodotto?.nome, m.commessa_ref, m.fornitore?.nome, m.finitura?.nome]
          .some((f) => f?.toLowerCase().includes(q))
      )
    }
    return list
  }, [movimenti, filterTipo, filterFornitore, filterDal, filterAl, search])

  const openMovimento = (tipo: 'entrata' | 'uscita') => {
    setDefaultTipo(tipo)
    setDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!deletingId) return
    setDeleting(true)
    try {
      await deleteMovimento(deletingId)
      toast.success('Movimento eliminato')
      router.refresh()
    } catch {
      toast.error('Errore durante l\'eliminazione')
    } finally {
      setDeleting(false)
      setDeletingId(null)
    }
  }

  const fornitoriFiltro = useMemo(
    () => [...new Map(movimenti.filter((m) => m.fornitore).map((m) => [m.fornitore_id, m.fornitore!])).values()],
    [movimenti]
  )

  return (
    <div className="space-y-4">
      {/* Azioni principali */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => openMovimento('entrata')} className="gap-2 bg-green-600 hover:bg-green-700">
          <ArrowDownToLine className="h-4 w-4" />
          Carico
        </Button>
        <Button onClick={() => openMovimento('uscita')} variant="outline" className="gap-2 text-orange-600 border-orange-300 hover:bg-orange-50">
          <ArrowUpFromLine className="h-4 w-4" />
          Scarico
        </Button>
        <Button onClick={() => openMovimento('entrata')} variant="ghost" className="gap-2 ml-auto">
          <Plus className="h-4 w-4" />
          Altro movimento
        </Button>
      </div>

      {/* Filtri */}
      <div className="flex flex-wrap gap-2 items-center p-3 rounded-lg bg-gray-50 border">
        <Filter className="h-4 w-4 text-gray-400 shrink-0" />
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            className="pl-8 h-8 text-sm w-48"
            placeholder="Cerca..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterTipo} onValueChange={(v) => setFilterTipo(v as typeof filterTipo)}>
          <SelectTrigger className="h-8 w-36 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i tipi</SelectItem>
            <SelectItem value="entrata">Solo carichi</SelectItem>
            <SelectItem value="uscita">Solo scarichi</SelectItem>
          </SelectContent>
        </Select>
        {fornitoriFiltro.length > 0 && (
          <Select value={filterFornitore} onValueChange={setFilterFornitore}>
            <SelectTrigger className="h-8 w-44 text-sm">
              <SelectValue placeholder="Fornitore" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i fornitori</SelectItem>
              {fornitoriFiltro.map((f) => (
                <SelectItem key={f.nome} value={f.nome}>{f.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input
          type="date"
          className="h-8 w-36 text-sm"
          value={filterDal}
          onChange={(e) => setFilterDal(e.target.value)}
          title="Dal"
        />
        <Input
          type="date"
          className="h-8 w-36 text-sm"
          value={filterAl}
          onChange={(e) => setFilterAl(e.target.value)}
          title="Al"
        />
        {(filterTipo !== 'all' || filterFornitore !== 'all' || filterDal || filterAl || search) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-gray-500"
            onClick={() => { setFilterTipo('all'); setFilterFornitore('all'); setFilterDal(''); setFilterAl(''); setSearch('') }}
          >
            Azzera filtri
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          {movimenti.length === 0 ? 'Nessun movimento registrato.' : 'Nessun risultato con i filtri applicati.'}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Data</TableHead>
                <TableHead className="w-24">Tipo</TableHead>
                <TableHead>Prodotto</TableHead>
                <TableHead>Variante / Finitura</TableHead>
                <TableHead className="text-right">Quantità</TableHead>
                <TableHead className="text-right">Prezzo unit.</TableHead>
                <TableHead>Fornitore / Commessa</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-sm text-gray-600 whitespace-nowrap">
                    {formatData(m.data)}
                  </TableCell>
                  <TableCell>
                    {m.tipo === 'entrata' ? (
                      <Badge className="gap-1 bg-green-100 text-green-700 border-green-200 hover:bg-green-100">
                        <ArrowDownToLine className="h-3 w-3" />
                        Carico
                      </Badge>
                    ) : (
                      <Badge className="gap-1 bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100">
                        <ArrowUpFromLine className="h-3 w-3" />
                        Scarico
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div>
                      <span className="font-mono text-xs text-gray-400 mr-1">{m.prodotto?.codice}</span>
                      <span className="font-medium text-sm">{m.prodotto?.nome}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {m.variante?.nome && <div>{m.variante.nome}</div>}
                    {m.finitura?.nome && (
                      <div className="text-xs text-indigo-600 mt-0.5">{m.finitura.nome}</div>
                    )}
                    {!m.variante?.nome && !m.finitura?.nome && '—'}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {Number(m.quantita).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                    <span className="text-xs text-gray-400 ml-1">
                      {m.prodotto ? UNITA_MISURA_LABELS[m.prodotto.unita_misura] : ''}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm text-gray-600">
                    {m.prezzo_unitario != null ? `€ ${Number(m.prezzo_unitario).toFixed(4)}` : '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {m.fornitore && (
                      <div className="text-blue-600">{m.fornitore.nome}</div>
                    )}
                    {m.commessa_ref && (
                      <div className={m.tipo === 'uscita' ? 'text-orange-600' : 'text-violet-600'}>
                        {m.commessa_ref}
                      </div>
                    )}
                    {!m.fornitore && !m.commessa_ref && '—'}
                  </TableCell>
                  <TableCell className="text-xs text-gray-400 max-w-32 truncate">
                    {m.note ?? ''}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-400 hover:text-red-600"
                      onClick={() => setDeletingId(m.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="px-4 py-2 border-t text-xs text-gray-400">
            {filtered.length} moviment{filtered.length === 1 ? 'o' : 'i'}
            {filtered.length !== movimenti.length && ` (su ${movimenti.length} totali)`}
          </div>
        </div>
      )}

      <DialogMovimento
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        prodotti={prodotti}
        fornitori={fornitori}
        defaultTipo={defaultTipo}
      />

      <AlertDialog open={!!deletingId} onOpenChange={(v) => !v && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina movimento</AlertDialogTitle>
            <AlertDialogDescription>
              Elimini questo movimento? La giacenza verrà aggiornata di conseguenza.
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
