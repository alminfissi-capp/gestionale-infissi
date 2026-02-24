'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Upload, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createCategoria, updateCategoria, getCurrentOrgId } from '@/actions/listini'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import IconaCategoria from './IconaCategoria'
import type { Categoria } from '@/types/listino'

const EMOJIS = [
  '📂','🪟','🚪','🏠','🏗️','🔩','🪵','🏢',
  '🛡️','🌿','🔳','⬛','🎯','🏘️','🏛️','💡',
  '🔆','🔵','🟦','✅','🔶','🔷','🟩','🟥',
]

type Mode = 'emoji' | 'immagine'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  categoria?: Categoria
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

export default function DialogCategoria({ open, onOpenChange, categoria, onSuccess }: Props) {
  const [nome, setNome] = useState(categoria?.nome ?? '')
  const [icona, setIcona] = useState(categoria?.icona ?? '📂')
  const [mode, setMode] = useState<Mode>(
    categoria?.icona?.startsWith('http') ? 'immagine' : 'emoji'
  )
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(
    categoria?.icona?.startsWith('http') ? (categoria.icona ?? null) : null
  )
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleOpenChange = (val: boolean) => {
    if (val) {
      setNome(categoria?.nome ?? '')
      const isUrl = categoria?.icona?.startsWith('http') ?? false
      setIcona(categoria?.icona ?? '📂')
      setMode(isUrl ? 'immagine' : 'emoji')
      setImageBlob(null)
      setImagePreview(isUrl ? (categoria?.icona ?? null) : null)
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

  const handleRemoveImage = () => {
    setImageBlob(null)
    setImagePreview(null)
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

    setSaving(true)
    try {
      let iconaFinale = icona

      if (mode === 'immagine') {
        if (imageBlob) {
          // Nuova immagine da caricare
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
          // Nessun nuovo file: mantieni l'URL esistente
          iconaFinale = icona
        }
      }

      if (categoria) {
        await updateCategoria(categoria.id, { nome: nome.trim(), icona: iconaFinale })
        toast.success('Categoria aggiornata')
      } else {
        await createCategoria({ nome: nome.trim(), icona: iconaFinale })
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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{categoria ? 'Modifica categoria' : 'Nuova categoria'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Nome */}
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="es. Finestre PVC"
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>

          {/* Icona */}
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

            {/* Grid emoji */}
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

            {/* Upload immagine */}
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
                        onClick={handleRemoveImage}
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
        </div>

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
