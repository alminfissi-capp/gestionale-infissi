'use client'

import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { Upload, CheckCircle, AlertCircle, Loader2, X, FileText } from 'lucide-react'
import { createListino } from '@/actions/listini'
import { parseCSVListino } from '@/lib/parsers/parseCSVListino'
import { parseExcelListino } from '@/lib/parsers/parseExcelListino'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { GrigliaData } from '@/types/listino'

type FileStatus = 'parsing' | 'ready' | 'error' | 'creating' | 'done'

interface FileEntry {
  id: string
  file: File
  tipologia: string
  status: FileStatus
  griglia: GrigliaData | null
  errorMsg: string
}

function stripExt(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '')
}

async function parseFile(file: File): Promise<GrigliaData & { errors: string[] }> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'xlsx' || ext === 'xls') {
    return parseExcelListino(file)
  }
  const text = await file.text()
  return parseCSVListino(text)
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  categoriaId: string
  onSuccess: () => void
}

export default function DialogImportaMultiplo({ open, onOpenChange, categoriaId, onSuccess }: Props) {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [creating, setCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    const newEntries: FileEntry[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      tipologia: stripExt(file.name),
      status: 'parsing',
      griglia: null,
      errorMsg: '',
    }))

    setEntries((prev) => [...prev, ...newEntries])

    // Parsa tutti in parallelo
    const results = await Promise.all(
      newEntries.map(async (entry) => {
        try {
          const result = await parseFile(entry.file)
          if (result.altezze.length === 0 || result.larghezze.length === 0) {
            return { id: entry.id, status: 'error' as FileStatus, griglia: null, errorMsg: result.errors[0] || 'Griglia vuota o non riconosciuta' }
          }
          return { id: entry.id, status: 'ready' as FileStatus, griglia: result as GrigliaData, errorMsg: '' }
        } catch {
          return { id: entry.id, status: 'error' as FileStatus, griglia: null, errorMsg: 'Errore nella lettura del file' }
        }
      })
    )

    setEntries((prev) =>
      prev.map((e) => {
        const r = results.find((r) => r.id === e.id)
        return r ? { ...e, ...r } : e
      })
    )
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  const removeEntry = (id: string) => setEntries((prev) => prev.filter((e) => e.id !== id))

  const updateTipologia = (id: string, value: string) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, tipologia: value } : e)))

  const readyEntries = entries.filter((e) => e.status === 'ready')

  const handleCreaTutti = async () => {
    if (readyEntries.length === 0) return
    setCreating(true)
    let ok = 0
    let fail = 0

    for (const entry of readyEntries) {
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, status: 'creating' } : e)))
      try {
        await createListino({
          categoria_id: categoriaId,
          tipologia: entry.tipologia.trim(),
          larghezze: entry.griglia!.larghezze,
          altezze: entry.griglia!.altezze,
          griglia: entry.griglia!.griglia,
          finiture: [],
        })
        setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, status: 'done' } : e)))
        ok++
      } catch (err) {
        const msg = err instanceof Error ? err.message : ''
        const friendly =
          msg.includes('unique') || msg.includes('duplicate')
            ? 'Nome già esistente nella categoria'
            : 'Errore nel salvataggio'
        setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, status: 'error', errorMsg: friendly } : e)))
        fail++
      }
    }

    setCreating(false)
    if (ok > 0) {
      toast.success(`${ok} listino${ok > 1 ? 'i' : ''} creato${ok > 1 ? 'i' : ''}`)
      onSuccess()
    }
    if (fail > 0) toast.error(`${fail} listino${fail > 1 ? 'i' : ''} non salvato${fail > 1 ? 'i' : ''}`)
    if (fail === 0) {
      onOpenChange(false)
      setEntries([])
    }
  }

  const handleClose = (val: boolean) => {
    if (creating) return
    if (!val) setEntries([])
    onOpenChange(val)
  }

  const btnLabel = readyEntries.length > 0
    ? `Crea ${readyEntries.length} listino${readyEntries.length !== 1 ? 'i' : ''}`
    : 'Crea listini'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle>Importa più listini</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50/40 transition-colors"
          >
            <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-600">Trascina qui i file CSV o Excel</p>
            <p className="text-xs text-gray-400 mt-1">oppure clicca per selezionare — puoi scegliere più file insieme</p>
            <p className="text-xs text-gray-400 mt-1">Il nome del file diventa automaticamente il nome del listino</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".csv,.xlsx,.xls,.txt"
              className="hidden"
              onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }}
            />
          </div>

          {/* Lista file */}
          {entries.length > 0 && (
            <div className="space-y-2">
              {entries.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 p-3 rounded-lg border bg-white">
                  {/* Icona stato */}
                  <div className="shrink-0 w-5">
                    {entry.status === 'parsing' && <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />}
                    {entry.status === 'ready' && <CheckCircle className="h-4 w-4 text-green-500" />}
                    {entry.status === 'creating' && <Loader2 className="h-4 w-4 text-teal-500 animate-spin" />}
                    {entry.status === 'done' && <CheckCircle className="h-4 w-4 text-teal-600" />}
                    {entry.status === 'error' && <AlertCircle className="h-4 w-4 text-red-400" />}
                  </div>

                  {/* Tipologia editabile */}
                  <div className="flex-1 min-w-0">
                    {entry.status === 'ready' ? (
                      <Input
                        value={entry.tipologia}
                        onChange={(e) => updateTipologia(entry.id, e.target.value)}
                        className="h-8 text-sm"
                        placeholder="Nome listino"
                      />
                    ) : (
                      <p className="text-sm font-medium text-gray-800 truncate">{entry.tipologia}</p>
                    )}
                    {entry.griglia && entry.status !== 'error' && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {entry.griglia.altezze.length} altezze × {entry.griglia.larghezze.length} larghezze
                      </p>
                    )}
                    {entry.errorMsg && (
                      <p className="text-xs text-red-500 mt-0.5">{entry.errorMsg}</p>
                    )}
                  </div>

                  {/* Nome file originale */}
                  <div className="shrink-0 flex items-center gap-1 text-xs text-gray-400 max-w-[140px]">
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="truncate">{entry.file.name}</span>
                  </div>

                  {/* Rimuovi */}
                  {!creating && entry.status !== 'done' && (
                    <button
                      onClick={() => removeEntry(entry.id)}
                      className="shrink-0 text-gray-300 hover:text-gray-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t shrink-0 flex items-center justify-between gap-2">
          <p className="text-sm text-gray-500">
            {readyEntries.length > 0
              ? `${readyEntries.length} listino${readyEntries.length !== 1 ? 'i' : ''} pronto${readyEntries.length !== 1 ? 'i' : ''} da creare`
              : entries.length > 0
              ? 'Nessun file valido'
              : 'Nessun file caricato'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleClose(false)} disabled={creating}>
              Annulla
            </Button>
            <Button onClick={handleCreaTutti} disabled={creating || readyEntries.length === 0}>
              {creating ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Creazione...</>
              ) : btnLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
