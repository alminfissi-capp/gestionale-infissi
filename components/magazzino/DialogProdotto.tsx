'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import UploadFile from './UploadFile'
import DxfViewer from './DxfViewer'
import { createProdotto, updateProdotto, getMagazzinoSignedUrl } from '@/actions/magazzino'
import type { ProdottoConCategoria, ProdottoInput, VarianteInput } from '@/actions/magazzino'
import type { CategoriaMagazzino, Fornitore, UnitaMisura } from '@/types/magazzino'
import { UNITA_MISURA_LABELS } from '@/types/magazzino'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  prodotto?: ProdottoConCategoria | null
  categorie: CategoriaMagazzino[]
  fornitori: Fornitore[]
}

const emptyForm = (): ProdottoInput => ({
  codice: '',
  nome: '',
  descrizione: '',
  categoria_id: undefined,
  unita_misura: 'pz',
  prezzo_acquisto: null,
  fornitore_principale_id: null,
  soglia_minima: null,
  soglia_abilitata: false,
  foto_url: null,
  dxf_url: null,
  note: '',
})

export default function DialogProdotto({ open, onOpenChange, prodotto, categorie, fornitori }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<ProdottoInput>(emptyForm())
  const [fotoSignedUrl, setFotoSignedUrl] = useState<string | null>(null)
  const [dxfSignedUrl, setDxfSignedUrl] = useState<string | null>(null)
  const [varianti, setVarianti] = useState<VarianteInput[]>([])
  const [variantiToDelete, setVariantiToDelete] = useState<string[]>([])
  const [newVariantNome, setNewVariantNome] = useState('')
  const [newVariantCodice, setNewVariantCodice] = useState('')
  const [showDxfViewer, setShowDxfViewer] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    if (prodotto) {
      setForm({
        codice: prodotto.codice,
        nome: prodotto.nome,
        descrizione: prodotto.descrizione ?? '',
        categoria_id: prodotto.categoria_id ?? undefined,
        unita_misura: prodotto.unita_misura,
        prezzo_acquisto: prodotto.prezzo_acquisto,
        fornitore_principale_id: prodotto.fornitore_principale_id,
        soglia_minima: prodotto.soglia_minima,
        soglia_abilitata: prodotto.soglia_abilitata,
        foto_url: prodotto.foto_url,
        dxf_url: prodotto.dxf_url,
        note: prodotto.note ?? '',
      })
      setVarianti(prodotto.varianti.map((v) => ({ id: v.id, nome: v.nome, codice_variante: v.codice_variante ?? '' })))
      setVariantiToDelete([])

      // load signed URLs for existing files
      const loadUrls = async () => {
        if (prodotto.foto_url) {
          const url = await getMagazzinoSignedUrl(prodotto.foto_url).catch(() => null)
          setFotoSignedUrl(url)
        } else {
          setFotoSignedUrl(null)
        }
        if (prodotto.dxf_url) {
          const url = await getMagazzinoSignedUrl(prodotto.dxf_url).catch(() => null)
          setDxfSignedUrl(url)
        } else {
          setDxfSignedUrl(null)
        }
      }
      loadUrls()
    } else {
      setForm(emptyForm())
      setFotoSignedUrl(null)
      setDxfSignedUrl(null)
      setVarianti([])
      setVariantiToDelete([])
    }
    setNewVariantNome('')
    setNewVariantCodice('')
    setShowDxfViewer(false)
  }, [open, prodotto])

  const set = (k: keyof ProdottoInput) => (v: unknown) =>
    setForm((f) => ({ ...f, [k]: v }))

  const addVariante = () => {
    const nome = newVariantNome.trim()
    if (!nome) return
    setVarianti((v) => [...v, { nome, codice_variante: newVariantCodice.trim() || undefined }])
    setNewVariantNome('')
    setNewVariantCodice('')
  }

  const removeVariante = (index: number) => {
    const v = varianti[index]
    if (v.id) setVariantiToDelete((d) => [...d, v.id!])
    setVarianti((list) => list.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.codice.trim() || !form.nome.trim()) {
      toast.error('Codice e nome sono obbligatori')
      return
    }
    setLoading(true)
    try {
      if (prodotto) {
        await updateProdotto(prodotto.id, form, varianti, variantiToDelete)
        toast.success('Prodotto aggiornato')
      } else {
        await createProdotto(form, varianti)
        toast.success('Prodotto creato')
      }
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{prodotto ? 'Modifica prodotto' : 'Nuovo prodotto'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Dati base */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dati base</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="codice">Codice *</Label>
                <Input id="codice" value={form.codice} onChange={(e) => set('codice')(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nome">Nome *</Label>
                <Input id="nome" value={form.nome} onChange={(e) => set('nome')(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="descr">Descrizione</Label>
              <Input id="descr" value={form.descrizione ?? ''} onChange={(e) => set('descrizione')(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select
                  value={form.categoria_id ?? ''}
                  onValueChange={(v) => set('categoria_id')(v || undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorie.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Unità di misura *</Label>
                <Select
                  value={form.unita_misura}
                  onValueChange={(v) => set('unita_misura')(v as UnitaMisura)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(UNITA_MISURA_LABELS) as [UnitaMisura, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Prezzi e fornitore */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Commerciale</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="prezzo">Prezzo acquisto (€)</Label>
                <Input
                  id="prezzo"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={form.prezzo_acquisto ?? ''}
                  onChange={(e) => set('prezzo_acquisto')(e.target.value ? parseFloat(e.target.value) : null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fornitore principale</Label>
                <Select
                  value={form.fornitore_principale_id ?? '__none__'}
                  onValueChange={(v) => set('fornitore_principale_id')(v === '__none__' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Nessuno" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nessuno</SelectItem>
                    {fornitori.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="soglia-switch"
                checked={form.soglia_abilitata}
                onCheckedChange={(v) => set('soglia_abilitata')(v)}
              />
              <Label htmlFor="soglia-switch">Scorta minima</Label>
              {form.soglia_abilitata && (
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  className="w-32 ml-2"
                  placeholder="Quantità"
                  value={form.soglia_minima ?? ''}
                  onChange={(e) => set('soglia_minima')(e.target.value ? parseFloat(e.target.value) : null)}
                />
              )}
            </div>
          </div>

          {/* File allegati */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">File allegati</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Foto prodotto</Label>
                <UploadFile
                  tipo="foto"
                  storagePath={form.foto_url ?? null}
                  signedUrl={fotoSignedUrl}
                  onUploaded={(path, url) => { set('foto_url')(path); setFotoSignedUrl(url) }}
                  onRemoved={() => { set('foto_url')(null); setFotoSignedUrl(null) }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>File DXF</Label>
                <UploadFile
                  tipo="dxf"
                  storagePath={form.dxf_url ?? null}
                  signedUrl={dxfSignedUrl}
                  onUploaded={(path, url) => { set('dxf_url')(path); setDxfSignedUrl(url) }}
                  onRemoved={() => { set('dxf_url')(null); setDxfSignedUrl(null) }}
                />
                {dxfSignedUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => setShowDxfViewer((v) => !v)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {showDxfViewer ? 'Chiudi preview' : 'Visualizza DXF'}
                  </Button>
                )}
              </div>
            </div>
            {showDxfViewer && dxfSignedUrl && (
              <DxfViewer signedUrl={dxfSignedUrl} fileName={form.dxf_url?.split('/').pop()} />
            )}
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label htmlFor="note">Note</Label>
            <Input id="note" value={form.note ?? ''} onChange={(e) => set('note')(e.target.value)} />
          </div>

          {/* Varianti colore */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Varianti colore / finitura
            </p>
            {varianti.length > 0 && (
              <div className="space-y-1.5">
                {varianti.map((v, i) => (
                  <div key={v.id ?? i} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <span className="flex-1 font-medium">{v.nome}</span>
                    {v.codice_variante && <span className="text-gray-400 text-xs">{v.codice_variante}</span>}
                    <button
                      type="button"
                      onClick={() => removeVariante(i)}
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="Nome colore (es. RAL 9010)"
                value={newVariantNome}
                onChange={(e) => setNewVariantNome(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addVariante())}
                className="flex-1"
              />
              <Input
                placeholder="Codice"
                value={newVariantCodice}
                onChange={(e) => setNewVariantCodice(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addVariante())}
                className="w-28"
              />
              <Button type="button" variant="outline" size="icon" onClick={addVariante}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvataggio...' : prodotto ? 'Salva' : 'Crea'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
