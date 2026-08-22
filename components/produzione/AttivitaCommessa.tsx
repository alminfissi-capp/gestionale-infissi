// components/produzione/AttivitaCommessa.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Ban, Check, Loader2, Pencil, Play, Plus, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import DialogEvento, { type NuovoEvento } from '@/components/calendario/DialogEvento'
import { getEventiCommessa, getTipiAttivita, setStatoEvento } from '@/actions/calendario'
import { aspettoDi, STATO_EVENTO_LABEL } from '@/types/calendario'
import type {
  AspettiTipo, EventoConContesto, StatoEvento, TipoAttivita,
} from '@/types/calendario'
import type { CommessaOpzione } from '@/types/produzione'

/**
 * Le attività di una commessa sono le stesse righe del calendario della
 * Produzione: qui si vedono in elenco invece che sul Gantt, e si programmano
 * con lo stesso dialog. Quello che si inserisce di qua compare di là, e
 * viceversa.
 */

const giornoBreve = (data: string): string => {
  const [, m, g] = data.split('-')
  return `${g}/${m}`
}

const oreBrevi = (evento: EventoConContesto): string =>
  evento.tutto_il_giorno
    ? 'tutto il giorno'
    : `${evento.ora_inizio.slice(0, 5)}–${evento.ora_fine.slice(0, 5)}`

/** I quattro tasti di avanzamento, nell’ordine in cui stanno sulla riga. */
const AZIONI: { stato: StatoEvento; icona: typeof Play; titolo: string }[] = [
  { stato: 'in_corso',    icona: Play,   titolo: 'Avvia'      },
  { stato: 'programmato', icona: Square, titolo: 'Ferma'      },
  { stato: 'bloccato',    icona: Ban,    titolo: 'Bloccata'   },
  { stato: 'completato',  icona: Check,  titolo: 'Completata' },
]

