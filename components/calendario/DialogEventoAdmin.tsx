// components/calendario/DialogEventoAdmin.tsx
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
import {
  createEventoAdmin, updateEventoAdmin, deleteEventoAdmin,
} from '@/actions/calendario'

import AvvisaCliente from './AvvisaCliente'
import type { EventoConContesto, EventoInput, TipoAttivita } from '@/types/calendario'
import type { CommessaOpzione } from '@/types/produzione'

/** Valori di partenza quando il dialog si apre su un giorno vuoto. */
export type NuovoImpegno = {
  data: string
  ora_inizio: string
  ora_fine: string
  /** Chiave del tipo scelto in anagrafica. */
  tipo: string
}

const soloOreMinuti = (ora: string) => ora.slice(0, 5)

export default function DialogEventoAdmin({
  evento,
  nuovo,
  tipi,
  commesse,
  onClose,
}: {
  evento: EventoConContesto | null
  nuovo: NuovoImpegno | null
  /** Tipi creabili dall'agenda: quelli di sistema non ci sono. */
  tipi: TipoAttivita[]
  commesse: CommessaOpzione[]
  onClose: () => void
}) {
  const router = useRouter()
  const inModifica = evento !== null
  // Una scadenza e' lo specchio di una riga di Commesse: qui si guarda e basta.
  const soloLettura = evento?.tipo === 'scadenza'

  const [tipo, setTipo] = useState<string>(
    evento?.tipo ?? nuovo?.tipo ?? tipi[0]?.chiave ?? 'appuntamento'
  )
  const [titolo, setTitolo] = useState(evento?.titolo ?? '')
  const [data, setData] = useState(evento?.data ?? nuovo?.data ?? '')
  const [tuttoIlGiorno, setTuttoIlGiorno] = useState(evento?.tutto_il_giorno ?? false)
  const [oraInizio, setOraInizio] = useState(
    soloOreMinuti(evento?.ora_inizio ?? nuovo?.ora_inizio ?? '09:00')
  )
  const [oraFine, setOraFine] = useState(
    soloOreMinuti(evento?.ora_fine ?? nuovo?.ora_fine ?? '10:00')
  )
  const [commessaId, setCommessaId] = useState(evento?.commessa_id ?? '')
  const [clienteNome, setClienteNome] = useState(evento?.cliente_nome ?? '')
  const [note, setNote] = useState(evento?.note ?? '')
  const [inProduzione, setInProduzione] = useState(evento?.visibile_produzione ?? false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tuttoIlGiorno && oraFine <= oraInizio) {
      toast.error('L’orario di fine deve venire dopo quello di inizio')
      return
    }

    const input: EventoInput = {
      tipo,
      titolo: titolo.trim() || null,
      data,
      // Un evento di giornata occupa comunque una fascia sul Gantt, se qualcuno
      // lo rende visibile in Produzione: gli si danno gli orari pieni.
      ora_inizio: tuttoIlGiorno ? '08:00' : oraInizio,
      ora_fine: tuttoIlGiorno ? '19:00' : oraFine,
      tutto_il_giorno: tuttoIlGiorno,
      commessa_id: commessaId || null,
      cliente_id: null,
      cliente_nome: clienteNome.trim() || null,
      fornitore_id: null,
      ordine_id: null,
      catena_id: null,
      confermato_cliente: evento?.confermato_cliente ?? false,
      note: note.trim() || null,
      visibile_produzione: inProduzione,
      visibile_amministrazione: true,
    }

    setLoading(true)
    try {
      if (inModifica) {
        await updateEventoAdmin(evento.id, input)
        toast.success('Impegno aggiornato')
      } else {
        await createEventoAdmin(input)
        toast.success('Impegno creato')
      }
      router.refresh()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!evento) return
    setLoading(true)
    try {
      await deleteEventoAdmin(evento.id)
      toast.success('Impegno eliminato')
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
          <DialogTitle>
            {soloLettura
              ? 'Scadenza'
              : inModifica ? 'Modifica impegno' : 'Nuovo impegno'}
          </DialogTitle>
        </DialogHeader>

        {soloLettura ? (
          <div className="space-y-3 text-sm">
            <p className="font-medium">{evento.titolo ?? 'Scadenza'}</p>
            <p className="text-gray-500 dark:text-gray-400">
              {data.split('-').reverse().join('/')}
            </p>
            {evento.note && (
              <p className="whitespace-pre-line text-gray-600 dark:text-gray-300">
                {evento.note}
              </p>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Questa riga rispecchia una scadenza di Commesse: si modifica da lì,
              o si toglie dal calendario togliendo la spunta sulla scadenza.
            </p>
            <DialogFooter>
              <Button type="button" onClick={onClose}>Chiudi</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="impegno-tipo">Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger id="impegno-tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tipi.map((t) => (
                    <SelectItem key={t.id} value={t.chiave}>{t.etichetta}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="impegno-titolo">Titolo</Label>
              <Input
                id="impegno-titolo"
                value={titolo}
                placeholder="Sopralluogo"
                onChange={(e) => setTitolo(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="impegno-data">Data</Label>
                <Input
                  id="impegno-data" type="date" value={data} required
                  onChange={(e) => setData(e.target.value)}
                />
              </div>
              {!tuttoIlGiorno && (
                <>
                  <div>
                    <Label htmlFor="impegno-inizio">Dalle</Label>
                    <Input
                      id="impegno-inizio" type="time" value={oraInizio} required
                      onChange={(e) => setOraInizio(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="impegno-fine">Alle</Label>
                    <Input
                      id="impegno-fine" type="time" value={oraFine} required
                      onChange={(e) => setOraFine(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={tuttoIlGiorno}
                onCheckedChange={(v) => setTuttoIlGiorno(v === true)}
              />
              Tutto il giorno
            </label>

            <div>
              <Label htmlFor="impegno-commessa">Commessa</Label>
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
                <SelectTrigger id="impegno-commessa">
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
              <Label htmlFor="impegno-cliente">Cliente</Label>
              <Input
                id="impegno-cliente" value={clienteNome} placeholder="V.TERESI"
                onChange={(e) => setClienteNome(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="impegno-note">Note</Label>
              <Textarea
                id="impegno-note" value={note} rows={2}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={inProduzione}
                onCheckedChange={(v) => setInProduzione(v === true)}
              />
              Mostra anche nel calendario della Produzione
            </label>

            {/* Qualunque attivita' vista dall'agenda si puo' notificare, anche
                una posa nata in Produzione. Serve pero' un evento salvato: e'
                il suo id che l'avviso registra. */}
            {inModifica && <AvvisaCliente eventoId={evento.id} />}

            <DialogFooter className="gap-2 sm:justify-between">
              {inModifica ? (
                <Button
                  type="button" variant="destructive" size="sm" disabled={loading}
                  onClick={handleDelete}
                >
                  Elimina
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" disabled={loading}>
                {loading ? 'Salvataggio…' : 'Salva'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
