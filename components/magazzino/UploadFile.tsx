'use client'

import { useRef, useState } from 'react'
import { Loader2, Upload, X, FileCode2, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { getCurrentOrgId } from '@/actions/magazzino'
import { toast } from 'sonner'

interface Props {
  tipo: 'foto' | 'dxf'
  storagePath: string | null
  signedUrl: string | null
  onUploaded: (path: string, signedUrl: string) => void
  onRemoved: () => void
}

export default function UploadFile({ tipo, storagePath, signedUrl, onUploaded, onRemoved }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const accept = tipo === 'foto' ? 'image/*' : '.dxf'
  const label = tipo === 'foto' ? 'Foto' : 'File DXF'
  const ext = tipo === 'foto' ? 'img' : 'dxf'

  const handleFile = async (file: File) => {
    if (tipo === 'dxf' && !file.name.toLowerCase().endsWith('.dxf')) {
      toast.error('Seleziona un file .dxf')
      return
    }
    setUploading(true)
    try {
      const orgId = await getCurrentOrgId()
      const supabase = createClient()
      const uniqueName = `${orgId}/${ext}/${crypto.randomUUID()}_${file.name}`

      const { error: upErr } = await supabase.storage
        .from('magazzino')
        .upload(uniqueName, file, { upsert: false })
      if (upErr) throw upErr

      // bucket pubblico → getPublicUrl è sincrono, nessuna scadenza
      const { data: pubData } = supabase.storage.from('magazzino').getPublicUrl(uniqueName)

      // if replacing, remove old file
      if (storagePath) {
        await supabase.storage.from('magazzino').remove([storagePath])
      }

      onUploaded(uniqueName, pubData.publicUrl)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore upload')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      {signedUrl ? (
        <div className="relative rounded-lg border overflow-hidden bg-gray-50">
          {tipo === 'foto' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signedUrl} alt="Foto prodotto" className="w-full max-h-40 object-contain" />
          ) : (
            <div className="flex items-center gap-3 p-3">
              <FileCode2 className="h-8 w-8 text-blue-600 shrink-0" />
              <span className="text-sm text-gray-700 truncate flex-1">
                {storagePath?.split('/').pop() ?? 'file.dxf'}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={onRemoved}
            className="absolute top-1.5 right-1.5 p-1 rounded-full bg-white/90 shadow text-gray-500 hover:text-red-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 p-5 text-gray-400 cursor-pointer hover:border-blue-300 hover:text-blue-500 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          {tipo === 'foto' ? <ImageIcon className="h-7 w-7" /> : <FileCode2 className="h-7 w-7" />}
          <span className="text-xs">{label}</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full gap-2"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {uploading ? 'Caricamento...' : signedUrl ? `Sostituisci ${label}` : `Carica ${label}`}
      </Button>
    </div>
  )
}
