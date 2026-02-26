'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { createListino, updateListino } from '@/actions/listini'
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
    }
    onOpenChange(val)
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

    // Valida finiture
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
    } catch {
      toast.error('Errore nel salvataggio del listino')
    } finally {
      setSaving(false)
    }
  }

  const hasGriglia = grigliaData.altezze.length > 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{listino ? 'Modifica listino' : 'Nuovo listino'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
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
            <p className="text-sm font-medium text-gray-700 mb-3">Griglia prezzi</p>
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

          {/* Preview griglia */}
          {hasGriglia && (
            <div>
              <p className="text-xs text-gray-500 mb-2">
                Anteprima: {grigliaData.altezze.length} altezze × {grigliaData.larghezze.length} larghezze
              </p>
              <TabellaGriglia data={grigliaData} />
            </div>
          )}

          <Separator />

          {/* Finiture */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Finiture</p>
            <FormFiniture finiture={finiture} onChange={setFiniture} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
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
