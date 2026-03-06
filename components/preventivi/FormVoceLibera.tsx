'use client'

import { useState, useRef } from 'react'
import { Plus, Camera, ImageIcon, FolderOpen, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getCurrentOrgId } from '@/actions/listini'
import { createClient } from '@/lib/supabase/client'
import { calcolaTotaleRiga, formatEuro } from '@/lib/pricing'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import ScontoSelect from './ScontoSelect'
import type { ArticoloWizard } from '@/types/preventivo'

/** Ridimensiona un'immagine mantenendo le proporzioni, max maxDim px su lato maggiore, formato WebP */
async function resizeImage(file: File, maxDim = 1200): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas error'))), 'image/webp', 0.85)
    }
    img.onerror = reject
    img.src = url
  })
}

interface Props {
  aliquote: number[]
  onAdd: (articolo: ArticoloWizard) => void
}

export default function FormVoceLibera({ aliquote, onAdd }: Props) {
  const [descrizione, setDescrizione] = useState('')
  const [prezzoUnitario, setPrezzoUnitario] = useState('')
  const [quantita, setQuantita] = useState('1')
  const [sconto, setSconto] = useState(0)
  const [aliquotaIva, setAliquotaIva] = useState<number | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const inputCameraRef = useRef<HTMLInputElement>(null)
  const inputGalleriaRef = useRef<HTMLInputElement>(null)
  const inputFileRef = useRef<HTMLInputElement>(null)

  const prezzo = parseFloat(prezzoUnitario) || 0
  const qty = Math.max(1, parseInt(quantita) || 1)
  const totaleRiga = calcolaTotaleRiga(prezzo, qty, sconto)

  const handleFileSelect = (file: File) => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setImageFile(file)
    setImagePreviewUrl(URL.createObjectURL(file))
  }

  const handleRemoveImage = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setImageFile(null)
    setImagePreviewUrl(null)
    if (inputCameraRef.current) inputCameraRef.current.value = ''
    if (inputGalleriaRef.current) inputGalleriaRef.current.value = ''
    if (inputFileRef.current) inputFileRef.current.value = ''
  }

  const canAdd = descrizione.trim().length > 0 && prezzo > 0 && qty > 0

  const handleAdd = async () => {
    if (!canAdd) return
    setUploading(true)
    try {
      let immagineUrl: string | null = null
      if (imageFile) {
        const blob = await resizeImage(imageFile, 600)
        const orgId = await getCurrentOrgId()
        const supabase = createClient()
        const fileName = `${orgId}/${crypto.randomUUID()}.webp`
        const { error } = await supabase.storage
          .from('preventivi-allegati')
          .upload(fileName, blob, { contentType: 'image/webp', upsert: false })
        if (error) throw error
        const { data: { publicUrl } } = supabase.storage
          .from('preventivi-allegati')
          .getPublicUrl(fileName)
        immagineUrl = publicUrl
      }

      const articolo: ArticoloWizard = {
        tempId: crypto.randomUUID(),
        tipo: 'libera',
        listino_id: null,
        listino_libero_id: null,
        prodotto_id: null,
        accessori_selezionati: null,
        tipologia: descrizione.trim(),
        categoria_nome: null,
        larghezza_mm: null,
        altezza_mm: null,
        larghezza_listino_mm: null,
        altezza_listino_mm: null,
        misura_arrotondata: false,
        finitura_nome: null,
        finitura_aumento: 0,
        finitura_aumento_euro: 0,
        immagine_url: immagineUrl,
        note: null,
        quantita: qty,
        prezzo_base: null,
        prezzo_unitario: prezzo,
        sconto_articolo: sconto,
        prezzo_totale_riga: totaleRiga,
        costo_acquisto_unitario: 0,
        costo_posa: 0,
        aliquota_iva: aliquotaIva,
        ordine: 0,
      }

      onAdd(articolo)

      // Reset
      setDescrizione('')
      setPrezzoUnitario('')
      setQuantita('1')
      setSconto(0)
      setAliquotaIva(null)
      handleRemoveImage()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore durante l\'aggiunta')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="rounded-lg border bg-white p-4 space-y-4">
      <p className="text-sm font-semibold text-gray-700">Aggiungi voce libera</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2 space-y-1.5">
          <Label>Descrizione</Label>
          <Input
            type="text"
            placeholder="es. Lavorazione speciale, Accessorio, Servizio..."
            value={descrizione}
            onChange={(e) => setDescrizione(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Prezzo unitario (€)</Label>
          <Input
            type="number"
            min={0}
            step={0.01}
            placeholder="es. 150.00"
            value={prezzoUnitario}
            onChange={(e) => setPrezzoUnitario(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Quantità</Label>
          <Input
            type="number"
            min={1}
            value={quantita}
            onChange={(e) => setQuantita(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Sconto</Label>
          <ScontoSelect value={sconto} onChange={setSconto} max={50} />
        </div>

        {aliquote.length > 0 && (
          <div className="space-y-1.5">
            <Label>IVA</Label>
            <Select
              value={aliquotaIva != null ? aliquotaIva.toString() : 'none'}
              onValueChange={(v) => setAliquotaIva(v === 'none' ? null : parseFloat(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {aliquote.map((a) => (
                  <SelectItem key={a} value={a.toString()}>{a}%</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Image picker */}
        <div className="space-y-1.5">
          <Label>Immagine (opzionale)</Label>
          {imagePreviewUrl ? (
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreviewUrl}
                alt="Anteprima"
                style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 4, border: '1px solid #e5e7eb' }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-gray-400 hover:text-red-500"
                onClick={handleRemoveImage}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => inputCameraRef.current?.click()}
              >
                <Camera className="h-3.5 w-3.5" />
                Fotocamera
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => inputGalleriaRef.current?.click()}
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Galleria
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => inputFileRef.current?.click()}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                File
              </Button>
            </div>
          )}
          {/* Hidden file inputs */}
          <input
            ref={inputCameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
          />
          <input
            ref={inputGalleriaRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
          />
          <input
            ref={inputFileRef}
            type="file"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
          />
        </div>
      </div>

      {/* Preview prezzo real-time */}
      {prezzo > 0 && (
        <div className="flex items-center justify-end gap-4 p-3 rounded-md bg-blue-50 text-sm">
          <span className="text-gray-700">
            Unitario: <strong>€ {formatEuro(prezzo)}</strong>
          </span>
          <span className="text-blue-800 font-semibold">
            Totale riga: € {formatEuro(totaleRiga)}
          </span>
        </div>
      )}

      <Button onClick={handleAdd} disabled={!canAdd || uploading} className="w-full sm:w-auto">
        {uploading ? (
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
        ) : (
          <Plus className="h-4 w-4 mr-1" />
        )}
        Aggiungi voce libera
      </Button>
    </div>
  )
}
