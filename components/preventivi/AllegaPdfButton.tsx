'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileUp, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { getCurrentOrgId } from '@/actions/listini'
import { addAllegatoPdf } from '@/actions/preventivi'

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

interface Props {
  preventivoId: string
}

export default function AllegaPdfButton({ preventivoId }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)

  const handleFiles = async (files: FileList) => {
    setLoading(true)
    try {
      const supabase = createClient()
      const orgId = await getCurrentOrgId()
      let caricati = 0

      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
          toast.error(`"${file.name}" non è un PDF`)
          continue
        }
        if (file.size > MAX_SIZE) {
          toast.error(`"${file.name}" supera i 10 MB`)
          continue
        }
        const path = `${orgId}/${preventivoId}/allegati/${crypto.randomUUID()}.pdf`
        const { error: uploadErr } = await supabase.storage
          .from('preventivi-allegati')
          .upload(path, file, { contentType: 'application/pdf' })
        if (uploadErr) {
          toast.error(`Errore caricamento "${file.name}"`)
          continue
        }
        await addAllegatoPdf(preventivoId, file.name.replace(/\.pdf$/i, ''), path)
        caricati++
      }

      if (caricati > 0) {
        toast.success(`${caricati} PDF allegato${caricati > 1 ? 'i' : ''}`)
        router.refresh()
      }
    } catch {
      toast.error("Errore durante il caricamento del PDF")
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files
          if (files && files.length > 0) handleFiles(files)
        }}
      />
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileUp className="h-3.5 w-3.5 mr-1" />}
        Allega PDF
      </Button>
    </>
  )
}
