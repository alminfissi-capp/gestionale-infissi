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
import { Switch } from '@/components/ui/switch'
import RigheOrdine from './RigheOrdine'
import AllegatiOrdine, { caricaAllegatoOrdine } from './AllegatiOrdine'
import { formatEuro } from '@/lib/pricing'
import { calcolaTotaleOrdine, normalizzaNumeroOrdine, PREFISSO_ORDINE } from '@/lib/produzione'
import { createOrdine, getEventoOrdine, updateOrdine } from '@/actions/produzione'
import { getTipiAttivita } from '@/actions/calendario'
import type { TipoAttivita } from '@/types/calendario'
import { STATI_ORDINE } from '@/types/produzione'
import type { OrdineCompleto, RigaOrdineInput, StatoOrdine, CommessaOpzione, EventoOrdineInput } from '@/types/produzione'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  commessaId: string | null
  ordine: OrdineCompleto | null
  fornitori: { id: string; nome: string; email: string | null; richiede_conferma?: boolean }[]
  numeroProposto: string
  /** Se presenti, mostra il selettore commessa (uso dal magazzino). */
  commesse?: CommessaOpzione[]
}

const oggiISO = () => new Date().toISOString().slice(0, 10)
const MAGAZZINO = '__magazzino__'
const ORARI_CALENDARIO = { ora_inizio: '08:00', ora_fine: '10:00' }

/** Tipo proposto per l'arrivo: il primo "ricezione" dell'anagrafica, altrimenti il primo di Produzione. */
function tipoArrivoProposto(tipi: TipoAttivita[]): string {
  return (tipi.find((t) => t.chiave.startsWith('ricez')) ?? tipi[0])?.chiave ?? ''
}

const formatGiorno = (iso: string) => iso.split('-').reverse().join('/')

