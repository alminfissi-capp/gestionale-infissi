'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ComboboxField } from '@/components/ui/combobox-field'
import { createAnticipo, updateAnticipo } from '@/actions/banche'
import { formatEuro, parseImporto } from '@/lib/pricing'
import type { AnticipoFattura, LineaCredito, OpzioneCommessa } from '@/types/commessa'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  linee: LineaCredito[]
  commesse: OpzioneCommessa[]
  anticipo: AnticipoFattura | null // null = nuovo
}

export default function DialogAnticipo({ open, onOpenChange, linee, commesse, anticipo }: Props) {
  const router = useRouter()
  const [lineaId, setLineaId] = useState(anticipo?.linea_id ?? linee[0]?.id ?? '')
  const [commessaId, setCommessaId] = useState(anticipo?.commessa_id ?? '')
  const [descrizione, setDescrizione] = useState(anticipo?.descrizione ?? '')
  const [importo, setImporto] = useState(anticipo ? String(anticipo.importo) : '')
  const [erogazione, setErogazione] = useState(anticipo?.data_erogazione ?? '')
  const [scadenza, setScadenza] = useState(anticipo?.data_scadenza ?? '')
  const [saving, setSaving] = useState(false)

  const selezionata = commesse.find((c) => c.id === commessaId)

  const handleSalva = async () => {
    if (!lineaId) { toast.error('Scegli la linea di credito'); return }
    const valore = parseImporto(importo)
    if (valore <= 0) { toast.error("Inserisci l'importo anticipato"); return }
    setSaving(true)
    try {
      const input = {
        linea_id: lineaId,
        commessa_id: commessaId || null,
        descrizione,
        importo: valore,
        data_erogazione: erogazione || null,
        data_scadenza: scadenza || null,
      }
      if (anticipo) await updateAnticipo(anticipo.id, input)
      else await createAnticipo(input)
      toast.success(anticipo ? 'Anticipo aggiornato' : 'Anticipo aggiunto')
      onOpenChange(false)
      router.refresh()
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{anticipo ? 'Modifica anticipo' : 'Nuovo anticipo fattura'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Linea di credito</Label>
            <Select value={lineaId} onValueChange={setLineaId}>
              <SelectTrigger><SelectValue placeholder="Scegli la linea" /></SelectTrigger>
              <SelectContent>
                {linee.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Commessa</Label>
            <ComboboxField
              options={commesse.map((c) => ({ value: c.id, label: c.etichetta }))}
              value={commessaId}
              onChange={setCommessaId}
              placeholder="Nessuna commessa collegata"
              searchPlaceholder="Cerca per numero o cliente…"
            />
            {selezionata && (
              <p className="text-xs text-gray-500">
                Il cliente deve ancora saldare {formatEuro(selezionata.residuo)}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Importo anticipato</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={importo}
              placeholder="0,00"
              onChange={(e) => setImporto(e.target.value)}
              className="text-right"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Erogato il</Label>
              <Input type="date" value={erogazione} onChange={(e) => setErogazione(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Scadenza</Label>
              <Input type="date" value={scadenza} onChange={(e) => setScadenza(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Input
              value={descrizione}
              placeholder="Es. fattura 214/2026"
              onChange={(e) => setDescrizione(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={handleSalva} disabled={saving}>{saving ? 'Salvo…' : 'Salva'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
