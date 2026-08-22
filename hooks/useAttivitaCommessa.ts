'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getEventiCommessa, getTipiAttivita, setStatoEvento } from '@/actions/calendario'
import { calcolaAvanzamento } from '@/lib/avanzamento'
import type { Avanzamento } from '@/lib/avanzamento'
import type {
  AspettiTipo, EventoConContesto, StatoEvento, TipoAttivita,
} from '@/types/calendario'

/**
 * Le attività di una commessa, caricate una volta sola e condivise da chi le
 * elenca e da chi ne disegna l'avanzamento: spuntare "completata" deve
 * muovere l'anello nello stesso istante, senza un secondo giro sul database.
 */
export type AttivitaCommessa = {
  eventi: EventoConContesto[]
  tipi: TipoAttivita[]
  /** Chiave del tipo -> colori, come li vuole il calendario. */
  aspetti: AspettiTipo
  avanzamento: Avanzamento
  caricamento: boolean
  /** Id dell'attività il cui stato si sta salvando, se ce n'è una. */
  salvando: string | null
  cambiaStato: (evento: EventoConContesto, stato: StatoEvento) => Promise<void>
  ricarica: () => Promise<void>
}

export function useAttivitaCommessa(commessaId: string): AttivitaCommessa {
  const [eventi, setEventi] = useState<EventoConContesto[]>([])
  const [tipi, setTipi] = useState<TipoAttivita[]>([])
  const [caricamento, setCaricamento] = useState(true)
  const [salvando, setSalvando] = useState<string | null>(null)

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
  const aspetti: AspettiTipo = useMemo(
    () => Object.fromEntries(
      tipi.map((t) => [t.chiave, { label: t.etichetta, sfondo: t.sfondo, testo: t.testo }])
    ),
    [tipi]
  )

  const avanzamento = useMemo(
    () => calcolaAvanzamento(eventi, aspetti),
    [eventi, aspetti]
  )

  const cambiaStato = useCallback(
    async (evento: EventoConContesto, stato: StatoEvento) => {
      if (evento.stato === stato) return
      setSalvando(evento.id)
      // Ottimistico: il tasto deve rispondere subito, in officina si tocca al
      // volo. Anche il cronometro parte (o si ferma) qui, poi la risposta del
      // database rimette i secondi veri.
      const provvisorio = {
        stato,
        avviato_at: stato === 'in_corso' ? new Date().toISOString() : null,
      }
      setEventi((prec) => prec.map((e) => (e.id === evento.id ? { ...e, ...provvisorio } : e)))
      try {
        const patch = await setStatoEvento(evento.id, stato)
        setEventi((prec) => prec.map((e) => (e.id === evento.id ? { ...e, ...patch } : e)))
      } catch (err) {
        setEventi((prec) =>
          prec.map((e) => (e.id === evento.id
            ? {
                ...e,
                stato: evento.stato,
                avviato_at: evento.avviato_at,
                secondi_lavorati: evento.secondi_lavorati,
              }
            : e))
        )
        toast.error(err instanceof Error ? err.message : 'Errore nel salvataggio')
      } finally {
        setSalvando(null)
      }
    },
    []
  )

  return { eventi, tipi, aspetti, avanzamento, caricamento, salvando, cambiaStato, ricarica }
}
