'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2, Eye, ChevronLeft } from 'lucide-react'
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
import { ComboboxField } from '@/components/ui/combobox-field'
import UploadFile from './UploadFile'
import DxfViewer from './DxfViewer'
import { createProdotto, updateProdotto } from '@/actions/magazzino'
import type { ProdottoConCategoria, ProdottoInput, VarianteInput } from '@/actions/magazzino'
import type { CategoriaMagazzino, Fornitore, UnitaMisura, PosizioneMagazzino, TipoCategoriaMagazzino } from '@/types/magazzino'
import { UNITA_MISURA_LABELS, CATEGORIE_CON_FINITURE, TIPO_CATEGORIA_LABELS } from '@/types/magazzino'

const MACRO_CONFIG: Record<TipoCategoriaMagazzino, { color: string; bg: string; border: string }> = {
  alluminio: { color: 'text-blue-700', bg: 'bg-blue-50 hover:bg-blue-100', border: 'border-blue-200 hover:border-blue-400' },
  ferro:     { color: 'text-slate-700', bg: 'bg-slate-50 hover:bg-slate-100', border: 'border-slate-300 hover:border-slate-500' },
  accessori: { color: 'text-purple-700', bg: 'bg-purple-50 hover:bg-purple-100', border: 'border-purple-200 hover:border-purple-400' },
  pannelli:  { color: 'text-green-700', bg: 'bg-green-50 hover:bg-green-100', border: 'border-green-200 hover:border-green-400' },
  chimici:   { color: 'text-orange-700', bg: 'bg-orange-50 hover:bg-orange-100', border: 'border-orange-200 hover:border-orange-400' },
  viteria:   { color: 'text-amber-700', bg: 'bg-amber-50 hover:bg-amber-100', border: 'border-amber-200 hover:border-amber-400' },
}

const TIPI_ORDINATI: TipoCategoriaMagazzino[] = ['alluminio', 'ferro', 'accessori', 'pannelli', 'chimici', 'viteria']

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  prodotto?: ProdottoConCategoria | null
  categorie: CategoriaMagazzino[]
  fornitori: Fornitore[]
  posizioni: PosizioneMagazzino[]
}

const emptyForm = (): ProdottoInput => ({
  codice: '',
  nome: '',
  descrizione: '',
  categoria_id: undefined,
  unita_misura: 'pz',
  prezzo_acquisto: null,
  peso_al_metro: null,
  lunghezza_default: null,
  posizione_id: null,
  fornitore_principale_id: null,
  soglia_minima: null,
  soglia_abilitata: false,
  foto_url: null,
  dxf_url: null,
  note: '',
})

