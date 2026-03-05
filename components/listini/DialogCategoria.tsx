'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Upload, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createCategoria, updateCategoria, getCurrentOrgId } from '@/actions/listini'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import IconaCategoria from './IconaCategoria'
import FormFiniture, { type FinituraInput } from './FormFiniture'
import type { Categoria, TipoCategoria } from '@/types/listino'

const EMOJIS = [
  '📂','🪟','🚪','🏠','🏗️','🔩','🪵','🏢',
  '🛡️','🌿','🔳','⬛','🎯','🏘️','🏛️','💡',
  '🔆','🔵','🟦','✅','🔶','🔷','🟩','🟥',
]

type Mode = 'emoji' | 'immagine'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  categoria?: Categoria & { finiture_categoria?: { nome: string; aumento_percentuale: number; aumento_euro: number }[] }
  onSuccess: () => void
}

async function resizeToIcon(file: File): Promise<{ blob: Blob; preview: string }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      const SIZE = 128
      const canvas = document.createElement('canvas')
      canvas.width = SIZE
      canvas.height = SIZE
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(objectUrl)
        return reject(new Error('Canvas non disponibile'))
      }
      const min = Math.min(img.width, img.height)
      const sx = (img.width - min) / 2
      const sy = (img.height - min) / 2
      ctx.drawImage(img, sx, sy, min, min, 0, 0, SIZE, SIZE)
      URL.revokeObjectURL(objectUrl)
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Conversione immagine fallita'))
          resolve({ blob, preview: canvas.toDataURL('image/webp') })
        },
        'image/webp',
        0.85
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Immagine non valida'))
    }
    img.src = objectUrl
  })
}

function initFiniture(categoria?: Props['categoria']): FinituraInput[] {
  return (categoria?.finiture_categoria ?? []).map((f) => ({
    nome: f.nome,
    aumento: f.aumento_percentuale,
    aumento_euro: f.aumento_euro,
  }))
}

