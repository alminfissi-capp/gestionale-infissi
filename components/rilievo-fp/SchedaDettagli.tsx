'use client'

import { useMemo, useState } from 'react'
import DisegnoSvg from '@/components/rilievo-grafico/DisegnoSvg'
import { formatMq, datiRiepilogo } from '@/lib/fppro/riepilogo'
import { RIGHE, DA_ASSEGNARE, dettagliVoceDisegnata, dettagliVoceFp } from '@/lib/dettagli-costruttivi'
import { calcolaDisegno } from '@/lib/rilievo-grafico/geometria'
import { disegnoDellaVoce, eVoceDisegnata, eVoceFp } from '@/lib/rilievo-unico'
import { salvaVoceLocale } from '@/lib/rilievo-fp-locale'
import type { StrutturaLocale, VoceLocale } from '@/types/rilievo-fp'
import DisegnoVoceSvg from './DisegnoVoceSvg'

/** Note scrivibili dalla pagina: stesso campo note della voce, salvato nel dispositivo uscendo dal campo */
function Note({ voce }: { voce: VoceLocale }) {
  const [testo, setTesto] = useState(voce.note)
  const salva = () => {
    if (testo === voce.note) return
    const { daInviare: _d, ...v } = voce
    void salvaVoceLocale({ ...v, note: testo })
  }
  return (
    <div className="flex min-h-0 flex-col border-l border-gray-300 px-1.5 py-1">
      <b className="text-[9px] uppercase tracking-wide">Note</b>
      <textarea
        aria-label={`Note ${voce.posizione || 'voce'}`}
        value={testo} onChange={e => setTesto(e.target.value)} onBlur={salva}
        className="mt-0.5 min-h-0 flex-1 resize-none bg-[repeating-linear-gradient(#fff_0_15px,#d6d6d6_15px_16px)] text-[11px] leading-4 text-gray-900 outline-none focus:ring-1 focus:ring-teal-600 print:hidden"
      />
      <p className="mt-0.5 hidden min-h-0 flex-1 overflow-hidden whitespace-pre-wrap bg-[repeating-linear-gradient(#fff_0_15px,#d6d6d6_15px_16px)] text-[10px] leading-4 print:block">{testo}</p>
    </div>
  )
}

/**
 * Un serramento nei Dettagli costruttivi (4 per foglio A4): a sinistra il disegno con POS.,
 * mq per pezzo e quantita' e le scritte dei lati; al centro una riga per ogni cosa con i codici
 * da ricopiare in FP PRO; a destra le note.
 */
export default function SchedaDettagli({ voce, struttura, nomiSerie, numero }: {
  voce: VoceLocale
  struttura: StrutturaLocale | null
  nomiSerie: Map<number, string>
  numero: number
}) {
  const fp = eVoceFp(voce) ? voce : null
  const dis = eVoceDisegnata(voce) ? voce : null
  const calc = useMemo(() => (dis ? calcolaDisegno(disegnoDellaVoce(dis)) : null), [dis])
  if (!fp && !dis) return null
  const d = fp ? dettagliVoceFp(fp, struttura) : dettagliVoceDisegnata(dis!, nomiSerie)
  const noteTelaio = fp ? datiRiepilogo(fp, struttura).noteTelaio : {}
  const nota = (t: string | undefined, classe: string) =>
    t ? <span className={`text-[8px] font-semibold leading-tight text-orange-700 ${classe}`}>{t}</span> : null

  return (
    <div className="grid grid-cols-[27%_minmax(0,1fr)_23%] overflow-hidden rounded border border-gray-500 bg-white text-gray-900 print:h-[60mm] print:break-inside-avoid">
      {/* Disegno */}
      <div className="flex min-h-0 flex-col border-r border-gray-300 p-1">
        <div className="flex items-baseline justify-between gap-1 text-[10px] font-bold leading-tight">
          <span className="truncate text-blue-900">POS. {numero}{voce.posizione ? ` · ${voce.posizione}` : ''}</span>
          {d.mqPezzo !== null && <span className="shrink-0 text-orange-600">{formatMq(d.mqPezzo)} mq/pz</span>}
          <span className="shrink-0">Q.tà {voce.quantita}</span>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)_auto] items-center gap-0.5">
          <div />
          <div className="text-center">{nota(noteTelaio.alto, '')}</div>
          <div />
          <div className="flex h-full items-center">{nota(noteTelaio.sinistra, '[writing-mode:vertical-rl] rotate-180 max-h-full')}</div>
          <div className="flex h-32 items-center justify-center print:h-[40mm]">
            {fp && struttura
              ? <DisegnoVoceSvg struttura={struttura} voce={fp.fp} className="h-full w-full" />
              : calc
                ? <DisegnoSvg calc={calc} modo="miniatura" scritteLati={dis!.grafico.noteLati} className="h-full w-full" />
                : <span className="text-[9px] text-gray-400">disegno non disponibile</span>}
          </div>
          <div className="flex h-full items-center">{nota(noteTelaio.destra, '[writing-mode:vertical-rl] max-h-full')}</div>
          <div />
          <div className="text-center">{nota(noteTelaio.basso, '')}</div>
          <div />
        </div>
        <p className="text-center text-[10px] font-semibold leading-tight">{d.larghezza ?? '?'} × {d.altezza ?? '?'} mm</p>
      </div>

      {/* Una riga per ogni cosa */}
      <div className="flex min-h-0 flex-col px-1.5 py-1">
        <p className="truncate border-b border-gray-300 pb-0.5 text-[10px] font-semibold leading-tight">{d.titolo}</p>
        {RIGHE.map(e => {
          const valore = d.righe[e]
          return (
            <div key={e} className="grid grid-cols-[4.6rem_minmax(0,1fr)] border-b border-dotted border-gray-200 py-px text-[10px] leading-tight">
              <b className="text-[9px] uppercase tracking-wide">{e}</b>
              <span className={`line-clamp-2 break-words ${valore === null ? 'text-gray-300' : valore.includes(DA_ASSEGNARE) ? 'text-red-700' : ['Vetri', 'Accessori', 'Colori'].includes(e) ? '' : 'font-mono font-bold'}`}>
                {valore ?? '—'}
              </span>
            </div>
          )
        })}
      </div>

      <Note key={voce.id} voce={voce} />
    </div>
  )
}
