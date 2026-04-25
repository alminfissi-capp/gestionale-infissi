'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  createCategoriaMagazzino, updateCategoriaMagazzino,
  getFinitureByCategoriaId, saveFinitureCategoriaAll,
} from '@/actions/magazzino'
import type { CategoriaMagazzinoInput } from '@/actions/magazzino'
import type { CategoriaMagazzino, TipoCategoriaMagazzino, FinituraCategoriaInput } from '@/types/magazzino'
import { TIPO_CATEGORIA_LABELS, CATEGORIE_CON_FINITURE } from '@/types/magazzino'

interface FInituraRow extends FinituraCategoriaInput {
  _key: string
  _existingId?: string
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  categoria?: CategoriaMagazzino | null
}

const empty = (): CategoriaMagazzinoInput => ({ nome: '', tipo: 'alluminio', ordine: 0 })
const newKey = () => Math.random().toString(36).slice(2)

export default function DialogCategoriaMagazzino({ open, onOpenChange, categoria }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<CategoriaMagazzinoInput>(empty())
  const [finiture, setFiniture] = useState<FInituraRow[]>([])
  const [toDelete, setToDelete] = useState<string[]>([])
  const [newNome, setNewNome] = useState('')
  const [newKg, setNewKg] = useState('')
  const [newMetro, setNewMetro] = useState('')
  const [loading, setLoading] = useState(false)

  const hasFinitureTipo = CATEGORIE_CON_FINITURE.includes(form.tipo)

  useEffect(() => {
    if (!open) return
    const base = categoria
      ? { nome: categoria.nome, tipo: categoria.tipo, ordine: categoria.ordine }
      : empty()
    setForm(base)
    setToDelete([])
    setNewNome(''); setNewKg(''); setNewMetro('')

    if (categoria && CATEGORIE_CON_FINITURE.includes(categoria.tipo)) {
      getFinitureByCategoriaId(categoria.id).then((rows) => {
        setFiniture(rows.map((r) => ({
          _key: r.id,
          _existingId: r.id,
          nome: r.nome,
          costo_per_kg: r.costo_per_kg,
          costo_per_metro: r.costo_per_metro,
        })))
      })
    } else {
      setFiniture([])
    }
  }, [open, categoria])

  const addFinitura = () => {
    const nome = newNome.trim()
    if (!nome) return
    const kg = newKg ? parseFloat(newKg) : null
    const metro = newMetro ? parseFloat(newMetro) : null
    if (kg === null && metro === null) {
      toast.error('Inserisci almeno un costo (€/kg o €/m)')
      return
    }
    setFiniture((prev) => [...prev, { _key: newKey(), nome, costo_per_kg: kg, costo_per_metro: metro }])
    setNewNome(''); setNewKg(''); setNewMetro('')
  }

  const removeFinitura = (row: FInituraRow) => {
    if (row._existingId) setToDelete((d) => [...d, row._existingId!])
    setFiniture((prev) => prev.filter((r) => r._key !== row._key))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim()) { toast.error('Il nome è obbligatorio'); return }
    setLoading(true)
    try {
      let catId: string
      if (categoria) {
        await updateCategoriaMagazzino(categoria.id, form)
        catId = categoria.id
      } else {
        const res = await createCategoriaMagazzino(form)
        catId = res.id
      }

      if (hasFinitureTipo) {
        const newFiniture = finiture.filter((f) => !f._existingId)
        await saveFinitureCategoriaAll(catId, newFiniture, toDelete)
      }

      toast.success(categoria ? 'Categoria aggiornata' : 'Categoria creata')
      onOpenChange(false)
      router.refresh()
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{categoria ? 'Modifica categoria' : 'Nuova categoria'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome *</Label>
            <Input
              id="nome"
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              placeholder="Es. Profili alluminio"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select
                value={form.tipo}
                onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as TipoCategoriaMagazzino }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(TIPO_CATEGORIA_LABELS) as [TipoCategoriaMagazzino, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ordine">Ordine</Label>
              <Input
                id="ordine"
                type="number"
                min="0"
                value={form.ordine ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, ordine: parseInt(e.target.value) || 0 }))}
              />
            </div>
          </div>

          {hasFinitureTipo && (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Finiture</p>
              <p className="text-xs text-gray-400">Inserisci il costo per kg e/o per metro lineare di ogni finitura.</p>

              {finiture.length > 0 && (
                <div className="space-y-1.5">
                  {finiture.map((row) => (
                    <div key={row._key} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <span className="flex-1 font-medium">{row.nome}</span>
                      {row.costo_per_kg != null && (
                        <span className="text-gray-500 text-xs">€{row.costo_per_kg}/kg</span>
                      )}
                      {row.costo_per_metro != null && (
                        <span className="text-gray-500 text-xs">€{row.costo_per_metro}/m</span>
                      )}
                      <button type="button" onClick={() => removeFinitura(row)} className="text-red-400 hover:text-red-600 ml-1">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-[1fr_80px_80px_32px] gap-2 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Nome finitura</Label>
                  <Input
                    placeholder="Es. Bianco RAL 9010"
                    value={newNome}
                    onChange={(e) => setNewNome(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFinitura())}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">€/kg</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    placeholder="0.00"
                    value={newKg}
                    onChange={(e) => setNewKg(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFinitura())}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">€/m</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    placeholder="0.00"
                    value={newMetro}
                    onChange={(e) => setNewMetro(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFinitura())}
                  />
                </div>
                <Button type="button" variant="outline" size="icon" onClick={addFinitura}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvataggio...' : categoria ? 'Salva' : 'Crea'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
