'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, Trash2, FileText, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  getAllegatiOrdine, uploadAllegatiOrdine, deleteAllegatoOrdine, registraAllegatoOrdine,
} from '@/actions/produzione-allegati'
import { getOrgIdPerUpload } from '@/actions/commesse'
import { createClient } from '@/lib/supabase/client'
import { mimeAllegato, percorsoAllegatoOrdine, validaAllegato } from '@/lib/allegati-ordine'
import { getDocumentoSignedUrl } from '@/actions/produzione-documenti'
import DialogVisualizzatore from './DialogVisualizzatore'
import type { AllegatoOrdine } from '@/types/produzione'

interface Props {
  /**
   * null = ordine non ancora salvato. I file scelti restano in attesa qui e li
   * carica il dialog appena l'ordine ha un id: senza ordine_id non esiste una
   * riga a cui agganciarli, ma far salvare prima e riaprire dopo costa tempo a
   * ogni ordine.
   */
  ordineId: string | null
  inAttesa?: File[]
  onInAttesaChange?: (files: File[]) => void
}

const isImmagine = (a: AllegatoOrdine) => (a.content_type ?? '').startsWith('image/')

export default function AllegatiOrdine({ ordineId, inAttesa = [], onInAttesaChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [allegati, setAllegati] = useState<AllegatoOrdine[]>([])
  const [caricamento, setCaricamento] = useState(false)
  const [viewer, setViewer] = useState<{ url: string; nome: string } | null>(null)

  const ricarica = useCallback(() => {
    if (!ordineId) {
      setAllegati([])
      return
    }
    getAllegatiOrdine(ordineId).then(setAllegati).catch(() => setAllegati([]))
  }, [ordineId])

  useEffect(() => {
    ricarica()
  }, [ricarica])

  const carica = async (files: FileList) => {
    // Ordine non ancora salvato: si accodano e basta, li carica il dialog.
    if (!ordineId) {
      onInAttesaChange?.([...inAttesa, ...Array.from(files)])
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    setCaricamento(true)
    try {
      let errore: string | null = null
      for (const f of Array.from(files)) {
        errore = await caricaAllegatoOrdine(ordineId, f)
        if (errore) break
      }
      if (errore) toast.error(errore)
      else toast.success('Allegati caricati')
      ricarica()
    } finally {
      setCaricamento(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const apri = async (path: string, nome: string) => {
    const url = await getDocumentoSignedUrl(path)
    if (url) setViewer({ url, nome })
    else toast.error('Impossibile aprire il file')
  }

  const elimina = async (id: string, path: string) => {
    if (!confirm('Eliminare questo allegato?')) return
    try {
      await deleteAllegatoOrdine(id, path)
      toast.success('Allegato eliminato')
      ricarica()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        id={`allegati-ordine-${ordineId ?? 'nuovo'}`}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
        onChange={(e) => {
          const files = e.target.files
          if (files && files.length > 0) carica(files)
        }}
      />
      <Button asChild size="sm" variant="outline" disabled={caricamento}>
        <label htmlFor={`allegati-ordine-${ordineId ?? 'nuovo'}`} className="cursor-pointer gap-2">
          <Upload className="h-4 w-4" />
          {caricamento ? 'Caricamento...' : 'Aggiungi allegati'}
        </label>
      </Button>

      {inAttesa.length > 0 && (
        <div className="space-y-1.5">
          {inAttesa.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              className="flex items-center gap-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-2.5"
            >
              {f.type.startsWith('image/') ? (
                <ImageIcon className="h-4 w-4 text-gray-400 shrink-0" />
              ) : (
                <FileText className="h-4 w-4 text-gray-400 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
              <span className="shrink-0 text-xs text-gray-500">al salvataggio</span>
              <Button
                type="button"
                variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 shrink-0"
                onClick={() => onInAttesaChange?.(inAttesa.filter((_, idx) => idx !== i))}
                aria-label="Togli allegato"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {allegati.length === 0 && inAttesa.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Nessun allegato.</p>
      ) : (
        <div className="space-y-1.5">
          {allegati.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-800 p-2.5"
            >
              {isImmagine(a) ? (
                <ImageIcon className="h-4 w-4 text-gray-400 shrink-0" />
              ) : (
                <FileText className="h-4 w-4 text-gray-400 shrink-0" />
              )}
              <button
                type="button"
                onClick={() => apri(a.storage_path, a.nome_file)}
                className="min-w-0 flex-1 text-left text-sm text-blue-700 dark:text-blue-400 hover:underline truncate"
              >
                {a.nome_file}
              </button>
              <Button
                type="button"
                variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 shrink-0"
                onClick={() => elimina(a.id, a.storage_path)} aria-label="Elimina allegato"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <DialogVisualizzatore
        url={viewer?.url ?? null}
        nome={viewer?.nome ?? ''}
        onClose={() => setViewer(null)}
      />
    </div>
  )
}

/**
 * Carica UN allegato, per due strade.
 *
 * Quella buona e' l'upload diretto del browser su Storage: i byte non passano
 * dalla Server Action, che su Vercel si ferma intorno ai 4,5 MB e oltre quella
 * soglia fallisce **in silenzio** (niente toast, niente log). Un PDF pesante
 * del fornitore superava quel muro pur essendo accettato fino a 20 MB.
 *
 * Il ripiego e' la vecchia Server Action, che serve ancora: su iOS e Android,
 * dentro un Dialog, il client browser a volte non ha la sessione e l'upload
 * diretto non parte proprio. Li' il tetto dei 4,5 MB torna valido, ma e' meglio
 * di un caricamento che non avviene.
 *
 * Torna il messaggio d'errore, oppure null.
 */
export async function caricaAllegatoOrdine(ordineId: string, f: File): Promise<string | null> {
  // Sulla strada diretta i controlli della Server Action non girano: vanno
  // fatti qui, altrimenti il bucket rifiuta con un errore incomprensibile.
  const invalido = validaAllegato(f)
  if (invalido) return invalido

  const contentType = mimeAllegato(f.name, f.type)
  try {
    const orgId = await getOrgIdPerUpload()
    const storagePath = percorsoAllegatoOrdine(orgId, ordineId, f.name)
    const { error } = await createClient().storage
      .from('commesse-docs')
      .upload(storagePath, f, { contentType })
    if (error) throw error

    const { error: erroreRiga } = await registraAllegatoOrdine(
      ordineId, storagePath, f.name, contentType,
    )
    // File caricato ma riga non scritta: senza questa rimozione resterebbe nel
    // bucket un file che nessuno ritrova piu'.
    if (erroreRiga) {
      await createClient().storage.from('commesse-docs').remove([storagePath])
      return erroreRiga
    }
    return null
  } catch {
    return caricaAllegatoViaServer(ordineId, f)
  }
}

/** Ripiego: i byte passano dalla Server Action. Vale il tetto dei ~4,5 MB. */
async function caricaAllegatoViaServer(ordineId: string, f: File): Promise<string | null> {
  // File pigro da iCloud/Dropbox su iOS: senza arrayBuffer() arriva vuoto.
  const buffer = await f.arrayBuffer()
  const fd = new FormData()
  fd.append('ordineId', ordineId)
  fd.append('files', new File([buffer], f.name, { type: f.type }))
  const { error } = await uploadAllegatiOrdine(fd)
  return error ?? null
}
