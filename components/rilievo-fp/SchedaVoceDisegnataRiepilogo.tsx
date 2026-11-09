'use client'

import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import DisegnoSvg from '@/components/rilievo-grafico/DisegnoSvg'
import { db } from '@/lib/db'
import { formatMq } from '@/lib/fppro/riepilogo'
import { calcolaDisegno } from '@/lib/rilievo-grafico/geometria'
import { datiRiepilogoDisegnata } from '@/lib/rilievo-grafico/riepilogo-disegnata'
import { disegnoDellaVoce } from '@/lib/rilievo-unico'
import type { VoceDisegnata } from '@/types/rilievo-fp'
import { Campo } from './SchedaVoceRiepilogo'

/**
 * Voce disegnata in forma compatta, con la stessa cornice della scheda FP PRO (5 per foglio
 * A4): a sinistra il disegno con le scritte dei lati, a destra i dati. Il prezzo non c'e':
 * le voci disegnate sono ancora fuori dal calcolo.
 */
export default function SchedaVoceDisegnataRiepilogo({ voce, numero, conPrezzo }: { voce: VoceDisegnata; numero: number; conPrezzo: boolean }) {
  const nomiSerie = useLiveQuery(async () => {
    const righe = await db.fpSerie.where('fp_id').anyOf(voce.grafico.serie).toArray()
    return new Map(righe.map(s => [s.fp_id, s.nome]))
  }, [voce.grafico.serie], new Map<number, string>())
  const d = datiRiepilogoDisegnata(voce, nomiSerie)
  const calc = useMemo(() => calcolaDisegno(disegnoDellaVoce(voce)), [voce])

  return (
    <div className="grid grid-cols-[13rem_minmax(0,1fr)] overflow-hidden rounded border border-gray-400 bg-white text-[11px] leading-tight text-gray-900 print:h-[46mm] print:break-inside-avoid">
      <div className="flex flex-col border-r border-gray-300 p-1">
        <div className="flex items-baseline justify-between gap-1">
          <span className="truncate text-[12px] font-bold text-blue-900">{numero}. {voce.posizione || 'Senza riferimento'}</span>
          <span className="shrink-0 text-[10px] font-semibold text-orange-600">Mq {formatMq(d.mq)}</span>
        </div>
        <div className="flex h-28 items-center justify-center print:h-[36mm]">
          <DisegnoSvg calc={calc} modo="miniatura" scritteLati={voce.grafico.noteLati} className="h-full w-full" />
        </div>
      </div>
      <div className="grid grid-cols-2 content-start">
        <div className="col-span-2 flex items-baseline gap-2 border-b border-gray-300 bg-gray-100 px-1 py-0.5 leading-tight">
          <span className="text-[11px] font-bold">Q.tà {voce.quantita}</span>
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">{d.tipo}</span>
          <span className="shrink-0 text-[12px] font-bold">{d.larghezza} × {d.altezza} mm</span>
        </div>
        <Campo etichetta="Serie" valore={d.serie} />
        <Campo etichetta="Colore accessori" valore={d.coloreAcc} />
        <Campo etichetta="Finitura est." valore={d.finituraEst} />
        <Campo etichetta="Finitura int." valore={d.finituraInt} />
        {d.accessori && <Campo etichetta="Accessori" valore={d.accessori} largo />}
        <div className="col-span-2 px-1 py-px text-[10px] leading-tight">
          <p className="line-clamp-2"><span className="text-[9px] uppercase tracking-wide text-gray-500">Note </span>{d.note ?? '—'}</p>
        </div>
        {conPrezzo && (
          <div className="col-span-2 flex justify-end border-t border-gray-300 px-1 py-px text-[11px] leading-tight">
            <span className="text-gray-400">Voce disegnata: esclusa dal calcolo</span>
          </div>
        )}
      </div>
    </div>
  )
}