export default function DialogProdotto({ open, onOpenChange, prodotto, categorie, fornitori, posizioni }: Props) {
  const router = useRouter()
  const [selectedMacro, setSelectedMacro] = useState<TipoCategoriaMagazzino | null>(null)
  const [form, setForm] = useState<ProdottoInput>(emptyForm())
  const [fotoSignedUrl, setFotoSignedUrl] = useState<string | null>(null)
  const [dxfSignedUrl, setDxfSignedUrl] = useState<string | null>(null)
  const [varianti, setVarianti] = useState<VarianteInput[]>([])
  const [variantiToDelete, setVariantiToDelete] = useState<string[]>([])
  const [newVariantNome, setNewVariantNome] = useState('')
  const [newVariantCodice, setNewVariantCodice] = useState('')
  const [showDxfViewer, setShowDxfViewer] = useState(false)
  const [loading, setLoading] = useState(false)

  // Categorie filtrate per macrocategoria selezionata
  const categorieFiltrate = selectedMacro
    ? categorie.filter((c) => c.tipo === selectedMacro)
    : categorie

  const selectedCategoria = categorie.find((c) => c.id === form.categoria_id)
  const showCampiProfilo = selectedCategoria && CATEGORIE_CON_FINITURE.includes(selectedCategoria.tipo)

  // Step 0 = picker macrocategoria (solo nuovo prodotto)
  const showMacroPicker = !prodotto && selectedMacro === null

  useEffect(() => {
    if (!open) return
    if (prodotto) {
      // Modifica: ricava la macro dalla categoria del prodotto
      const macroDaProdotto = prodotto.categoria?.tipo ?? null
      setSelectedMacro(macroDaProdotto as TipoCategoriaMagazzino | null)
      setForm({
        codice: prodotto.codice,
        nome: prodotto.nome,
        descrizione: prodotto.descrizione ?? '',
        categoria_id: prodotto.categoria_id ?? undefined,
        unita_misura: prodotto.unita_misura,
        prezzo_acquisto: prodotto.prezzo_acquisto,
        peso_al_metro: prodotto.peso_al_metro,
        lunghezza_default: prodotto.lunghezza_default,
        posizione_id: prodotto.posizione_id,
        fornitore_principale_id: prodotto.fornitore_principale_id,
        soglia_minima: prodotto.soglia_minima,
        soglia_abilitata: prodotto.soglia_abilitata,
        foto_url: prodotto.foto_url,
        dxf_url: prodotto.dxf_url,
        note: prodotto.note ?? '',
      })
      setVarianti(prodotto.varianti.map((v) => ({ id: v.id, nome: v.nome, codice_variante: v.codice_variante ?? '' })))
      setVariantiToDelete([])

      const base = process.env.NEXT_PUBLIC_SUPABASE_URL
      const toUrl = (path: string | null) =>
        path ? `${base}/storage/v1/object/public/magazzino/${path}` : null
      setFotoSignedUrl(toUrl(prodotto.foto_url))
      setDxfSignedUrl(toUrl(prodotto.dxf_url))
    } else {
      setSelectedMacro(null)
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

  // Reset categoria_id se cambia macro (solo in creazione)
  const handleMacroSelect = (macro: TipoCategoriaMagazzino) => {
    setSelectedMacro(macro)
    setForm((f) => ({ ...f, categoria_id: undefined }))
  }

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
          <DialogTitle>
            {prodotto
              ? 'Modifica prodotto'
              : showMacroPicker
                ? 'Nuovo prodotto — Seleziona categoria'
                : `Nuovo prodotto — ${TIPO_CATEGORIA_LABELS[selectedMacro!]}`}
          </DialogTitle>
        </DialogHeader>

        {/* Step 0: picker macrocategoria */}
        {showMacroPicker ? (
          <div className="py-2">
            <p className="text-sm text-gray-500 mb-5">In quale categoria rientra il prodotto?</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {TIPI_ORDINATI.map((tipo) => {
                const cfg = MACRO_CONFIG[tipo]
                const count = categorie.filter((c) => c.tipo === tipo).length
                return (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => handleMacroSelect(tipo)}
                    className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-5 text-center transition-colors ${cfg.bg} ${cfg.border}`}
                  >
                    <span className={`font-semibold text-sm ${cfg.color}`}>
                      {TIPO_CATEGORIA_LABELS[tipo]}
                    </span>
                    <span className="text-xs text-gray-400">
                      {count === 0 ? 'Nessuna sottocategoria' : `${count} sottocategor${count === 1 ? 'ia' : 'ie'}`}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          /* Form prodotto */
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Breadcrumb macro (solo nuovo) */}
            {!prodotto && selectedMacro && (
              <button
                type="button"
                onClick={() => setSelectedMacro(null)}
                className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 -mt-1"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Cambia categoria
              </button>
            )}

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
                  <Label>Sottocategoria</Label>
                  <ComboboxField
                    options={categorieFiltrate.map((c) => ({ value: c.id, label: c.nome }))}
                    value={form.categoria_id ?? ''}
                    onChange={(v) => set('categoria_id')(v || undefined)}
                    placeholder="Seleziona sottocategoria"
                    searchPlaceholder="Cerca sottocategoria..."
                    emptyText="Nessuna sottocategoria trovata"
                  />
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

              {/* Posizione */}
              <div className="space-y-1.5">
                <Label>Posizione in magazzino</Label>
                <ComboboxField
                  options={[
                    { value: '__none__', label: 'Non assegnata' },
                    ...posizioni.map((p) => ({ value: p.id, label: p.nome, sublabel: p.descrizione ?? undefined })),
                  ]}
                  value={form.posizione_id ?? '__none__'}
                  onChange={(v) => set('posizione_id')(v === '__none__' ? null : v)}
                  placeholder="Non assegnata"
                  searchPlaceholder="Cerca posizione..."
                />
              </div>
            </div>

            {/* Parametri profilo (alluminio/ferro) */}
            {showCampiProfilo && (
              <div className="space-y-3 rounded-lg border p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Parametri profilo</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="peso_al_metro">Peso al metro (kg/m)</Label>
                    <Input
                      id="peso_al_metro"
                      type="number"
                      step="0.0001"
                      min="0"
                      value={form.peso_al_metro ?? ''}
                      onChange={(e) => set('peso_al_metro')(e.target.value ? parseFloat(e.target.value) : null)}
                      placeholder="es. 1.250"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lunghezza_default">Lunghezza barra (mm)</Label>
                    <Input
                      id="lunghezza_default"
                      type="number"
                      step="1"
                      min="0"
                      value={form.lunghezza_default ?? ''}
                      onChange={(e) => set('lunghezza_default')(e.target.value ? parseFloat(e.target.value) : null)}
                      placeholder="es. 6000"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  Il prezzo sarà calcolato automaticamente al momento del carico in base alla finitura selezionata.
                </p>
              </div>
            )}

            {/* Commerciale */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Commerciale</p>
              <div className="grid grid-cols-2 gap-3">
                {!showCampiProfilo && (
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
                )}
                <div className="space-y-1.5">
                  <Label>Fornitore principale</Label>
                  <ComboboxField
                    options={[
                      { value: '__none__', label: 'Nessuno' },
                      ...fornitori.map((f) => ({ value: f.id, label: f.nome })),
                    ]}
                    value={form.fornitore_principale_id ?? '__none__'}
                    onChange={(v) => set('fornitore_principale_id')(v === '__none__' ? null : v)}
                    searchPlaceholder="Cerca fornitore..."
                  />
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
        )}
      </DialogContent>
    </Dialog>
  )
}
