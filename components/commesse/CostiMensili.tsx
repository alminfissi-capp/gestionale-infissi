'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { formatEuro } from '@/lib/pricing'
import {
  FAMIGLIE, FAMIGLIA_LABEL, FAMIGLIA_DI, VOCI, VOCE_LABEL, MESI_ESTESI,
  type ResocontoCosti, type RigaMeseCosti, type FamigliaCosto,
} from '@/lib/costi-mensili'

// Gli stessi colori che queste spese hanno già nella torta delle uscite: una
// voce mantiene il suo colore in tutta la pagina.
const COLORI_FAMIGLIA: Record<FamigliaCosto, string> = {
  fissi: '#7c3aed',     // violet-600 — come il badge dei finanziamenti
  variabili: '#0284c7', // sky-600 — come i materiali
  tasse: '#e11d48',     // rose-600 — come il badge delle tasse
}

// Scuro e tratteggiato: deve leggersi sopra tutte e tre le fasce colorate.
const COLORE_SOGLIA = '#1f2937' // gray-800

/**
 * Tooltip scritto a mano invece di quello di recharts: la `Line` condivide la
 * serie `fissi` con la barra in basso, e il tooltip standard mostrerebbe i costi
 * fissi due volte.
 */
function TooltipCosti(
  { active, payload }: { active?: boolean; payload?: { payload: RigaMeseCosti }[] },
) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-semibold text-gray-900">{r.mese}</p>
      {FAMIGLIE.map((f) => (
        <p key={f} className="mt-0.5 flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: COLORI_FAMIGLIA[f] }}
            aria-hidden
          />
          <span className="flex-1 text-gray-600">{FAMIGLIA_LABEL[f]}</span>
          <span className="font-medium tabular-nums text-gray-900">{formatEuro(r[f])}</span>
        </p>
      ))}
      <p className="mt-1 flex gap-2 border-t pt-1 font-semibold text-gray-900">
        <span className="flex-1">Totale</span>
        <span className="tabular-nums">{formatEuro(r.totale)}</span>
      </p>
    </div>
  )
}

interface Props {
  dati: ResocontoCosti
}

export default function CostiMensili({ dati }: Props) {
  // Tendina del dettaglio: chiusa di default, il blocco resta una sintesi.
  const [dettaglio, setDettaglio] = useState(false)

  if (!dati.haCosti) {
    return (
      <p className="py-10 text-center text-sm text-gray-400">
        Nessun costo registrato in questo anno
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {/* Riepilogo dell'anno: una scheda per famiglia */}
      <div className="grid gap-3 sm:grid-cols-3">
        {dati.famiglie.map((f) => (
          <div
            key={f.famiglia}
            className="rounded-lg border bg-white p-3"
            style={{ borderLeftWidth: 4, borderLeftColor: COLORI_FAMIGLIA[f.famiglia] }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {f.label}
            </p>
            <p className="text-xl font-bold tabular-nums text-gray-900">
              {formatEuro(f.totale)}
            </p>
            <p className="text-xs text-gray-500">
              {formatEuro(f.media)} al mese · {f.percentuale.toFixed(1)}% del totale
            </p>
          </div>
        ))}
      </div>

      {/* Legenda scritta a mano: comprende la linea, che recharts non saprebbe
          distinguere dalla barra con cui condivide la serie */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
        {FAMIGLIE.map((f) => (
          <span key={f} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: COLORI_FAMIGLIA[f] }}
              aria-hidden
            />
            {FAMIGLIA_LABEL[f]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden>
            <line
              x1="0" y1="4" x2="22" y2="4"
              stroke={COLORE_SOGLIA} strokeWidth="2" strokeDasharray="5 3"
            />
          </svg>
          Soglia dei costi fissi
        </span>
      </div>

      <ResponsiveContainer width="100%" height={330}>
        <ComposedChart data={dati.mesi} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="mese" tick={{ fontSize: 11, fill: '#9ca3af' }} />
          <YAxis
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            width={56}
            tickFormatter={(v) => formatEuro(Number(v))}
          />
          <Tooltip content={<TooltipCosti />} cursor={{ fill: '#f8fafc' }} />
          {/* I fissi in basso: così la linea ne segue il bordo superiore e si
              legge come il pavimento del mese */}
          <Bar dataKey="fissi" stackId="costi" fill={COLORI_FAMIGLIA.fissi} />
          <Bar dataKey="variabili" stackId="costi" fill={COLORI_FAMIGLIA.variabili} />
          {/* Niente radius: nei mesi senza tasse la barra in cima e' alta zero e
              l'arrotondamento finirebbe su un rettangolo che non si vede */}
          <Bar dataKey="tasse" stackId="costi" fill={COLORI_FAMIGLIA.tasse} />
          <Line
            type="monotone"
            dataKey="fissi"
            stroke={COLORE_SOGLIA}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={{ r: 2.5, fill: COLORE_SOGLIA }}
            activeDot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {dati.mesiSenzaStipendi.length > 0 && (
        <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          Stipendi non ancora caricati per:{' '}
          {dati.mesiSenzaStipendi.map((i) => MESI_ESTESI[i]).join(', ')}. In quei mesi la
          soglia dei costi fissi è più bassa del reale.
        </p>
      )}

      {/* Dettaglio per voce */}
      <div>
        <button
          type="button"
          onClick={() => setDettaglio((v) => !v)}
          aria-expanded={dettaglio}
          aria-controls="dettaglio-costi-mensili"
          className="flex items-center gap-1 text-sm text-gray-700 transition-colors hover:text-violet-800"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 text-violet-600 transition-transform ${dettaglio ? '' : '-rotate-90'}`}
          />
          Dettaglio per voce di spesa
        </button>

        {dettaglio && (
          <div id="dettaglio-costi-mensili" className="mt-2 overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-[10px] uppercase text-gray-500">
                  <th className="px-2 py-1.5">Voce</th>
                  {dati.mesi.map((m) => (
                    <th key={m.mese} className="px-2 py-1.5 text-right">{m.mese}</th>
                  ))}
                  <th className="px-2 py-1.5 text-right">Totale</th>
                </tr>
              </thead>
              <tbody>
                {VOCI.map((v) => (
                  <tr key={v} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-2 py-1.5">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-sm"
                          style={{ backgroundColor: COLORI_FAMIGLIA[FAMIGLIA_DI[v]] }}
                          aria-hidden
                        />
                        {VOCE_LABEL[v]}
                      </span>
                    </td>
                    {dati.mesi.map((m) => (
                      <td
                        key={m.mese}
                        className={`px-2 py-1.5 text-right tabular-nums ${m.voci[v] > 0 ? 'text-gray-700' : 'text-gray-300'}`}
                      >
                        {m.voci[v] > 0 ? formatEuro(m.voci[v]) : '—'}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                      {formatEuro(dati.totaliVoce[v])}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-gray-100 font-semibold">
                  <td className="px-2 py-1.5">Totale</td>
                  {dati.mesi.map((m) => (
                    <td key={m.mese} className="px-2 py-1.5 text-right tabular-nums">
                      {m.totale > 0 ? formatEuro(m.totale) : '—'}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatEuro(dati.totaleAnno)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
