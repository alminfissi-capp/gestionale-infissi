'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileText, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { addBustaPaga, updateBustaPaga } from '@/actions/dipendenti'
import { avvisoBustaInput, MENSILITA_LABELS, validaBustaInput } from '@/lib/dipendenti'
import type { BustaPaga, Mensilita } from '@/types/dipendente'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  dipendenteId: string
  /** Busta da correggere. Assente = inserimento nuovo. */
  busta?: BustaPaga | null
  periodoDefault?: string // 'YYYY-MM-01'
}

const meseCorrente = () => new Date().toISOString().slice(0, 7)

export default function DialogBustaManuale({
  open, onOpenChange, dipendenteId, busta, periodoDefault,
}: Props) {
  const router = useRouter()
  const inModifica = !!busta

  const [periodo, setPeriodo] = useState(meseCorrente()) // 'YYYY-MM'
  const [mensilita, setMensilita] = useState<Mensilita>('mensile')
  const [netto, setNetto] = useState('')
  const [lordo, setLordo] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [rimuoviFile, setRimuoviFile] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setFile(null)
    setRimuoviFile(false)
    if (busta) {
      setPeriodo(busta.periodo.slice(0, 7))
      setMensilita(busta.mensilita)
      setNetto(String(Number(busta.netto)))
      setLordo(busta.lordo != null ? String(Number(busta.lordo)) : '')
    } else {
      setPeriodo((periodoDefault ?? `${meseCorrente()}-01`).slice(0, 7))
      setMensilita('mensile')
      setNetto('')
      setLordo('')
    }
  }, [open, busta, periodoDefault])

  // Spostare la busta su un altro mese/mensilità la porta in un altro conto: chi la
  // modifica deve saperlo prima di salvare, non scoprirlo dai totali.
  const contoCambiato =
    inModifica && (`${periodo}-01` !== busta!.periodo || mensilita !== busta!.mensilita)

  const pdfAttuale = inModifica && busta!.file_path && !rimuoviFile && !file

  // Avviso di coerenza, non un blocco: il lordo non entra in nessun calcolo
  const avviso = avvisoBustaInput({
    netto: parseFloat(netto.replace(',', '.')),
    lordo: lordo.trim() ? parseFloat(lordo.replace(',', '.')) : null,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const nettoN = parseFloat(netto.replace(',', '.'))
    const lordoN = lordo.trim() ? parseFloat(lordo.replace(',', '.')) : null
    const input = {
      dipendente_id: dipendenteId,
      periodo: `${periodo}-01`,
      mensilita,
      netto: nettoN,
      lordo: lordoN,
      pagina: busta?.pagina ?? null,
    }

    const errore = validaBustaInput(input)
    if (errore) {
      toast.error(errore)
      return
    }

    setLoading(true)
    try {
      // arrayBuffer via FormData: è il pattern che funziona anche da iOS/Android
      let formData: FormData | undefined
      if (file || rimuoviFile) {
        formData = new FormData()
        if (file) formData.append('file', file)
        if (rimuoviFile && !file) formData.append('rimuoviFile', '1')
      }

      if (inModifica) {
        await updateBustaPaga(busta!.id, input, formData)
        toast.success('Busta paga aggiornata')
      } else {
        await addBustaPaga(input, formData)
        toast.success('Busta paga registrata')
      }
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md xl:max-w-xl">
        <DialogHeader>
          <DialogTitle>{inModifica ? 'Modifica busta paga' : 'Registra busta paga'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="busta-netto">Netto (€) *</Label>
              <Input
                id="busta-netto"
                inputMode="decimal"
                value={netto}
                onChange={(e) => setNetto(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="busta-lordo">Lordo (€)</Label>
              <Input
                id="busta-lordo"
                inputMode="decimal"
                value={lordo}
                onChange={(e) => setLordo(e.target.value)}
                placeholder="facoltativo"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="busta-periodo">Mese di competenza *</Label>
              <Input
                id="busta-periodo"
                type="month"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Mensilità</Label>
              <Select value={mensilita} onValueChange={(v) => setMensilita(v as Mensilita)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MENSILITA_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {avviso && (
            <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950 rounded p-2">
              {avviso}. Puoi salvare comunque.
            </p>
          )}

          {contoCambiato && (
            <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950 rounded p-2">
              Stai spostando la busta in un altro conto mensile: il debito verso il
              dipendente si sposta di conseguenza, e i pagamenti già registrati sul mese
              di prima resteranno senza busta.
            </p>
          )}

          {/* PDF facoltativo: la busta si registra anche senza allegato */}
          <div className="space-y-1">
            <Label htmlFor="busta-file">
              PDF della busta {inModifica ? '' : '(facoltativo)'}
            </Label>
            {pdfAttuale ? (
              <div className="flex items-center gap-2 text-sm rounded border p-2">
                <FileText className="h-4 w-4 text-gray-500 shrink-0" />
                <span className="flex-1 text-gray-600">PDF allegato</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => setRimuoviFile(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Rimuovi
                </Button>
              </div>
            ) : (
              <>
                <Input
                  id="busta-file"
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null)
                    setRimuoviFile(false)
                  }}
                />
                {inModifica && rimuoviFile && !file && (
                  <p className="text-xs text-gray-500">
                    L&apos;allegato verrà rimosso al salvataggio.
                  </p>
                )}
              </>
            )}
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading
              ? 'Salvataggio...'
              : inModifica ? 'Salva modifiche' : 'Registra busta paga'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
