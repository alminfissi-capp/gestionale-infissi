'use client'

import type { DistintaWinConfig } from '@/types/winconfig'
import { formatEuro } from '@/lib/pricing'

type Props = {
  distinta: DistintaWinConfig
  prezzo_profili: number
  prezzo_accessori: number
  prezzo_riempimenti: number
  prezzo_colore: number
  prezzo_totale: number
}

export default function DistintaMateriali({
  distinta,
  prezzo_profili,
  prezzo_accessori,
  prezzo_riempimenti,
  prezzo_colore,
  prezzo_totale,
}: Props) {
  return (
    <div className="space-y-4 text-sm">
      {/* SEZIONE 1: PROFILI/BARRE */}
      <section>
        <div className="flex items-center justify-between mb-1">
          <h4 className="font-semibold text-slate-700 uppercase tracking-wide text-xs">Profili / Barre</h4>
          <span className="font-medium text-slate-600">{formatEuro(prezzo_profili)}</span>
        </div>
        {distinta.profili.length === 0 ? (
          <p className="text-slate-400 text-xs italic">Nessun profilo configurato per questa serie</p>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-500">
                <th className="text-left px-2 py-1 font-medium">Profilo</th>
                <th className="text-right px-2 py-1 font-medium">L netta</th>
                <th className="text-right px-2 py-1 font-medium">Sfrido</th>
                <th className="text-right px-2 py-1 font-medium">n. pz</th>
                <th className="text-right px-2 py-1 font-medium">ml tot.</th>
                <th className="text-right px-2 py-1 font-medium">€/ml</th>
                <th className="text-right px-2 py-1 font-medium">Totale</th>
              </tr>
            </thead>
            <tbody>
              {distinta.profili.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-2 py-1">
                    <div>{r.nome}</div>
                    {r.codice && <div className="text-slate-400">{r.codice}</div>}
                    <div className="text-slate-400 italic">{r.note}</div>
                  </td>
                  <td className="text-right px-2 py-1">{r.lunghezza_mm} mm</td>
                  <td className="text-right px-2 py-1">{r.sfrido_mm} mm</td>
                  <td className="text-right px-2 py-1">{r.n_pezzi}</td>
                  <td className="text-right px-2 py-1">{r.ml_totali.toFixed(3)}</td>
                  <td className="text-right px-2 py-1">{formatEuro(r.prezzo_ml)}</td>
                  <td className="text-right px-2 py-1 font-medium">{formatEuro(r.prezzo_totale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* SEZIONE 2: ACCESSORI */}
      <section>
        <div className="flex items-center justify-between mb-1">
          <h4 className="font-semibold text-slate-700 uppercase tracking-wide text-xs">Accessori</h4>
          <span className="font-medium text-slate-600">{formatEuro(prezzo_accessori)}</span>
        </div>
        {distinta.accessori.length === 0 ? (
          <p className="text-slate-400 text-xs italic">Nessun accessorio configurato per questa serie</p>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-500">
                <th className="text-left px-2 py-1 font-medium">Accessorio</th>
                <th className="text-right px-2 py-1 font-medium">Qtà</th>
                <th className="text-right px-2 py-1 font-medium">Um</th>
                <th className="text-right px-2 py-1 font-medium">€/um</th>
                <th className="text-right px-2 py-1 font-medium">Totale</th>
              </tr>
            </thead>
            <tbody>
              {distinta.accessori.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-2 py-1">
                    <div>{r.nome}</div>
                    {r.codice && <div className="text-slate-400">{r.codice}</div>}
                  </td>
                  <td className="text-right px-2 py-1">{r.qty}</td>
                  <td className="text-right px-2 py-1">{r.unita}</td>
                  <td className="text-right px-2 py-1">{formatEuro(r.prezzo)}</td>
                  <td className="text-right px-2 py-1 font-medium">{formatEuro(r.prezzo_totale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* SEZIONE 3: RIEMPIMENTI */}
      <section>
        <div className="flex items-center justify-between mb-1">
          <h4 className="font-semibold text-slate-700 uppercase tracking-wide text-xs">Riempimenti</h4>
          <span className="font-medium text-slate-600">{formatEuro(prezzo_riempimenti)}</span>
        </div>
        {distinta.riempimenti.length === 0 ? (
          <p className="text-slate-400 text-xs italic">Nessun riempimento selezionato</p>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-500">
                <th className="text-left px-2 py-1 font-medium">Riempimento</th>
                <th className="text-right px-2 py-1 font-medium">Area reale</th>
                <th className="text-right px-2 py-1 font-medium">Area fatt.</th>
                <th className="text-right px-2 py-1 font-medium">€/m²</th>
                <th className="text-right px-2 py-1 font-medium">Totale</th>
              </tr>
            </thead>
            <tbody>
              {distinta.riempimenti.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-2 py-1">{r.nome}</td>
                  <td className="text-right px-2 py-1">{r.area_mq.toFixed(3)} m²</td>
                  <td className="text-right px-2 py-1">{r.area_applicata_mq.toFixed(3)} m²</td>
                  <td className="text-right px-2 py-1">{formatEuro(r.prezzo_mq)}</td>
                  <td className="text-right px-2 py-1 font-medium">{formatEuro(r.prezzo_totale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* TOTALE */}
      <div className="border-t-2 border-slate-300 pt-2 space-y-1">
        {prezzo_colore > 0 && (
          <div className="flex justify-between text-xs text-slate-500">
            <span>Sovrapprezzo colore</span>
            <span>{formatEuro(prezzo_colore)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-base text-slate-800">
          <span>Totale serramento</span>
          <span>{formatEuro(prezzo_totale)}</span>
        </div>
      </div>
    </div>
  )
}
