// components/calendario/GrigliaGantt.tsx
'use client'

import { useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import {
  fasciaGriglia,
  impilaEventi,
  minutiDaOra,
  oraDaMinuti,
  posizioneBarra,
  snapMinuti,
  statoGiorno,
} from '@/lib/calendario'
import BarraEvento, { ALTEZZA_BARRA } from './BarraEvento'
import { ASPETTO_TIPO } from '@/types/calendario'
import type { Chiusura, EventoConContesto, OrariLavoro } from '@/types/calendario'

const ALTEZZA_MINIMA_RIGA = 34

/** Etichette a ora piena da mostrare in testata. */
function oreDellaFascia(inizio: string, fine: string): string[] {
  const ore: string[] = []
  const primaOra = Math.ceil(minutiDaOra(inizio) / 60) * 60
  for (let m = primaOra; m <= minutiDaOra(fine); m += 60) ore.push(oraDaMinuti(m))
  return ore
}

/** Tutti i giorni del mese in forma 'YYYY-MM-DD'. */
export function giorniDelMese(anno: number, mese: number): string[] {
  const ultimo = new Date(anno, mese, 0).getDate()
  const mm = String(mese).padStart(2, '0')
  return Array.from(
    { length: ultimo },
    (_, i) => `${anno}-${mm}-${String(i + 1).padStart(2, '0')}`
  )
}

/** Pista di un giorno che accetta il rilascio di una barra. */
function PistaGiorno({
  data, altezza, onNodo, onClickVuoto, children,
}: {
  data: string
  altezza: number
  /** Il contenitore misura la pista per convertire i pixel in minuti. */
  onNodo?: (nodo: HTMLDivElement | null) => void
  /** Clic su una zona libera: la frazione e' la posizione orizzontale, 0-1. */
  onClickVuoto?: (data: string, frazione: number) => void
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: data })
  return (
    <div
      ref={(nodo) => {
        setNodeRef(nodo)
        onNodo?.(nodo)
      }}
      onClick={(e) => {
        if (!onClickVuoto) return
        const riquadro = e.currentTarget.getBoundingClientRect()
        if (riquadro.width <= 0) return
        onClickVuoto(data, (e.clientX - riquadro.left) / riquadro.width)
      }}
      className={`relative flex-1 ${isOver ? 'bg-sky-50 dark:bg-sky-950/30' : ''}`}
      style={{ height: altezza }}
    >
      {children}
    </div>
  )
}

