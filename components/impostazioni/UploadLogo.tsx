'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import { Upload, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { saveLogoUrl } from '@/actions/impostazioni'
import { Button } from '@/components/ui/button'

interface Props {
  orgId: string
  currentLogoUrl: string | null // URL firmato per visualizzazione
  currentLogoPath: string | null // Percorso storage (es: "org-id/logo.png")
}

export default function UploadLogo({ orgId, currentLogoUrl, currentLogoPath }: Props) {
  const [preview, setPreview] = useState<string | null>(currentLogoUrl)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validazione client-side
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Il logo non può superare 2MB')
      return
    }
    if (!['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'].includes(file.type)) {
      toast.error('Formato non supportato. Usa PNG, JPG, SVG o WEBP.')
      return
    }

    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${orgId}/logo.${ext}`

      const supabase = createClient()
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError

      // Genera URL firmato per anteprima immediata
      const { data: signedData } = await supabase.storage
        .from('logos')
        .createSignedUrl(path, 3600)

      await saveLogoUrl(path)
      setPreview(signedData?.signedUrl ?? null)
      toast.success('Logo caricato con successo')
    } catch (err) {
      console.error(err)
      toast.error('Errore nel caricamento del logo')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    if (!currentLogoPath) return
    setUploading(true)
    try {
      const supabase = createClient()
      await supabase.storage.from('logos').remove([currentLogoPath])
      await saveLogoUrl(null)
      setPreview(null)
      toast.success('Logo rimosso')
    } catch {
      toast.error('Errore nella rimozione del logo')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      {preview ? (
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-40 rounded-md border border-gray-200 bg-gray-50 overflow-hidden">
            <Image src={preview} alt="Logo aziendale" fill className="object-contain p-2" />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRemove}
            disabled={uploading}
            className="text-red-600 hover:text-red-700"
          >
            <X className="h-4 w-4 mr-1" />
            Rimuovi
          </Button>
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center h-28 w-56 rounded-md border-2 border-dashed border-gray-300 bg-gray-50 cursor-pointer hover:border-gray-400 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-6 w-6 text-gray-400 mb-1" />
          <span className="text-sm text-gray-500">Carica logo</span>
          <span className="text-xs text-gray-400 mt-0.5">PNG, JPG, SVG — max 2MB</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="hidden"
        onChange={handleFileChange}
        disabled={uploading}
      />

      {!preview && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="h-4 w-4 mr-1" />
          {uploading ? 'Caricamento...' : 'Scegli file'}
        </Button>
      )}
    </div>
  )
}