export default function DialogCategoria({ open, onOpenChange, categoria, onSuccess }: Props) {
  // Tab Generale
  const [tipo, setTipo] = useState<TipoCategoria>(
    (categoria as (Categoria & { tipo?: TipoCategoria }) | undefined)?.tipo ?? 'griglia'
  )
  const [nome, setNome] = useState(categoria?.nome ?? '')
  const [icona, setIcona] = useState(categoria?.icona ?? '📂')
  const [mode, setMode] = useState<Mode>(
    categoria?.icona?.startsWith('http') ? 'immagine' : 'emoji'
  )
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(
    categoria?.icona?.startsWith('http') ? (categoria.icona ?? null) : null
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Tab Finiture
  const [finiture, setFiniture] = useState<FinituraInput[]>(initFiniture(categoria))

  // Tab Prezzi & Regole
  const [trasportoCostoUnitario, setTrasportoCostoUnitario] = useState(
    categoria?.trasporto_costo_unitario ?? 0
  )
  const [trasportoCostoMinimo, setTrasportoCostoMinimo] = useState(
    categoria?.trasporto_costo_minimo ?? 0
  )
  const [trasportoMinimoPezzi, setTrasportoMinimoPezzi] = useState(
    categoria?.trasporto_minimo_pezzi ?? 0
  )
  const [scontoFornitore, setScontoFornitore] = useState(categoria?.sconto_fornitore ?? 0)
  const [scontoMassimo, setScontoMassimo] = useState(categoria?.sconto_massimo ?? 50)

  const [saving, setSaving] = useState(false)

  const handleOpenChange = (val: boolean) => {
    if (val) {
      setTipo((categoria as (Categoria & { tipo?: TipoCategoria }) | undefined)?.tipo ?? 'griglia')
      setNome(categoria?.nome ?? '')
      const isUrl = categoria?.icona?.startsWith('http') ?? false
      setIcona(categoria?.icona ?? '📂')
      setMode(isUrl ? 'immagine' : 'emoji')
      setImageBlob(null)
      setImagePreview(isUrl ? (categoria?.icona ?? null) : null)
      setFiniture(initFiniture(categoria))
      setTrasportoCostoUnitario(categoria?.trasporto_costo_unitario ?? 0)
      setTrasportoCostoMinimo(categoria?.trasporto_costo_minimo ?? 0)
      setTrasportoMinimoPezzi(categoria?.trasporto_minimo_pezzi ?? 0)
      setScontoFornitore(categoria?.sconto_fornitore ?? 0)
      setScontoMassimo(categoria?.sconto_massimo ?? 50)
    }
    onOpenChange(val)
  }

  const handleModeSwitch = (next: Mode) => {
    setMode(next)
    if (next === 'emoji') {
      setImageBlob(null)
      setImagePreview(null)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileInputRef.current) fileInputRef.current.value = ''
    try {
      const { blob, preview } = await resizeToIcon(file)
      setImageBlob(blob)
      setImagePreview(preview)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore nel caricamento immagine')
    }
  }

  const handleSave = async () => {
    if (!nome.trim()) {
      toast.error('Inserisci il nome della categoria')
      return
    }
    if (mode === 'immagine' && !imagePreview) {
      toast.error("Seleziona un'immagine oppure passa alla modalità Emoji")
      return
    }
    const finitureInvalide = finiture.filter((f) => !f.nome.trim())
    if (finitureInvalide.length > 0) {
      toast.error('Alcune finiture hanno il nome vuoto')
      return
    }

    setSaving(true)
    try {
      let iconaFinale = icona

      if (mode === 'immagine') {
        if (imageBlob) {
          const orgId = await getCurrentOrgId()
          const supabase = createClient()
          const fileName = `${orgId}/${crypto.randomUUID()}.webp`
          const { data, error } = await supabase.storage
            .from('categorie-icone')
            .upload(fileName, imageBlob, { contentType: 'image/webp' })
          if (error) throw new Error('Errore upload: ' + error.message)
          const { data: { publicUrl } } = supabase.storage
            .from('categorie-icone')
            .getPublicUrl(data.path)
          iconaFinale = publicUrl
        } else {
          iconaFinale = icona
        }
      }

      const payload = {
        nome: nome.trim(),
        icona: iconaFinale,
        tipo,
        trasporto_costo_unitario: trasportoCostoUnitario,
        trasporto_costo_minimo: trasportoCostoMinimo,
        trasporto_minimo_pezzi: trasportoMinimoPezzi,
        sconto_fornitore: scontoFornitore,
        sconto_massimo: scontoMassimo,
        finiture_categoria: finiture.map((f) => ({
          nome: f.nome.trim(),
          aumento_percentuale: f.aumento,
          aumento_euro: f.aumento_euro,
        })),
      }

      if (categoria) {
        await updateCategoria(categoria.id, payload)
        toast.success('Categoria aggiornata')
      } else {
        await createCategoria(payload)
        toast.success('Categoria creata')
      }
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{categoria ? 'Modifica categoria' : 'Nuova categoria'}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="generale" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="generale" className="flex-1">Generale</TabsTrigger>
            <TabsTrigger value="finiture" className="flex-1">Finiture</TabsTrigger>
            <TabsTrigger value="regole" className="flex-1">Prezzi & Regole</TabsTrigger>
          </TabsList>

          {/* ── Tab Generale ─────────────────────────────────── */}
          <TabsContent value="generale" className="space-y-4 pt-2">
            {/* Tipo categoria — solo in creazione */}
            {!categoria && (
              <div className="space-y-1.5">
                <Label>Tipo categoria</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTipo('griglia')}
                    className={`flex-1 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors text-left ${
                      tipo === 'griglia'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-semibold">📐 Griglia prezzi</div>
                    <div className="text-xs font-normal text-gray-500 mt-0.5">
                      Prezzi calcolati su larghezza × altezza
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipo('libero')}
                    className={`flex-1 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors text-left ${
                      tipo === 'libero'
                        ? 'border-teal-500 bg-teal-50 text-teal-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-semibold">📦 Catalogo prodotti</div>
                    <div className="text-xs font-normal text-gray-500 mt-0.5">
                      Prodotti con prezzo fisso e accessori
                    </div>
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="es. Finestre PVC"
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
            </div>

            <div className="space-y-2">
              <Label>Icona</Label>

              {/* Switcher Emoji / Immagine */}
              <div className="flex rounded-md border overflow-hidden w-fit text-sm">
                <button
                  type="button"
                  onClick={() => handleModeSwitch('emoji')}
                  className={`px-3 py-1.5 transition-colors ${
                    mode === 'emoji'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Emoji
                </button>
                <button
                  type="button"
                  onClick={() => handleModeSwitch('immagine')}
                  className={`px-3 py-1.5 transition-colors border-l ${
                    mode === 'immagine'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Immagine
                </button>
              </div>

              {mode === 'emoji' && (
                <div className="flex flex-wrap gap-2">
                  {EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setIcona(emoji)}
                      className={`text-xl w-9 h-9 rounded-md border transition-colors ${
                        icona === emoji
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {mode === 'immagine' && (
                <div className="space-y-2">
                  {imagePreview ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={imagePreview}
                        alt=""
                        className="w-16 h-16 rounded-md object-cover border border-gray-200"
                      />
                      <div className="space-y-1">
                        <p className="text-xs text-gray-500">128 × 128 px</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => { setImageBlob(null); setImagePreview(null) }}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Rimuovi
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="flex flex-col items-center justify-center h-24 w-full rounded-md border-2 border-dashed border-gray-300 bg-gray-50 cursor-pointer hover:border-gray-400 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-5 w-5 text-gray-400 mb-1" />
                      <span className="text-xs text-gray-500">Clicca per selezionare</span>
                      <span className="text-xs text-gray-400 mt-0.5">
                        PNG, JPG, WEBP — ridimensionata a 128 × 128
                      </span>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  {!imagePreview && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      Scegli immagine
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Anteprima */}
            <div className="flex items-center gap-2 pt-1 text-sm text-gray-500">
              {mode === 'immagine' && imagePreview ? (
                <img src={imagePreview} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
              ) : (
                <IconaCategoria icona={icona} size="lg" />
              )}
              <span>{nome || 'Nuova categoria'}</span>
            </div>
          </TabsContent>

          {/* ── Tab Finiture ─────────────────────────────────── */}
          <TabsContent value="finiture" className="pt-2 space-y-3">
            <p className="text-xs text-gray-500">
              Queste finiture sono condivise da tutti i listini della categoria.
              I singoli listini possono aggiungerne di specifiche.
            </p>
            <FormFiniture finiture={finiture} onChange={setFiniture} />
          </TabsContent>

          {/* ── Tab Prezzi & Regole ───────────────────────────── */}
          <TabsContent value="regole" className="pt-2 space-y-5">

            {/* Trasporto */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Trasporto</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Costo per pezzo</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={trasportoCostoUnitario}
                      onChange={(e) => setTrasportoCostoUnitario(parseFloat(e.target.value) || 0)}
                      className="text-right"
                    />
                    <span className="text-xs text-gray-400 shrink-0">€</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Costo minimo</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={trasportoCostoMinimo}
                      onChange={(e) => setTrasportoCostoMinimo(parseFloat(e.target.value) || 0)}
                      className="text-right"
                    />
                    <span className="text-xs text-gray-400 shrink-0">€</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Fino a pezzi</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={trasportoMinimoPezzi}
                    onChange={(e) => setTrasportoMinimoPezzi(parseInt(e.target.value) || 0)}
                    className="text-right"
                  />
                </div>
              </div>
              {trasportoCostoMinimo > 0 && trasportoMinimoPezzi > 0 && (
                <p className="text-xs text-gray-400">
                  Fino a {trasportoMinimoPezzi} pz → €{trasportoCostoMinimo} fissi
                  {trasportoCostoUnitario > 0 && ` · oltre → €${trasportoCostoMinimo} + €${trasportoCostoUnitario}/pz extra`}
                </p>
              )}
            </div>

            {/* Sconti */}
            <div className="space-y-3 border-t pt-4">
              <p className="text-sm font-medium text-gray-700">Sconti</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Sconto acquisto fornitore</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={scontoFornitore}
                      onChange={(e) => setScontoFornitore(parseFloat(e.target.value) || 0)}
                      className="text-right"
                    />
                    <span className="text-xs text-gray-400 shrink-0">%</span>
                  </div>
                  <p className="text-xs text-gray-400">Solo uso interno — non appare nel preventivo</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Sconto massimo applicabile</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={scontoMassimo}
                      onChange={(e) => setScontoMassimo(parseFloat(e.target.value) || 0)}
                      className="text-right"
                    />
                    <span className="text-xs text-gray-400 shrink-0">%</span>
                  </div>
                  <p className="text-xs text-gray-400">Limite massimo negli articoli del preventivo</p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvataggio...' : categoria ? 'Aggiorna' : 'Crea'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
