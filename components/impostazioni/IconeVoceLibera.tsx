'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Upload, Trash2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { resizeImage, nomeDaFile, MAX_DIM_ICONA } from '@/lib/immagini'
import { BUCKET_ICONE, urlIcona, nuovoPathIcona } from '@/lib/icone-preventivo'
import {
  createIconePreventivo,
  renameIconaPreventivo,
  deleteIconaPreventivo,
} from '@/actions/icone-preventivo'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { IconaPreventivo } from '@/types/impostazioni'

interface Props {
  orgId: string
  icone: IconaPreventivo[]
}

export default function IconeVoceLibera({ orgId, icone }: Props) {
  const router = useRouter()
  const [caricando, setCaricando] = useState(false)
  const [eliminando, setEliminando] = useState<string | null>(null)

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // cosi' lo stesso file si puo' riscegliere dopo un errore
    if (files.length === 0) return

    setCaricando(true)
    try {
      const supabase = createClient()
      const nuove: { nome: string; storage_path: string }[] = []
      const falliti: string[] = []

      for (const file of files) {
        try {
          // Il resize decodifica il file: da qui in poi e' in memoria per intero,
          // anche quando arriva da iCloud o Drive e il browser lo carica pigro.
          const blob = await resizeImage(file, MAX_DIM_ICONA)
          const path = nuovoPathIcona(orgId)
          const { error } = await supabase.storage
            .from(BUCKET_ICONE)
            .upload(path, blob, { contentType: 'image/webp', upsert: false })
          if (error) throw error
          nuove.push({ nome: nomeDaFile(file.name), storage_path: path })
        } catch {
          falliti.push(file.name)
        }
      }

      // Le riuscite si registrano comunque: un file rotto in mezzo a dieci non
      // deve far ricominciare da capo.
      if (nuove.length > 0) {
        await createIconePreventivo(nuove)
        toast.success(nuove.length === 1 ? 'Icona aggiunta' : `${nuove.length} icone aggiunte`)
        router.refresh()
      }
      if (falliti.length > 0) {
        toast.error(`Non caricate: ${falliti.join(', ')}`)
      }
    } catch {
      toast.error('Errore nel caricamento')
    } finally {
      setCaricando(false)
    }
  }

  const handleRename = async (icona: IconaPreventivo, nome: string) => {
    if (nome.trim() === icona.nome) return
    try {
      await renameIconaPreventivo(icona.id, nome)
      router.refresh()
    } catch {
      toast.error('Errore nel salvataggio del nome')
    }
  }

  const handleDelete = async (id: string) => {
    setEliminando(id)
    try {
      await deleteIconaPreventivo(id)
      toast.success('Icona rimossa')
      router.refresh()
    } catch {
      toast.error("Errore nella rimozione")
    } finally {
      setEliminando(null)
    }
  }

  return (
    <div className="space-y-4">
      {icone.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {icone.map((icona) => (
            <div key={icona.id} className="rounded-md border border-gray-200 p-2 space-y-2">
              <div className="relative">
                <img
                  src={urlIcona(icona.storage_path)}
                  alt={icona.nome}
                  className="h-20 w-full rounded bg-gray-50 object-contain"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-7 w-7 bg-white/80 text-gray-400 hover:text-red-600"
                  disabled={eliminando === icona.id}
                  onClick={() => handleDelete(icona.id)}
                  title="Rimuovi dalla libreria"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Input
                defaultValue={icona.nome}
                onBlur={(e) => handleRename(icona, e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400">
          Nessuna icona caricata. Quelle che carichi qui compaiono nelle voci libere dei preventivi.
        </p>
      )}

      {/* label + htmlFor, non un click() da codice: iOS lo blocca in silenzio */}
      <input
        id="icone-voce-libera-file"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={handleFiles}
        disabled={caricando}
      />
      <div className="flex items-center gap-3 flex-wrap">
        {/* Con asChild il `disabled` del Button non arriva alla label: durante il
            caricamento si spengono i clic a mano. */}
        <Button asChild variant="outline" size="sm">
          <label
            htmlFor="icone-voce-libera-file"
            className={caricando ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
          >
            {caricando ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-1" />
            )}
            {caricando ? 'Caricamento...' : 'Aggiungi icone'}
          </label>
        </Button>
        <span className="text-xs text-gray-400">
          JPG, PNG o WEBP — anche più file insieme. Rimuovere un&apos;icona non cambia i preventivi
          già creati.
        </span>
      </div>
    </div>
  )
}
