'use client'

import { formatEuro } from '@/lib/pricing'
import { datiRiepilogo, formatMq, type StatoPrezzo } from '@/lib/fppro/riepilogo'
import DisegnoVoceSvg from './DisegnoVoceSvg'
import type { StrutturaLocale, VoceFp } from '@/types/rilievo-fp'

interface Props {
  voce: VoceFp
  struttura: StrutturaLocale | null
  /** null = prezzi nascosti */
  prezzo: StatoPrezzo | null
  numero: number
}

/** largo = tutta la riga e a capo su 2 righe (profili, accessori): su una riga sola in stampa usciva dalla scheda */
function Campo({ etichetta, valore, largo }: { etichetta: string; valore: string | null; largo?: boolean }) {
  return (
    <div className={`min-w-0 border-b border-gray-200 px-1 py-px text-[11px] leading-tight ${largo ? 'col-span-2 line-clamp-2 break-words' : 'truncate'}`}>
      <span className="text-[9px] uppercase tracking-wide text-gray-500">{etichetta} </span>
      <span className={`text-[11px] ${valore ? 'font-medium text-gray-900' : 'text-gray-300'}`}>{valore ?? '—'}</span>
    </div>
  )
}

/**
 * Un serramento del rilievo in forma compatta, uguale a schermo e in stampa (5 per foglio
 * A4): a sinistra il disegno con le quote e le note del telaio sui 4 lati, a destra i dati.
 */
export default function SchedaVoceRiepilogo({ voce, struttura, prezzo, numero }: Props) {
  const d = datiRiepilogo(voce, struttura)
  const { larghezza, altezza } = voce.fp
  const nota = (t: string | undefined, classe: string) =>
    t ? <span className={`text-[8px] leading-tight text-blue-800 ${classe}`}>{t}</span> : null

  return (
    <div className="grid grid-cols-[13rem_minmax(0,1fr)] overflow-hidden rounded border border-gray-400 bg-white text-[11px] leading-tight text-gray-900 print:h-[46mm] print:break-inside-avoid">
      {/* Disegno, quote e note del telaio */}
      <div className="flex flex-col border-r border-gray-300 p-1">
        <div className="flex items-baseline justify-between gap-1">
          <span className="truncate text-[12px] font-bold text-blue-900">{numero}. {voce.posizione || 'Senza riferimento'}</span>
          {d.mq !== null && <span className="shrink-0 text-[10px] font-semibold text-orange-600">Mq {formatMq(d.mq)}</span>}
        </div>
        <div className="grid flex-1 grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)_auto_auto] items-center gap-0.5">
          <div />
          <div className="text-center">{nota(d.noteTelaio.alto, '')}</div>
          <div />
          <div className="flex h-full items-center">{nota(d.noteTelaio.sinistra, '[writing-mode:vertical-rl] rotate-180 max-h-full')}</div>
          <div className="flex h-24 items-center justify-center print:h-[26mm]">
            {struttura
              ? <DisegnoVoceSvg struttura={struttura} voce={voce.fp} className="h-full w-full" />
              : <span className="text-[9px] text-gray-400">disegno non disponibile</span>}
          </div>
          <div className="flex h-full items-center gap-0.5">
            {nota(d.noteTelaio.destra, '[writing-mode:vertical-rl] max-h-full')}
            {altezza && <span className="text-[9px] text-gray-600 [writing-mode:vertical-rl] rotate-180">{altezza}</span>}
          </div>
          <div />
          <div className="text-center text-[9px] text-gray-600">{larghezza ?? ''}</div>
          <div />
          <div />
          <div className="text-center">{nota(d.noteTelaio.basso, '')}</div>
          <div />
        </div>
      </div>

      {/* Dati del serramento */}
      <div className="grid grid-cols-2 content-start">
        <div className="col-span-2 flex items-baseline gap-2 border-b border-gray-300 bg-gray-100 px-1 py-0.5 leading-tight">
          <span className="text-[11px] font-bold">Q.tà {voce.quantita}</span>
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">{d.tipo}</span>
          <span className="shrink-0 text-[12px] font-bold">{larghezza ?? '?'} × {altezza ?? '?'} mm</span>
        </div>
        <Campo etichetta="Serie" valore={d.serie} />
        <Campo etichetta="Vetri" valore={d.vetri} />
        <Campo etichetta="Finitura est." valore={d.finituraEst} />
        <Campo etichetta="Finitura int." valore={d.finituraInt} />
        <Campo etichetta="Colore accessori" valore={d.coloreAcc} />
        <Campo etichetta="Apertura" valore={d.mano} />
        {d.profili && <Campo etichetta="Profili" valore={d.profili} largo />}
        {d.accessori && <Campo etichetta="Accessori" valore={d.accessori} largo />}
        <div className="col-span-2 px-1 py-px text-[10px] leading-tight">
          <p className="line-clamp-2"><span className="text-[9px] uppercase tracking-wide text-gray-500">Note </span>{d.note ?? '—'}</p>
        </div>
        {prezzo && (
          <div className="col-span-2 flex justify-end gap-4 border-t border-gray-300 px-1 py-px text-[11px] leading-tight">
            {prezzo.tipo === 'prezzo' && (
              <>
                <span>Prezzo unitario <b>€ {formatEuro(prezzo.unitario)}</b></span>
                <span>Totale <b>€ {formatEuro(prezzo.unitario * (voce.quantita || 1))}</b></span>
              </>
            )}
            {prezzo.tipo === 'da_ricalcolare' && <span className="text-amber-700">Prezzo da ricalcolare</span>}
            {prezzo.tipo === 'assente' && <span className="text-gray-400">Non calcolato</span>}
          </div>
        )}
      </div>
    </div>
  )
}
