// components/calendario/CalendarioProduzione.tsx
'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { ChevronLeft, ChevronRight, Plus, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { fasciaGriglia, minutiDaOra, oraDaMinuti, snapMinuti } from '@/lib/calendario'
import { spostaEvento } from '@/actions/calendario'
import GrigliaGantt from './GrigliaGantt'
import DialogEvento, { type NuovoEvento } from './DialogEvento'
import CodaDaPianificare, { PREFISSO_VOCE } from './CodaDaPianificare'
import DialogSceltaCommessa from './DialogSceltaCommessa'
import ListaGiorniMobile from './ListaGiorniMobile'
import StampaGantt from './StampaGantt'
import type {
  AspettiTipo, Chiusura, EventoConContesto, OrariLavoro, TipoAttivita,
} from '@/types/calendario'
import type { CommessaOpzione } from '@/types/produzione'

export const NOMI_MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

export default function CalendarioProduzione({
  anno,
  mese,
  eventi,
  tipi,
  orari,
  chiusure,
  commesse,
  modificabile,
}: {
  anno: number
  mese: number
  eventi: EventoConContesto[]
  /** Anagrafica dei tipi: etichette, colori e giorni da evidenziare. */
  tipi: TipoAttivita[]
  orari: OrariLavoro
  chiusure: Chiusura[]
  /** Commesse aperte: colonna laterale, scelta da slot e selettore del dialog. */
  commesse: CommessaOpzione[]
  modificabile: boolean
}) {
  const router = useRouter()
  const [inCorso, startTransition] = useTransition()
  const [eventoAperto, setEventoAperto] = useState<EventoConContesto | null>(null)
  const [nuovo, setNuovo] = useState<NuovoEvento | null>(null)
  const [slotScelta, setSlotScelta] = useState<{ data: string; ora: string } | null>(null)

  const tipiProduzione = useMemo(
    () => tipi.filter((t) => t.ambito === 'produzione'),
    [tipi]
  )
  const aspetti: AspettiTipo = useMemo(
    () => Object.fromEntries(
      tipi.map((t) => [t.chiave, { label: t.etichetta, sfondo: t.sfondo, testo: t.testo }])
    ),
    [tipi]
  )
  const tipoPredefinito = tipiProduzione[0]?.chiave ?? 'lavorazione'

  // La larghezza della pista sta nello stato e non in una ref: serve anche in
  // fase di render, per dire alle barre quanti minuti vale un pixel.
  const [larghezzaPista, setLarghezzaPista] = useState(0)
  const sensori = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  /** Quanti minuti di griglia vale un pixel di pista. */
  const calcolaMinutiPerPixel = () => {
    const fascia = fasciaGriglia(orari)
    if (larghezzaPista <= 0) return 0
    return (minutiDaOra(fascia.fine) - minutiDaOra(fascia.inizio)) / larghezzaPista
  }

  const vaiA = (deltaMesi: number) => {
    const d = new Date(anno, mese - 1 + deltaMesi, 1)
    startTransition(() => {
      router.push(
        `/produzione/calendario?anno=${d.getFullYear()}&mese=${d.getMonth() + 1}`
      )
    })
  }

  const applicaSpostamento = async (
    id: string, data: string, oraInizio: string, oraFine: string
  ) => {
    try {
      await spostaEvento(id, data, oraInizio, oraFine)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore nello spostamento')
    }
  }

  const handleDragEnd = (e: DragEndEvent) => {
    if (!modificabile || !e.over) return

    const idAttivo = String(e.active.id)
    if (idAttivo.startsWith(PREFISSO_VOCE)) {
      // 'coda:<idCommessa>' — il tipo di attivita' si sceglie nel dialog, che
      // si apre gia' compilato con giorno e commessa.
      const idCommessa = idAttivo.slice(PREFISSO_VOCE.length)
      const commessa = commesse.find((c) => c.id === idCommessa)
      setNuovo({
        data: String(e.over.id),
        ora_inizio: '08:00',
        ora_fine: '17:30',
        tipo: 'lavorazione',
        commessa_id: idCommessa,
        cliente_nome: commessa?.cliente_nome ?? null,
      })
      return
    }

    const evento = eventi.find((x) => x.id === e.active.id)
    if (!evento) return

    const fascia = fasciaGriglia(orari)
    const minutiPerPixel = calcolaMinutiPerPixel()

    const durata = minutiDaOra(evento.ora_fine) - minutiDaOra(evento.ora_inizio)
    const inizioAttuale = minutiDaOra(evento.ora_inizio)
    const limiteMax = minutiDaOra(fascia.fine) - durata
    const nuovoInizio = Math.max(
      minutiDaOra(fascia.inizio),
      Math.min(limiteMax, snapMinuti(inizioAttuale + e.delta.x * minutiPerPixel))
    )

    const nuovaData = String(e.over.id)
    if (nuovaData === evento.data && nuovoInizio === inizioAttuale) return

    void applicaSpostamento(
      evento.id,
      nuovaData,
      oraDaMinuti(nuovoInizio),
      oraDaMinuti(nuovoInizio + durata)
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <StampaGantt />
      <h1 className="hidden text-center text-base font-semibold print:block">
        Calendario A.L.M. WP — {NOMI_MESI[mese - 1]} {anno}
      </h1>

      <div className="no-stampa flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => vaiA(-1)} disabled={inCorso}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="min-w-48 text-center text-lg font-semibold">
            {NOMI_MESI[mese - 1]} {anno}
          </h1>
          <Button variant="outline" size="sm" onClick={() => vaiA(1)} disabled={inCorso}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2 text-[11px]">
            {tipiProduzione.map((tipo) => (
              <span key={tipo.id} className="flex items-center gap-1">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: tipo.sfondo }}
                />
                {tipo.etichetta}
              </span>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" />
            Stampa
          </Button>
          {modificabile && (
            <Button
              size="sm"
              onClick={() =>
                setNuovo({
                  data: new Date().toISOString().slice(0, 10),
                  ora_inizio: '08:00',
                  ora_fine: '17:30',
                  tipo: tipoPredefinito,
                })
              }
            >
              <Plus className="mr-1 h-4 w-4" />
              Nuova attività
            </Button>
          )}
        </div>
      </div>

      <div className="hidden min-[900px]:block">
        <DndContext sensors={sensori} onDragEnd={handleDragEnd}>
          <div className="flex gap-4">
            {modificabile && (
              <div className="no-stampa">
                <CodaDaPianificare commesse={commesse} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <GrigliaGantt
                anno={anno}
                mese={mese}
                eventi={eventi}
                tipi={tipiProduzione}
                orari={orari}
                chiusure={chiusure}
                onApriEvento={setEventoAperto}
                onPistaNodo={(nodo) => {
                  const larghezza = nodo?.offsetWidth ?? 0
                  if (larghezza > 0 && larghezza !== larghezzaPista) setLarghezzaPista(larghezza)
                }}
                minutiPerPixel={calcolaMinutiPerPixel()}
                onRidimensiona={modificabile ? applicaSpostamento : undefined}
                modificabile={modificabile}
              />
            </div>
          </div>
        </DndContext>
      </div>

      <div className="min-[900px]:hidden">
        <ListaGiorniMobile
          anno={anno}
          mese={mese}
          eventi={eventi}
          aspetti={aspetti}
          orari={orari}
          chiusure={chiusure}
          onApriEvento={setEventoAperto}
        />
      </div>

      {slotScelta && (
        <DialogSceltaCommessa
          data={slotScelta.data}
          ora={slotScelta.ora}
          commesse={commesse}
          onClose={() => setSlotScelta(null)}
          onScegli={(commessa) => {
            const [h, m] = slotScelta.ora.split(':')
            setNuovo({
              data: slotScelta.data,
              ora_inizio: slotScelta.ora,
              ora_fine: `${String(Math.min(Number(h) + 1, 23)).padStart(2, '0')}:${m}`,
              tipo: tipoPredefinito,
              commessa_id: commessa?.id ?? null,
              cliente_nome: commessa?.cliente_nome ?? null,
            })
            setSlotScelta(null)
          }}
        />
      )}

      {(eventoAperto || nuovo) && (
        <DialogEvento
          evento={eventoAperto}
          nuovo={nuovo}
          tipi={tipiProduzione}
          commesse={commesse}
          onClose={() => {
            setEventoAperto(null)
            setNuovo(null)
          }}
        />
      )}
    </div>
  )
}
