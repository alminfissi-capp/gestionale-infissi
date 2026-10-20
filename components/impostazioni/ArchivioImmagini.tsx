'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, FolderPlus, Loader2, Trash2, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MAX_DIM_ICONA, nomeDaFile, resizeImage } from '@/lib/immagini'
import { BUCKET_ARCHIVIO, nuovoPathArchivio, urlArchivio } from '@/lib/archivio-immagini'
import {
  createCategoriaArchivio, createImmaginiArchivio, deleteCategoriaArchivio, deleteImmagineArchivio,
  renameCategoriaArchivio, renameImmagineArchivio,
} from '@/actions/archivio-immagini'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { ArchivioCategoriaConImmagini, ArchivioImmagine } from '@/types/impostazioni'

interface Props {
  orgId: string
  categorie: ArchivioCategoriaConImmagini[]
}

/**
 * Archivio immagini per categorie (Grate, Pergole...). Le immagini si scelgono nelle
 * voci libere dal pulsante "Icone / Archivio"; il preventivo ne salva una copia, quindi
 * eliminare qui non cambia i preventivi gia' fatti.
 */
export default function ArchivioImmagini({ orgId, categorie }: Props) {
  const router = useRouter()
  const [nuova, setNuova] = useState('')
  const [aperta, setAperta] = useState<string | null>(null)
  const [caricando, setCaricando] = useState<string | null>(null)
  const [occupato, setOccupato] = useState(false)
  const [daEliminare, setDaEliminare] = useState<ArchivioCategoriaConImmagini | null>(null)

  const creaCategoria = async () => {
    if (!nuova.trim()) return
    setOccupato(true)
    try {
      await createCategoriaArchivio(nuova)
      setNuova('')
      router.refresh()
    } catch {
      toast.error('Categoria non creata')
    } finally {
      setOccupato(false)
    }
  }

  const caricaFile = async (categoriaId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // lo stesso file si puo' riscegliere dopo un errore
    if (files.length === 0) return
    setCaricando(categoriaId)
    try {
      const supabase = createClient()
      const nuove: { nome: string; storage_path: string }[] = []
      const falliti: string[] = []
      for (const file of files) {
        try {
          const blob = await resizeImage(file, MAX_DIM_ICONA)
          const path = nuovoPathArchivio(orgId, categoriaId)
          const { error } = await supabase.storage.from(BUCKET_ARCHIVIO).upload(path, blob, { contentType: 'image/webp', upsert: false })
          if (error) throw error
          nuove.push({ nome: nomeDaFile(file.name), storage_path: path })
        } catch {
          falliti.push(file.name)
        }
      }
      // Le riuscite si registrano comunque: un file rotto non fa ricominciare da capo
      if (nuove.length > 0) {
        await createImmaginiArchivio(categoriaId, nuove)
        toast.success(nuove.length === 1 ? 'Immagine aggiunta' : `${nuove.length} immagini aggiunte`)
        router.refresh()
      }
      if (falliti.length > 0) toast.error(`Non caricate: ${falliti.join(', ')}`)
    } catch {
      toast.error('Errore nel caricamento')
    } finally {
      setCaricando(null)
    }
  }

  const rinominaCategoria = async (c: ArchivioCategoriaConImmagini, nome: string) => {
    if (nome.trim() === c.nome || !nome.trim()) return
    try { await renameCategoriaArchivio(c.id, nome); router.refresh() } catch { toast.error('Nome non salvato') }
  }
  const rinominaImmagine = async (i: ArchivioImmagine, nome: string) => {
    if (nome.trim() === i.nome) return
    try { await renameImmagineArchivio(i.id, nome); router.refresh() } catch { toast.error('Nome non salvato') }
  }
  const eliminaImmagine = async (i: ArchivioImmagine) => {
    setOccupato(true)
    try { await deleteImmagineArchivio(i.id); toast.success('Immagine eliminata'); router.refresh() } catch { toast.error('Immagine non eliminata') } finally { setOccupato(false) }
  }
  const eliminaCategoria = async (c: ArchivioCategoriaConImmagini) => {
    setOccupato(true)
    try { await deleteCategoriaArchivio(c.id); toast.success('Categoria eliminata'); router.refresh() } catch { toast.error('Categoria non eliminata') } finally { setOccupato(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="Nuova categoria (es. Grate, Pergole)" value={nuova} onChange={e => setNuova(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void creaCategoria() }} className="h-9" />
        <Button size="sm" className="gap-1.5" disabled={!nuova.trim() || occupato} onClick={() => void creaCategoria()}>
          <FolderPlus className="h-4 w-4" />Crea
        </Button>
      </div>

      {categorie.length === 0 && <p className="text-sm text-gray-400">Nessuna categoria. Creane una e caricaci le immagini: le ritrovi nelle voci libere dei preventivi.</p>}

      <div className="space-y-2">
        {categorie.map(c => {
          const aperto = aperta === c.id
          const idInput = `archivio-file-${c.id}`
          return (
            <div key={c.id} className="rounded-md border border-gray-200">
              <div className="flex items-center gap-2 p-2">
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setAperta(aperto ? null : c.id)} aria-label={aperto ? 'Chiudi' : 'Apri'}>
                  {aperto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
                <Input defaultValue={c.nome} onBlur={e => void rinominaCategoria(c, e.target.value)} className="h-8 max-w-xs font-medium" />
                <span className="text-xs text-gray-500">{c.immagini.length} {c.immagini.length === 1 ? 'immagine' : 'immagini'}</span>
                <Button variant="ghost" size="icon" className="ml-auto h-8 w-8 text-gray-400 hover:text-red-600" disabled={occupato}
                  onClick={() => (c.immagini.length > 0 ? setDaEliminare(c) : void eliminaCategoria(c))} title="Elimina categoria">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {aperto && (
                <div className="space-y-3 border-t p-3">
                  {c.immagini.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {c.immagini.map(i => (
                        <div key={i.id} className="space-y-2 rounded-md border border-gray-200 p-2">
                          <div className="relative">
                            <img src={urlArchivio(i.storage_path)} alt={i.nome} className="h-20 w-full rounded bg-gray-50 object-contain" />
                            <Button variant="ghost" size="icon" className="absolute right-0 top-0 h-7 w-7 bg-white/80 text-gray-400 hover:text-red-600"
                              disabled={occupato} onClick={() => void eliminaImmagine(i)} title="Elimina immagine">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <Input defaultValue={i.nome} onBlur={e => void rinominaImmagine(i, e.target.value)} className="h-8 text-xs" />
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-gray-400">Categoria vuota.</p>}

                  {/* label + htmlFor, non un click() da codice: iOS lo blocca in silenzio */}
                  <input id={idInput} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden"
                    onChange={e => void caricaFile(c.id, e)} disabled={caricando !== null} />
                  <div className="flex flex-wrap items-center gap-3">
                    <Button asChild variant="outline" size="sm">
                      <label htmlFor={idInput} className={caricando ? 'pointer-events-none opacity-50' : 'cursor-pointer'}>
                        {caricando === c.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
                        {caricando === c.id ? 'Caricamento...' : 'Aggiungi immagini'}
                      </label>
                    </Button>
                    <span className="text-xs text-gray-400">JPG, PNG o WEBP — anche più file insieme.</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400">
        I preventivi salvano una copia dell&apos;immagine scelta: eliminare o cambiare l&apos;archivio non modifica i preventivi già fatti.
      </p>

      <AlertDialog open={!!daEliminare} onOpenChange={o => { if (!o) setDaEliminare(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la categoria «{daEliminare?.nome}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Vengono eliminate anche le sue {daEliminare?.immagini.length} immagini. I preventivi già fatti non cambiano.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (daEliminare) void eliminaCategoria(daEliminare); setDaEliminare(null) }}>Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
