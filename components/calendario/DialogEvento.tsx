// components/calendario/DialogEvento.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createEvento, updateEvento, deleteEvento } from '@/actions/calendario'

import type { EventoConContesto, EventoInput, TipoAttivita } from '@/types/calendario'
import type { CommessaOpzione } from '@/types/produzione'

/** Valori di partenza quando il dialog si apre su uno slot vuoto o da un rilascio. */
export type NuovoEvento = {
  data: string
  ora_inizio: string
  ora_fine: string
  /** Chiave del tipo scelto in anagrafica. */
  tipo: string
  commessa_id?: string | null
  cliente_nome?: string | null
  fornitore_id?: string | null
  ordine_id?: string | null
}

const soloOreMinuti = (ora: string) => ora.slice(0, 5)

export default function DialogEvento({
  evento,
  nuovo,
  tipi,
  commesse,
  onClose,
}: {
  evento: EventoConContesto | null
  nuovo: NuovoEvento | null
  /** Tipi di ambito produzione, come li ha personalizzati l'organizzazione. */
  tipi: TipoAttivita[]
  commesse: CommessaOpzione[]
  onClose: () => void
}) {
  const router = useRouter()
  const inModifica = evento !== null

  const [tipo, setTipo] = useState<string>(
    evento?.tipo ?? nuovo?.tipo ?? tipi[0]?.chiave ?? 'lavorazione'
  )
  const [data, setData] = useState(evento?.data ?? nuovo?.data ?? '')
  const [oraInizio, setOraInizio] = useState(
    soloOreMinuti(evento?.ora_inizio ?? nuovo?.ora_inizio ?? '08:00')
  )
  const [oraFine, setOraFine] = useState(
    soloOreMinuti(evento?.ora_fine ?? nuovo?.ora_fine ?? '17:30')
  )
  const [commessaId, setCommessaId] = useState(
    evento?.commessa_id ?? nuovo?.commessa_id ?? ''
  )
  const [clienteNome, setClienteNome] = useState(
    evento?.cliente_nome ?? nuovo?.cliente_nome ?? ''
  )
  const [note, setNote] = useState(evento?.note ?? '')
  const [confermato, setConfermato] = useState(evento?.confermato_cliente ?? false)
  const [inAmministrazione, setInAmministrazione] = useState(
    evento?.visibile_amministrazione ?? false
  )
  const [giorni, setGiorni] = useState('1')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (oraFine <= oraInizio) {
      toast.error('L’orario di fine deve venire dopo quello di inizio')
      return
    }

    const input: EventoInput = {
      tipo,
      titolo: null,
      data,
      ora_inizio: oraInizio,
      ora_fine: oraFine,
      tutto_il_giorno: false,
      commessa_id: commessaId || null,
      cliente_id: null,
      cliente_nome: clienteNome.trim() || null,
      fornitore_id: evento?.fornitore_id ?? nuovo?.fornitore_id ?? null,
      ordine_id: evento?.ordine_id ?? nuovo?.ordine_id ?? null,
      catena_id: evento?.catena_id ?? null,
      confermato_cliente: confermato,
      note: note.trim() || null,
      visibile_produzione: true,
      visibile_amministrazione: inAmministrazione,
    }

    setLoading(true)
    try {
      if (inModifica) {
        await updateEvento(evento.id, input)
        toast.success('Evento aggiornato')
      } else {
        await createEvento(input, Math.max(1, Math.min(60, Number(giorni) || 1)))
        toast.success('Evento creato')
      }
      router.refresh()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (tuttaLaCatena: boolean) => {
    if (!evento) return
    setLoading(true)
    try {
      await deleteEvento(evento.id, tuttaLaCatena)
      toast.success(tuttaLaCatena ? 'Catena eliminata' : 'Evento eliminato')
      router.refresh()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(aperto) => !aperto && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{inModifica ? 'Modifica attività' : 'Nuova attività'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="evento-tipo">Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger id="evento-tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tipi.map((t) => (
                  <SelectItem key={t.id} value={t.chiave}>
                    {t.etichetta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label htmlFor="evento-data">Data</Label>
              <Input
                id="evento-data" type="date" value={data} required
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="evento-inizio">Dalle</Label>
              <Input
                id="evento-inizio" type="time" value={oraInizio} required
                onChange={(e) => setOraInizio(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="evento-fine">Alle</Label>
              <Input
                id="evento-fine" type="time" value={oraFine} required
                onChange={(e) => setOraFine(e.target.value)}
              />
            </div>
          </div>

          {!inModifica && (
            <div>
              <Label htmlFor="evento-giorni">Giorni consecutivi</Label>
              <Input
                id="evento-giorni" type="number" min="1" max="60" value={giorni}
                className="w-28"
                onChange={(e) => setGiorni(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500">
                Oltre 1 crea una lavorazione continuativa, saltando i giorni chiusi.
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="evento-commessa">Commessa</Label>
            <Select
              value={commessaId || 'nessuna'}
              onValueChange={(v) => {
                if (v === 'nessuna') {
                  setCommessaId('')
                  return
                }
                setCommessaId(v)
                const c = commesse.find((x) => x.id === v)
                if (c) setClienteNome(c.cliente_nome)
              }}
            >
              <SelectTrigger id="evento-commessa">
                <SelectValue placeholder="Nessuna" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nessuna">Nessuna</SelectItem>
                {commesse.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.numero_commessa} — {c.cliente_nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="evento-cliente">Cliente sull’etichetta</Label>
            <Input
              id="evento-cliente" value={clienteNome} placeholder="V.TERESI"
              onChange={(e) => setClienteNome(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="evento-note">Note</Label>
            <Textarea
              id="evento-note" value={note} rows={2} placeholder="trasferta"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={confermato}
              onCheckedChange={(v) => setConfermato(v === true)}
            />
            Confermato con il cliente
          </label>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={inAmministrazione}
              onCheckedChange={(v) => setInAmministrazione(v === true)}
            />
            Mostra anche nel calendario dell’Amministrazione
          </label>

          <DialogFooter className="gap-2 sm:justify-between">
            {inModifica ? (
              <div className="flex gap-2">
                <Button
                  type="button" variant="destructive" size="sm" disabled={loading}
                  onClick={() => handleDelete(false)}
                >
                  Elimina
                </Button>
                {evento.catena_id && (
                  <Button
                    type="button" variant="outline" size="sm" disabled={loading}
                    onClick={() => handleDelete(true)}
                  >
                    Elimina tutta la catena
                  </Button>
                )}
              </div>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvataggio…' : 'Salva'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