export default function DialogOrdine({
  open, onOpenChange, commessaId, ordine, fornitori, numeroProposto, commesse,
}: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [fornitoreId, setFornitoreId] = useState<string>('')
  const [commessaSel, setCommessaSel] = useState<string>(MAGAZZINO)
  const [numero, setNumero] = useState('')
  const [dataOrdine, setDataOrdine] = useState(oggiISO())
  const [consegna, setConsegna] = useState('')
  const [stato, setStato] = useState<StatoOrdine>('da_ordinare')
  const [richiedeConferma, setRichiedeConferma] = useState(false)
  const [note, setNote] = useState('')
  const [righe, setRighe] = useState<RigaOrdineInput[]>([])
  // Allegati scelti prima che l'ordine esista: si caricano appena ha un id.
  const [allegatiInAttesa, setAllegatiInAttesa] = useState<File[]>([])
  // Arrivo previsto in calendario. `calendarioLetto` dice se si conosce gia' lo stato
  // dell'evento esistente: finche' non lo si sa, il salvataggio non lo tocca.
  const [tipiProduzione, setTipiProduzione] = useState<TipoAttivita[]>([])
  const [inCalendario, setInCalendario] = useState(false)
  const [calendario, setCalendario] = useState<EventoOrdineInput>({ tipo: '', ...ORARI_CALENDARIO })
  const [calendarioLetto, setCalendarioLetto] = useState(false)

  useEffect(() => {
    if (!open) return
    let annullato = false
    setInCalendario(false)
    setCalendarioLetto(false)
    void (async () => {
      try {
        const [tipi, esistente] = await Promise.all([
          getTipiAttivita(),
          ordine ? getEventoOrdine(ordine.id) : Promise.resolve(null),
        ])
        if (annullato) return
        const produzione = tipi.filter((t) => t.ambito === 'produzione')
        setTipiProduzione(produzione)
        setCalendario(esistente ?? { tipo: tipoArrivoProposto(produzione), ...ORARI_CALENDARIO })
        setInCalendario(esistente !== null)
        setCalendarioLetto(true)
      } catch {
        // senza tipi l'interruttore resta spento: l'ordine si salva lo stesso
      }
    })()
    return () => { annullato = true }
  }, [open, ordine])

  useEffect(() => {
    if (!open) return
    setFornitoreId(ordine?.fornitore_id ?? '')
    setCommessaSel(ordine?.commessa_id ?? commessaId ?? MAGAZZINO)
    setNumero(ordine ? normalizzaNumeroOrdine(ordine.numero_ordine) : numeroProposto)
    setDataOrdine(ordine?.data_ordine ?? oggiISO())
    setConsegna(ordine?.data_consegna_prevista ?? '')
    setStato(ordine?.stato ?? 'da_ordinare')
    setRichiedeConferma(ordine?.richiede_conferma ?? false)
    setNote(ordine?.note ?? '')
    setAllegatiInAttesa([])
    setRighe(
      ordine?.righe.map((r) => ({
        tipo: r.tipo,
        descrizione: r.descrizione,
        codice_articolo: r.codice_articolo,
        finitura: r.finitura,
        quantita: r.quantita,
        unita_misura: r.unita_misura,
        prezzo_unitario: r.prezzo_unitario,
        ordine: r.ordine,
      })) ?? [
        { tipo: 'articolo', descrizione: '', codice_articolo: null, finitura: null, quantita: null, unita_misura: 'pz', prezzo_unitario: null, ordine: 0 },
      ]
    )
  }, [open, ordine, numeroProposto, commessaId])

  // Cambiando fornitore l'interruttore prende la sua impostazione d'anagrafica;
  // resta comunque modificabile sul singolo ordine.
  const scegliFornitore = (id: string) => {
    setFornitoreId(id)
    setRichiedeConferma(Boolean(fornitori.find((f) => f.id === id)?.richiede_conferma))
  }

  /** Carica gli allegati scelti prima del salvataggio. Torna l'errore, o null. */
  const caricaAllegati = async (ordineId: string): Promise<string | null> => {
    for (const f of allegatiInAttesa) {
      const errore = await caricaAllegatoOrdine(ordineId, f)
      if (errore) return errore
    }
    return null
  }

  const salva = async () => {
    // I separatori sono righe vuote: da soli non fanno un ordine.
    if (righe.every((r) => r.tipo === 'separatore' || r.descrizione.trim() === '')) {
      toast.error('Aggiungi almeno una riga')
      return
    }
    // Il DB impone quantita > 0 ai soli articoli: fermiamo qui quelli compilati
    // senza quantita.
    const senzaQuantita = righe.findIndex(
      (r) =>
        r.tipo === 'articolo' &&
        r.descrizione.trim() !== '' &&
        !(r.quantita !== null && r.quantita > 0)
    )
    if (senzaQuantita !== -1) {
      toast.error(`Inserisci la quantità della riga ${senzaQuantita + 1}`)
      return
    }
    if (inCalendario) {
      if (!consegna) {
        toast.error('Per inserire l’arrivo in calendario serve la consegna prevista')
        return
      }
      if (!calendario.tipo) {
        toast.error('Scegli il tipo di attività per il calendario')
        return
      }
      if (calendario.ora_fine <= calendario.ora_inizio) {
        toast.error('Calendario: l’orario di fine deve venire dopo quello di inizio')
        return
      }
    }
    setSaving(true)
    try {
      const commessa_id = commesse
        ? (commessaSel === MAGAZZINO ? null : commessaSel)
        : commessaId
      const input = {
        commessa_id,
        fornitore_id: fornitoreId || null,
        numero_ordine: numero.trim(),
        data_ordine: dataOrdine,
        data_consegna_prevista: consegna || null,
        stato,
        richiede_conferma: richiedeConferma,
        note: note.trim() || null,
        righe,
        calendario: !calendarioLetto ? undefined : inCalendario ? calendario : null,
      }
      if (ordine) {
        await updateOrdine(ordine.id, input)
        toast.success(inCalendario ? 'Ordine aggiornato, arrivo in calendario' : 'Ordine aggiornato')
      } else {
        const nuovoId = await createOrdine(input)
        // L'ordine c'e' comunque: se gli allegati falliscono lo si dice senza
        // buttare via il resto, e si riaprono per riprovare.
        const erroreAllegati = await caricaAllegati(nuovoId)
        if (erroreAllegati) toast.error(`Ordine creato, allegati non caricati: ${erroreAllegati}`)
        else toast.success(inCalendario ? 'Ordine creato e arrivo inserito in calendario' : 'Ordine creato')
      }
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
      <DialogContent wide>
        <DialogHeader className="shrink-0">
          <DialogTitle>{ordine ? 'Modifica ordine' : 'Nuovo ordine fornitore'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {commesse && (
              <div className="space-y-1.5">
                <Label>Commessa</Label>
                <Select value={commessaSel} onValueChange={setCommessaSel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={MAGAZZINO}>Magazzino (nessuna commessa)</SelectItem>
                    {commesse.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.numero_commessa || 'Senza numero'} — {c.cliente_nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Fornitore</Label>
              <Select value={fornitoreId} onValueChange={scegliFornitore}>
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
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500 dark:text-gray-400">
                  {PREFISSO_ORDINE}
                </span>
                <Input
                  className="pl-11"
                  placeholder="011-2026"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                />
              </div>
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

          <label htmlFor="ordine-richiede-conferma" className="flex items-start gap-3 rounded-md border p-3">
            <Switch
              id="ordine-richiede-conferma"
              checked={richiedeConferma}
              onCheckedChange={setRichiedeConferma}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium">Richiedi conferma d’ordine</span>
              <span className="block text-xs text-muted-foreground">
                Nella mail compare “Carica conferma d’ordine”: quando il fornitore la carica, la trovi in Produzione da firmare.
              </span>
            </span>
          </label>

          {calendarioLetto && tipiProduzione.length > 0 && (
            <div className="space-y-3 rounded-md border p-3">
              <label className="flex items-center gap-3 text-sm font-medium">
                <Switch checked={inCalendario} onCheckedChange={setInCalendario} />
                Inserisci l’arrivo in calendario
              </label>
              {inCalendario && (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="ordine-cal-tipo">Tipo di attività</Label>
                      <Select value={calendario.tipo} onValueChange={(v) => setCalendario((c) => ({ ...c, tipo: v }))}>
                        <SelectTrigger id="ordine-cal-tipo"><SelectValue placeholder="Scegli" /></SelectTrigger>
                        <SelectContent>
                          {tipiProduzione.map((t) => (
                            <SelectItem key={t.id} value={t.chiave}>{t.etichetta}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ordine-cal-inizio">Dalle</Label>
                      <Input
                        id="ordine-cal-inizio" type="time" value={calendario.ora_inizio}
                        onChange={(e) => setCalendario((c) => ({ ...c, ora_inizio: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ordine-cal-fine">Alle</Label>
                      <Input
                        id="ordine-cal-fine" type="time" value={calendario.ora_fine}
                        onChange={(e) => setCalendario((c) => ({ ...c, ora_fine: e.target.value }))}
                      />
                    </div>
                  </div>
                  <p className={`text-xs ${consegna ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400'}`}>
                    {consegna
                      ? `Giorno: ${formatGiorno(consegna)} (consegna prevista). Nelle note dell’evento vanno fornitore e numero d’ordine.`
                      : 'Inserisci la consegna prevista: è il giorno dell’evento in calendario.'}
                  </p>
                </>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Righe</Label>
            <RigheOrdine righe={righe} onChange={setRighe} />
          </div>

          <div className="text-right text-sm font-semibold">
            Totale: {formatEuro(calcolaTotaleOrdine(righe))}
          </div>

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>

          <div className="space-y-1.5">
            <Label>Allegati</Label>
            <AllegatiOrdine
              ordineId={ordine?.id ?? null}
              inAttesa={allegatiInAttesa}
              onInAttesaChange={setAllegatiInAttesa}
            />
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={salva} disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
