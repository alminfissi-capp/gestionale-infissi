'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import RigheOrdine from './RigheOrdine'
import { formatEuro } from '@/lib/pricing'
import { calcolaTotaleOrdine } from '@/lib/produzione'
import { createOrdine, updateOrdine, getDescrizioniFornitore } from '@/actions/produzione'
import { STATI_ORDINE } from '@/types/produzione'
import type { OrdineCompleto, RigaOrdineInput, StatoOrdine } from '@/types/produzione'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  commessaId: string
  ordine: OrdineCompleto | null
  fornitori: { id: string; nome: string; email: string | null }[]
  numeroProposto: string
}

const oggiISO = () => new Date().toISOString().slice(0, 10)

export default function DialogOrdine({
  open, onOpenChange, commessaId, ordine, fornitori, numeroProposto,
}: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [fornitoreId, setFornitoreId] = useState<string>('')
  const [numero, setNumero] = useState('')
  const [dataOrdine, setDataOrdine] = useState(oggiISO())
  const [consegna, setConsegna] = useState('')
  const [stato, setStato] = useState<StatoOrdine>('da_ordinare')
  const [note, setNote] = useState('')
  const [righe, setRighe] = useState<RigaOrdineInput[]>([])
  const [suggerimenti, setSuggerimenti] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    setFornitoreId(ordine?.fornitore_id ?? '')
    setNumero(ordine?.numero_ordine ?? numeroProposto)
    setDataOrdine(ordine?.data_ordine ?? oggiISO())
    setConsegna(ordine?.data_consegna_prevista ?? '')
    setStato(ordine?.stato ?? 'da_ordinare')
    setNote(ordine?.note ?? '')
    setRighe(
      ordine?.righe.map((r) => ({
        descrizione: r.descrizione,
        quantita: r.quantita,
        unita_misura: r.unita_misura,
        prezzo_unitario: r.prezzo_unitario,
        ordine: r.ordine,
      })) ?? [{ descrizione: '', quantita: 1, unita_misura: 'pz', prezzo_unitario: null, ordine: 0 }]
    )
  }, [open, ordine, numeroProposto])

  useEffect(() => {
    if (!fornitoreId) {
      setSuggerimenti([])
      return
    }
    getDescrizioniFornitore(fornitoreId).then(setSuggerimenti).catch(() => setSuggerimenti([]))
  }, [fornitoreId])

  const salva = async () => {
    if (righe.every((r) => r.descrizione.trim() === '')) {
      toast.error('Aggiungi almeno una riga')
      return
    }
    setSaving(true)
    try {
      const input = {
        commessa_id: commessaId,
        fornitore_id: fornitoreId || null,
        numero_ordine: numero.trim(),
        data_ordine: dataOrdine,
        data_consegna_prevista: consegna || null,
        stato,
        note: note.trim() || null,
        righe,
      }
      if (ordine) await updateOrdine(ordine.id, input)
      else await createOrdine(input)
      toast.success(ordine ? 'Ordine aggiornato' : 'Ordine creato')
      onOpenChange(false)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ordine ? 'Modifica ordine' : 'Nuovo ordine fornitore'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Fornitore</Label>
            <Select value={fornitoreId} onValueChange={setFornitoreId}>
              <SelectTrigger><SelectValue placeholder="Seleziona fornitore" /></SelectTrigger>
              <SelectContent>
                {fornitori.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Numero ordine</Label>
            <Input value={numero} onChange={(e) => setNumero(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Data ordine</Label>
            <Input type="date" value={dataOrdine} onChange={(e) => setDataOrdine(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Consegna prevista</Label>
            <Input type="date" value={consegna} onChange={(e) => setConsegna(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Stato</Label>
            <Select value={stato} onValueChange={(v) => setStato(v as StatoOrdine)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATI_ORDINE.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Righe</Label>
          <RigheOrdine righe={righe} suggerimenti={suggerimenti} onChange={setRighe} />
        </div>

        <div className="text-right text-sm font-semibold">
          Totale: {formatEuro(calcolaTotaleOrdine(righe))}
        </div>

        <div className="space-y-1.5">
          <Label>Note</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={salva} disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