export default function GrigliaGantt({
  anno,
  mese,
  eventi,
  orari,
  chiusure,
  onApriEvento,
  onPistaNodo,
  onRidimensiona,
  onSlotVuoto,
  minutiPerPixel,
  modificabile,
}: {
  anno: number
  mese: number
  eventi: EventoConContesto[]
  orari: OrariLavoro
  chiusure: Chiusura[]
  onApriEvento?: (evento: EventoConContesto) => void
  onPistaNodo?: (nodo: HTMLDivElement | null) => void
  onRidimensiona?: (id: string, data: string, oraInizio: string, oraFine: string) => void
  /** Clic su una zona libera della giornata: apre la scelta della commessa. */
  onSlotVuoto?: (data: string, ora: string) => void
  minutiPerPixel?: number
  modificabile?: boolean
}) {
  const fascia = useMemo(() => fasciaGriglia(orari), [orari])
  const ore = useMemo(() => oreDellaFascia(fascia.inizio, fascia.fine), [fascia])
  const giorni = useMemo(() => giorniDelMese(anno, mese), [anno, mese])

  const eventiPerGiorno = useMemo(() => {
    const mappa = new Map<string, EventoConContesto[]>()
    for (const e of eventi) {
      if (!mappa.has(e.data)) mappa.set(e.data, [])
      mappa.get(e.data)!.push(e)
    }
    return mappa
  }, [eventi])

  return (
    <div className="gantt-scroll overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="min-w-[560px]">
        {/* Testata delle ore */}
        <div className="flex border-b border-gray-300 bg-gray-50 text-xs font-medium dark:border-gray-600 dark:bg-gray-800">
          <div className="w-14 shrink-0 border-r border-gray-300 px-2 py-1 dark:border-gray-600">
            Giorno
          </div>
          <div className="relative flex-1 py-1">
            {ore.map((ora, i) => (
              <span
                key={ora}
                // La prima e l'ultima etichetta restano dentro la pista: centrate
                // finirebbero sopra la colonna del giorno e fuori dal bordo destro.
                className={`absolute text-gray-600 dark:text-gray-300 ${
                  i === 0 ? '' : i === ore.length - 1 ? '-translate-x-full' : '-translate-x-1/2'
                }`}
                style={{ left: `${posizioneBarra(ora, ora, fascia).sinistraPct}%` }}
              >
                {ora}
              </span>
            ))}
          </div>
        </div>

        {/* Una riga per giorno */}
        {giorni.map((data, indice) => {
          const stato = statoGiorno(data, orari, chiusure)
          const delGiorno = eventiPerGiorno.get(data) ?? []
          const impilati = impilaEventi(delGiorno)
          const numeroRighe = impilati.reduce((max, e) => Math.max(max, e.riga + 1), 0)
          const altezza = Math.max(ALTEZZA_MINIMA_RIGA, numeroRighe * ALTEZZA_BARRA + 6)
          // `StatoGiorno` e' un'unione discriminata: gli orari esistono solo a
          // giorno aperto, quindi la fascia grigia si calcola dentro il ramo.
          const oltreChiusura = stato.aperto
            ? posizioneBarra(stato.chiusura, fascia.fine, fascia)
            : null
          const giornoDiPosa = stato.aperto && delGiorno.some((e) => e.tipo === 'posa')
          // Righe verticali a ora piena, uguali per ogni giorno.
          const righeOre = ore.map((ora) => (
            <div
              key={ora}
              className="absolute inset-y-0 w-px bg-gray-100 dark:bg-gray-800"
              style={{ left: `${posizioneBarra(ora, ora, fascia).sinistraPct}%` }}
            />
          ))

          return (
            <div
              key={data}
              className="gantt-giorno flex border-b border-gray-200 dark:border-gray-700"
              style={{ height: altezza }}
            >
              <div
                className={`flex w-14 shrink-0 items-center justify-center border-r border-gray-300 text-sm font-semibold dark:border-gray-600 ${
                  stato.aperto
                    ? 'bg-white text-gray-700 dark:bg-gray-900 dark:text-gray-200'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                }`}
                // Il verde segnala i giorni di posa, come sul foglio in officina:
                // sono quelli che si cercano a colpo d'occhio.
                style={
                  giornoDiPosa
                    ? { backgroundColor: ASPETTO_TIPO.posa.sfondo, color: ASPETTO_TIPO.posa.testo }
                    : undefined
                }
              >
                {Number(data.slice(8, 10))}
              </div>

              {stato.aperto ? (
                <PistaGiorno
                  data={data}
                  altezza={altezza}
                  onNodo={indice === 0 ? onPistaNodo : undefined}
                  onClickVuoto={
                    onSlotVuoto
                      ? (giorno, frazione) => {
                          const durata = minutiDaOra(fascia.fine) - minutiDaOra(fascia.inizio)
                          const minuti = minutiDaOra(fascia.inizio) + frazione * durata
                          onSlotVuoto(giorno, oraDaMinuti(snapMinuti(minuti)))
                        }
                      : undefined
                  }
                >
                  {righeOre}
                  {/* Mezza giornata: la fascia oltre la chiusura e' grigia */}
                  {oltreChiusura && oltreChiusura.larghezzaPct > 0 && (
                    <div
                      className="absolute inset-y-0 bg-gray-200/70 dark:bg-gray-700/50"
                      style={{
                        left: `${oltreChiusura.sinistraPct}%`,
                        width: `${oltreChiusura.larghezzaPct}%`,
                      }}
                    />
                  )}
                  {/* Connettore delle lavorazioni continuative: lega
                      visivamente i giorni della stessa catena. */}
                  {impilati
                    .filter((ev) => ev.catena_id)
                    .map((ev) => (
                      <div
                        key={`catena-${ev.id}`}
                        className="absolute inset-y-0 w-1"
                        style={{
                          left: `${posizioneBarra(ev.ora_inizio, ev.ora_fine, fascia).sinistraPct}%`,
                          backgroundColor: ASPETTO_TIPO[ev.tipo].sfondo,
                          opacity: 0.55,
                        }}
                      />
                    ))}
                  {impilati.map((e) => {
                    const p = posizioneBarra(e.ora_inizio, e.ora_fine, fascia)
                    return (
                      <BarraEvento
                        key={e.id}
                        evento={e}
                        sinistraPct={p.sinistraPct}
                        larghezzaPct={p.larghezzaPct}
                        riga={e.riga}
                        trascinabile={modificabile}
                        minutiPerPixel={minutiPerPixel}
                        onRidimensiona={
                          onRidimensiona
                            ? (id, oraInizio, oraFine) =>
                                onRidimensiona(id, e.data, oraInizio, oraFine)
                            : undefined
                        }
                        onClick={onApriEvento ? () => onApriEvento(e) : undefined}
                      />
                    )
                  })}
                </PistaGiorno>
              ) : (
                // I giorni chiusi non accettano rilasci: restano un div semplice.
                <div className="relative flex-1">
                  {righeOre}
                  <div className="absolute inset-0 flex items-center bg-red-600 px-3 text-xs font-semibold text-white">
                    CHIUSO — {stato.motivoChiusura}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
