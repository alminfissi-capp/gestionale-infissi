'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import { ImagePlus, X, Download } from 'lucide-react'
import { createListino, updateListino, getCurrentOrgId } from '@/actions/listini'
import { createClient } from '@/lib/supabase/client'
import { grigliaToCsv, downloadCsv } from '@/lib/exportListino'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import TabellaGriglia from './TabellaGriglia'
import FormFiniture, { type FinituraInput } from './FormFiniture'
import ImportCSV from './ImportCSV'
import ImportExcel from './ImportExcel'
import ImportPDF from './ImportPDF'
import type { GrigliaData, ListinoCompleto } from '@/types/listino'

/** Ridimensiona un'immagine mantenendo le proporzioni, max maxDim px su lato maggiore, formato WebP */
async function resizeImage(file: File, maxDim = 600): Promise<Blob> {
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
  open: boolean
  onOpenChange: (open: boolean) => void
  categoriaId: string
  listino?: ListinoCompleto
  onSuccess: () => void
}

export default function DialogListino({
  open,
  onOpenChange,
  categoriaId,
  listino,
  onSuccess,
}: Props) {
  const [tipologia, setTipologia] = useState(listino?.tipologia ?? '')
  const [grigliaData, setGrigliaData] = useState<GrigliaData>({
    larghezze: listino?.larghezze ?? [],
    altezze: listino?.altezze ?? [],
    griglia: listino?.griglia ?? {},
  })
  const [finiture, setFiniture] = useState<FinituraInput[]>(
    listino?.finiture?.map((f) => ({ nome: f.nome, aumento: f.aumento, aumento_euro: f.aumento_euro ?? 0 })) ?? []
  )
  const [immagineUrl, setImmagineUrl] = useState<string | null>(listino?.immagine_url ?? null)
  const [uploadingImg, setUploadingImg] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)

  const handleOpenChange = (val: boolean) => {
    if (val) {
      setTipologia(listino?.tipologia ?? '')
      setGrigliaData({
        larghezze: listino?.larghezze ?? [],
        altezze: listino?.altezze ?? [],
        griglia: listino?.griglia ?? {},
      })
      setFiniture(
        listino?.finiture?.map((f) => ({ nome: f.nome, aumento: f.aumento, aumento_euro: f.aumento_euro ?? 0 })) ?? []
      )
      setImmagineUrl(listino?.immagine_url ?? null)
    }
    onOpenChange(val)
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImg(true)
    try {
      const blob = await resizeImage(file, 600)
      const orgId = await getCurrentOrgId()
      const supabase = createClient()
      const fileName = `${orgId}/${crypto.randomUUID()}.webp`
      const { error } = await supabase.storage
        .from('listini-immagini')
        .upload(fileName, blob, { contentType: 'image/webp', upsert: false })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage
        .from('listini-immagini')
        .getPublicUrl(fileName)
      setImmagineUrl(publicUrl)
    } catch {
      toast.error('Errore nel caricamento immagine')
    } finally {
      setUploadingImg(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleExportCsv = () => {
    const csv = grigliaToCsv(grigliaData)
    downloadCsv(csv, `${tipologia.trim() || 'listino'}.csv`)
  }

  const handleSave = async () => {
    if (!tipologia.trim()) {
      toast.error('Inserisci il nome del prodotto / tipologia')
      return
    }
    if (grigliaData.altezze.length === 0 || grigliaData.larghezze.length === 0) {
      toast.error('Importa la griglia prezzi prima di salvare')
      return
    }

    const finitureInvalide = finiture.filter((f) => !f.nome.trim())
    if (finitureInvalide.length > 0) {
      toast.error('Alcune finiture hanno il nome vuoto')
      return
    }

    setSaving(true)
    try {
      const payload = {
        tipologia: tipologia.trim(),
        ...grigliaData,
        finiture,
        immagine_url: immagineUrl,
      }

      if (listino) {
        await updateListino(listino.id, payload)
        toast.success('Listino aggiornato')
      } else {
        await createListino({ categoria_id: categoriaId, ...payload })
        toast.success('Listino creato')
      }
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('unique') || msg.includes('duplicate')) {
        toast.error('Esiste già un listino con questo nome nella categoria')
      } else {
        toast.error('Errore nel salvataggio del listino')
        console.error(err)
      }
    } finally {
      setSaving(false)
    }
  }

  const hasGriglia = grigliaData.altezze.length > 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle>{listino ? 'Modifica listino' : 'Nuovo listino'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Tipologia */}
          <div className="space-y-1.5">
            <Label htmlFor="tipologia">Nome prodotto / Tipologia</Label>
            <Input
              id="tipologia"
              value={tipologia}
              onChange={(e) => setTipologia(e.target.value)}
              placeholder="es. FINESTRA 2 ANTE"
            />
          </div>

          <Separator />

          {/* Import griglia */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Importa griglia prezzi</p>
            <Tabs defaultValue="csv">
              <TabsList className="mb-3">
                <TabsTrigger value="csv">CSV</TabsTrigger>
                <TabsTrigger value="excel">Excel</TabsTrigger>
                <TabsTrigger value="pdf">PDF</TabsTrigger>
              </TabsList>
              <TabsContent value="csv">
                <ImportCSV onParsed={setGrigliaData} />
              </TabsContent>
              <TabsContent value="excel">
                <ImportExcel onParsed={setGrigliaData} />
              </TabsContent>
              <TabsContent value="pdf">
                <ImportPDF onParsed={setGrigliaData} />
              </TabsContent>
            </Tabs>
          </div>

          {/* Griglia editabile */}
          {hasGriglia && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500">
                  {grigliaData.altezze.length} altezze × {grigliaData.larghezze.length} larghezze
                  <span className="ml-2 text-gray-400">— clicca su una cella per modificare il prezzo</span>
                </p>
                <Button variant="ghost" size="sm" onClick={handleExportCsv}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Esporta CSV
                </Button>
              </div>
              <TabellaGriglia data={grigliaData} editable onChange={setGrigliaData} />
            </div>
          )}

          <Separator />

          {/* Finiture */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Finiture</p>
            <FormFiniture finiture={finiture} onChange={setFiniture} />
          </div>

          <Separator />

          {/* Immagine prodotto */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Immagine prodotto</p>
            <div className="flex items-start gap-4">
              {immagineUrl ? (
                <div className="relative shrink-0">
                  <Image
                    src={immagineUrl}
                    alt="Immagine prodotto"
                    width={96}
                    height={72}
                    className="rounded border object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setImmagineUrl(null)}
                    className="absolute -top-1.5 -right-1.5 bg-white border rounded-full p-0.5 text-red-500 hover:text-red-700 shadow-sm"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="w-24 h-18 rounded border border-dashed border-gray-300 flex items-center justify-center bg-gray-50 shrink-0">
                  <ImagePlus className="h-6 w-6 text-gray-300" />
                </div>
              )}
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  Facoltativa. Verrà mostrata nel preventivo durante la scelta del prodotto e nella stampa.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingImg}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="h-4 w-4 mr-1" />
                  {uploadingImg ? 'Caricamento...' : immagineUrl ? 'Sostituisci' : 'Carica immagine'}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvataggio...' : listino ? 'Aggiorna listino' : 'Crea listino'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