export default function AttivitaCommessa({
  commessaId,
  numeroCommessa,
  clienteNome,
}: {
  commessaId: string
  numeroCommessa: string | null
  clienteNome: string
}) {
  const [eventi, setEventi] = useState<EventoConContesto[]>([])
  const [tipi, setTipi] = useState<TipoAttivita[]>([])
  const [caricamento, setCaricamento] = useState(true)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [inModifica, setInModifica] = useState<EventoConContesto | null>(null)
  const [nuovo, setNuovo] = useState<NuovoEvento | null>(null)

  const ricarica = useCallback(async () => {
    try {
      const [e, t] = await Promise.all([getEventiCommessa(commessaId), getTipiAttivita()])
      setEventi(e)
      setTipi(t)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore nel caricamento delle attività')
    } finally {
      setCaricamento(false)
    }
  }, [commessaId])

  useEffect(() => {
    void ricarica()
  }, [ricarica])

  // Gli stessi colori del calendario: la legenda appesa in officina resta vera.
  const aspetti: AspettiTipo = Object.fromEntries(
    tipi.map((t) => [t.chiave, { label: t.etichetta, sfondo: t.sfondo, testo: t.testo }])
  )

  const tipiProduzione = tipi.filter((t) => t.ambito === 'produzione' && !t.sistema)

  const commessaOpzione: CommessaOpzione[] = [{
    id: commessaId,
    numero_commessa: numeroCommessa ?? '',
    cliente_nome: clienteNome,
  }]

  const cambiaStato = async (evento: EventoConContesto, stato: StatoEvento) => {
    if (evento.stato === stato) return
    setSalvando(evento.id)
    // Ottimistico: il tasto deve rispondere subito, in officina si tocca al volo
    setEventi((prec) => prec.map((e) => (e.id === evento.id ? { ...e, stato } : e)))
    try {
      await setStatoEvento(evento.id, stato)
    } catch (err) {
      setEventi((prec) => prec.map((e) => (e.id === evento.id ? { ...e, stato: evento.stato } : e)))
      toast.error(err instanceof Error ? err.message : 'Errore nel salvataggio')
    } finally {
      setSalvando(null)
    }
  }

  const apriNuova = () => {
    setNuovo({
      data: new Date().toISOString().slice(0, 10),
      ora_inizio: '08:00',
      ora_fine: '17:30',
      tipo: tipiProduzione[0]?.chiave ?? 'lavorazione',
      commessa_id: commessaId,
      cliente_nome: clienteNome,
    })
  }

  const chiudiDialog = () => {
    setInModifica(null)
    setNuovo(null)
    void ricarica()
  }

  /** Un tipo creato altrove non deve sparire dal selettore quando si modifica. */
  const tipiPerDialog = (evento: EventoConContesto | null): TipoAttivita[] => {
    if (!evento) return tipiProduzione
    if (tipiProduzione.some((t) => t.chiave === evento.tipo)) return tipiProduzione
    const suo = tipi.find((t) => t.chiave === evento.tipo)
    return suo ? [suo, ...tipiProduzione] : tipiProduzione
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Attività</h2>
        <Button size="sm" className="gap-2" onClick={apriNuova}>
          <Plus className="h-4 w-4" /> Nuova attività
        </Button>
      </div>

      {caricamento ? (
        <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Caricamento…
        </p>
      ) : eventi.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Nessuna attività programmata per questa commessa.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {eventi.map((evento) => {
            const aspetto = aspettoDi(aspetti, evento.tipo)
            const chiusa = evento.stato === 'completato'
            const soloLettura = evento.scadenza_id !== null
            return (
              <li
                key={evento.id}
                className="flex items-center gap-2 rounded-md px-2.5 py-2 shadow-sm"
                style={{
                  backgroundColor: aspetto.sfondo,
                  color: aspetto.testo,
                  opacity: chiusa || evento.stato === 'bloccato' ? 0.62 : 1,
                }}
              >
                <div className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span className="shrink-0 font-mono text-[11px] opacity-80">
                    {giornoBreve(evento.data)} · {oreBrevi(evento)}
                  </span>
                  <span className={`truncate text-sm font-semibold ${chiusa ? 'line-through' : ''}`}>
                    {aspetto.label}
                  </span>
                  {evento.note && (
                    <span className="truncate text-xs opacity-80">· {evento.note}</span>
                  )}
                  {evento.stato !== 'programmato' && (
                    <span className="shrink-0 rounded-full bg-black/15 px-1.5 py-0.5 text-[10px] font-medium">
                      {STATO_EVENTO_LABEL[evento.stato]}
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  {AZIONI.map(({ stato, icona: Icona, titolo }) => {
                    const attiva = evento.stato === stato
                    return (
                      <button
                        key={stato}
                        type="button"
                        title={titolo}
                        aria-label={titolo}
                        aria-pressed={attiva}
                        disabled={salvando === evento.id}
                        onClick={() => cambiaStato(evento, stato)}
                        className={`rounded p-1.5 transition-colors hover:bg-black/15 disabled:opacity-50 ${
                          attiva ? 'bg-black/20 ring-1 ring-current' : 'opacity-70 hover:opacity-100'
                        }`}
                      >
                        <Icona className="h-4 w-4" />
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    title={soloLettura ? 'Nasce da una scadenza: si modifica da lì' : 'Modifica'}
                    aria-label="Modifica attività"
                    disabled={soloLettura}
                    onClick={() => setInModifica(evento)}
                    className="ml-1 rounded p-1.5 opacity-70 transition-colors hover:bg-black/15 hover:opacity-100 disabled:opacity-30"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {(inModifica || nuovo) && (
        <DialogEvento
          evento={inModifica}
          nuovo={nuovo}
          tipi={tipiPerDialog(inModifica)}
          commesse={commessaOpzione}
          onClose={chiudiDialog}
        />
      )}
    </section>
  )
}
