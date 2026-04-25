'use client'

import { useState, useMemo, memo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Search, Pencil, Trash2, AlertTriangle, ImageIcon } from 'lucide-react'
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
import DialogProdotto from './DialogProdotto'
import DxfMiniatura from './DxfMiniatura'
import { deleteProdotto } from '@/actions/magazzino'
import type { ProdottoConCategoria } from '@/actions/magazzino'
import type { CategoriaMagazzino, Fornitore } from '@/types/magazzino'
import { UNITA_MISURA_LABELS, TIPO_CATEGORIA_LABELS } from '@/types/magazzino'

type ProdottoConPreview = ProdottoConCategoria & {
  preview_url: string | null
  preview_tipo: 'foto' | 'dxf' | null
}

interface Props {
  prodotti: ProdottoConPreview[]
  categorie: CategoriaMagazzino[]
  fornitori: Fornitore[]
}

const PreviewCell = memo(function PreviewCell({ url, tipo }: { url: string | null; tipo: 'foto' | 'dxf' | null }) {
  const [imgError, setImgError] = useState(false)

  const placeholder = (
    <div className="w-12 h-12 rounded-md bg-gray-100 flex items-center justify-center border border-gray-200">
      <ImageIcon className="h-5 w-5 text-gray-300" />
    </div>
  )

  if (!url || !tipo) return placeholder

  if (tipo === 'foto' && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="w-12 h-12 rounded-md object-cover border border-gray-200 bg-gray-50"
        onError={() => setImgError(true)}
      />
    )
  }

  if (tipo === 'dxf') {
    return <DxfMiniatura url={url} size={48} />
  }

  return placeholder
})

export default function TabellaProdotti({ prodotti, categorie, fornitori }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filterCategoria, setFilterCategoria] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ProdottoConCategoria | null>(null)
  const [deletingProdotto, setDeletingProdotto] = useState<ProdottoConPreview | null>(null)
  const [deleting, setDeleting] = useState(false)

  const filtered = useMemo(() => {
    let list = prodotti
    if (filterCategoria !== 'all') list = list.filter((p) => p.categoria_id === filterCategoria)
    const q = search.toLowerCase().trim()
    if (q) list = list.filter((p) =>
      [p.codice, p.nome, p.descrizione].some((f) => f?.toLowerCase().includes(q))
    )
    return list
  }, [prodotti, search, filterCategoria])

  const openCreate = () => { setEditing(null); setDialogOpen(true) }
  const openEdit = (p: ProdottoConPreview) => { setEditing(p); setDialogOpen(true) }

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
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-40 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Cerca prodotto..."
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
                {c.nome} <span className="text-gray-400 ml-1">({TIPO_CATEGORIA_LABELS[c.tipo]})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={openCreate} className="gap-2 ml-auto">
          <Plus className="h-4 w-4" />
          Nuovo prodotto
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          {search || filterCategoria !== 'all' ? 'Nessun risultato' : 'Nessun prodotto. Crea il primo.'}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Foto</TableHead>
                <TableHead>Codice</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>UdM</TableHead>
                <TableHead>Prezzo acq.</TableHead>
                <TableHead>Varianti</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="py-2">
                    <div className="relative">
                      <PreviewCell url={p.preview_url} tipo={p.preview_tipo} />
                      {p.soglia_abilitata && p.soglia_minima !== null && (
                        <AlertTriangle className="absolute -top-1 -right-1 h-3.5 w-3.5 text-amber-500" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm font-medium">{p.codice}</TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{p.nome}</p>
                      {p.descrizione && <p className="text-xs text-gray-400 truncate max-w-48">{p.descrizione}</p>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{p.categoria?.nome ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {UNITA_MISURA_LABELS[p.unita_misura]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-700">
                    {p.prezzo_acquisto != null ? `€ ${Number(p.prezzo_acquisto).toFixed(4)}` : '—'}
                  </TableCell>
                  <TableCell>
                    {p.varianti.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-w-36">
                        {p.varianti.slice(0, 3).map((v) => (
                          <Badge key={v.id} variant="secondary" className="text-xs">{v.nome}</Badge>
                        ))}
                        {p.varianti.length > 3 && (
                          <Badge variant="secondary" className="text-xs">+{p.varianti.length - 3}</Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => setDeletingProdotto(p)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DialogProdotto
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        prodotto={editing}
        categorie={categorie}
        fornitori={fornitori}
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
