'use client'

// Riepilogo dei costi del rilievo: come si compone il prezzo totale (materiali per gruppo,
// manodopera per fase, spese generali, utile, provvigione, spese varie, extra), con il peso
// di ogni parte sul totale e l'aliquota applicata. Dati: il calcolo salvato del rilievo.
import { useMemo, type ReactNode } from 'react'
import { formatEuro } from '@/lib/pricing'
import type { CalcoloRilievo } from '@/actions/calcolo-fp'
import { FASI, GRUPPI_MATERIALE, SPESE_VARIE, riepilogoCosti, type GruppoMateriale, type SpesaVaria } from '@/lib/fppro/calcolo/riepilogo-costi'
import type { OreVoce } from '@/lib/fppro/calcolo/tipi'

const NOMI_GRUPPI: Record<GruppoMateriale, string> = { profili: 'Profili (barre)', accessori: 'Accessori', vetri: 'Vetri', pannelli: 'Pannelli e riempimenti' }
const NOMI_FASI: Record<keyof OreVoce, string> = { taglio: 'Taglio', lavorazione: 'Lavorazione', montaggio: 'Montaggio', assemblaggio: 'Assemblaggio', posa: 'Posa in opera' }
const NOMI_SPESE: Record<SpesaVaria, string> = { imballo: 'Imballo', viaggio: 'Viaggio', materiali_vari: 'Materiali vari', altro: 'Altro' }

const COLORI = {
  materiali: 'bg-sky-500', lavoro: 'bg-amber-500', speseGenerali: 'bg-slate-400', utile: 'bg-emerald-500',
  provvigione: 'bg-violet-500', speseVarie: 'bg-rose-400', extra: 'bg-zinc-600',
} as const

const pct = (x: number) => `${(Number.isFinite(x) ? x * 100 : 0).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
const quota = (x: number, totale: number) => (totale > 0 ? x / totale : 0)
const numIt = (x: number, dec = 0) => x.toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const durata = (minuti: number) => (minuti >= 60 ? `${Math.floor(minuti / 60)} h ${numIt(minuti % 60)} min` : `${numIt(minuti)} min`)

function Scheda({ titolo, valore, sotto }: { titolo: string; valore: string; sotto?: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{titolo}</p>
      <p className="text-lg font-semibold tabular-nums">{valore}</p>
      {sotto && <p className="text-xs text-muted-foreground">{sotto}</p>}
    </div>
  )
}

/** Riga della tabella: importo, peso sul totale e nota (aliquota, minuti…) */
function Riga({ nome, importo, totale, nota, livello = 0, forte = false, colore, children }: {
  nome: ReactNode; importo: number; totale: number; nota?: string; livello?: 0 | 1; forte?: boolean; colore?: string; children?: ReactNode
}) {
  return (
    <>
      <tr className={`border-t ${forte ? 'bg-muted/40 font-semibold' : ''}`}>
        <td className={`p-2 ${livello === 1 ? 'pl-8 text-muted-foreground' : ''}`}>
          <span className="flex items-center gap-2">{colore && <span className={`size-2.5 shrink-0 rounded-sm ${colore}`} />}{nome}</span>
          {nota && <span className="block text-xs font-normal text-muted-foreground">{nota}</span>}
        </td>
        <td className="p-2 text-right tabular-nums">{formatEuro(importo)}</td>
        <td className="p-2 text-right tabular-nums text-muted-foreground">{pct(quota(importo, totale))}</td>
      </tr>
      {children}
    </>
  )
}

export default function RiepilogoCosti({ calcolo }: { calcolo: CalcoloRilievo }) {
  const r = useMemo(() => riepilogoCosti(calcolo.voci), [calcolo.voci])
  const barre = useMemo(() => new Map((calcolo.barre ?? []).map(b => [b.codice, b.barre])), [calcolo.barre])
  const T = r.imponibile
  const prima = r.costoIndustriale + r.utile + r.provvigione

  const parti = [
    { chiave: 'materiali', nome: 'Materiali', valore: r.materialiTotale },
    { chiave: 'lavoro', nome: 'Manodopera', valore: r.lavoro },
    { chiave: 'speseGenerali', nome: 'Spese generali', valore: r.speseGenerali },
    { chiave: 'utile', nome: 'Utile', valore: r.utile },
    { chiave: 'provvigione', nome: 'Provvigione', valore: r.provvigione },
    { chiave: 'speseVarie', nome: 'Spese varie', valore: r.speseVarieTotale },
    { chiave: 'extra', nome: 'Extra', valore: r.extra },
  ] as const

  if (calcolo.voci.length === 0) return <p className="text-sm text-muted-foreground">Nessuna voce calcolata.</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Scheda titolo="Totale imponibile" valore={formatEuro(T)} sotto={`${r.pezzi} pezzi · ${numIt(r.mq, 2)} m²${r.mq > 0 ? ` · ${formatEuro(T / r.mq)}/m²` : ''}`} />
        <Scheda titolo="Costo puro (materiali + manodopera)" valore={formatEuro(r.costoPuro)} sotto={`${pct(quota(r.costoPuro, T))} del totale`} />
        <Scheda titolo="Utile" valore={formatEuro(r.utile)} sotto={`${pct(quota(r.utile, T))} del totale`} />
        <Scheda titolo="Ricarico sul costo puro" valore={pct(r.costoPuro > 0 ? T / r.costoPuro - 1 : 0)} sotto={`peso ${numIt(r.peso, 1)} kg · lavoro ${durata(r.lavoroMinuti)}`} />
      </div>

      {/* Composizione del totale */}
      <div className="space-y-1.5">
        <div className="flex h-4 w-full overflow-hidden rounded">
          {parti.filter(p => p.valore > 0).map(p => (
            <div key={p.chiave} className={COLORI[p.chiave]} style={{ width: `${quota(p.valore, T) * 100}%` }} title={`${p.nome}: ${pct(quota(p.valore, T))}`} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {parti.filter(p => p.valore > 0).map(p => (
            <span key={p.chiave} className="flex items-center gap-1.5"><span className={`size-2.5 rounded-sm ${COLORI[p.chiave]}`} />{p.nome} {pct(quota(p.valore, T))}</span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted/50 text-left text-xs">
            <tr><th className="p-2">Voce di costo</th><th className="p-2 text-right">Importo</th><th className="p-2 text-right">Sul totale</th></tr>
          </thead>
          <tbody>
            <Riga nome="Materiali" importo={r.materialiTotale} totale={T} colore={COLORI.materiali} forte>
              {GRUPPI_MATERIALE.filter(g => r.materiali[g] > 0 || r.dettaglio[g].length > 0).map(g => (
                <tr key={g} className="border-t">
                  <td className="p-2 pl-8" colSpan={3}>
                    <details>
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-muted-foreground">
                        <span>{NOMI_GRUPPI[g]} <span className="text-xs">({r.dettaglio[g].length} articoli · {pct(quota(r.materiali[g], r.materialiTotale))} dei materiali)</span></span>
                        <span className="flex gap-6 tabular-nums">
                          <span>{formatEuro(r.materiali[g])}</span>
                          <span className="w-14 text-right">{pct(quota(r.materiali[g], T))}</span>
                        </span>
                      </summary>
                      <ul className="mt-2 space-y-0.5 text-xs">
                        {r.dettaglio[g].map(a => (
                          <li key={`${a.codice}|${a.unita}`} className="flex justify-between gap-3">
                            <span className="min-w-0">
                              <span className="font-medium">{a.codice}</span>
                              {a.descrizione && a.descrizione !== a.codice && <span className="text-muted-foreground"> · {a.descrizione}</span>}
                              <span className="text-muted-foreground"> · {numIt(a.quantita, a.unita === 'pz' ? 0 : 2)} {a.unita}</span>
                              {g === 'profili' && barre.has(a.codice) && <span className="text-muted-foreground"> · {barre.get(a.codice)} barre</span>}
                            </span>
                            <span className="shrink-0 tabular-nums">{formatEuro(a.costo)}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </td>
                </tr>
              ))}
            </Riga>

            <Riga nome="Manodopera" importo={r.lavoro} totale={T} colore={COLORI.lavoro} forte
              nota={`${durata(r.lavoroMinuti)}${r.lavoroMinuti > 0 ? ` · media ${formatEuro(r.lavoro / (r.lavoroMinuti / 60))}/h` : ''}`}>
              {r.fasi && FASI.filter(f => r.fasi![f].minuti > 0).map(f => (
                <Riga key={f} nome={NOMI_FASI[f]} importo={r.fasi![f].costo} totale={T} livello={1}
                  nota={`${durata(r.fasi![f].minuti)} · ${formatEuro(r.fasi![f].costo / (r.fasi![f].minuti / 60))}/h`} />
              ))}
            </Riga>

            <Riga nome="Costo puro" importo={r.costoPuro} totale={T} forte />
            <Riga nome="Spese generali" importo={r.speseGenerali} totale={T} colore={COLORI.speseGenerali} nota={`${pct(quota(r.speseGenerali, r.costoPuro))} sul costo puro`} />
            <Riga nome="Costo industriale" importo={r.costoIndustriale} totale={T} forte />
            <Riga nome="Utile" importo={r.utile} totale={T} colore={COLORI.utile} nota={`${pct(quota(r.utile, r.costoIndustriale))} sul costo industriale`} />
            <Riga nome="Provvigione" importo={r.provvigione} totale={T} colore={COLORI.provvigione} nota={`${pct(quota(r.provvigione, prima))} sul prezzo prima delle spese varie`} />
            <Riga nome="Spese varie" importo={r.speseVarieTotale} totale={T} colore={COLORI.speseVarie} nota={`${pct(quota(r.speseVarieTotale, prima))} sul prezzo con provvigione`}>
              {r.speseVarie && SPESE_VARIE.filter(s => r.speseVarie![s] > 0).map(s => (
                <Riga key={s} nome={NOMI_SPESE[s]} importo={r.speseVarie![s]} totale={T} livello={1} nota={pct(quota(r.speseVarie![s], prima))} />
              ))}
            </Riga>
            {Math.abs(r.extra) >= 0.005 && <Riga nome="Extra delle voci" importo={r.extra} totale={T} colore={COLORI.extra} nota="Importi fissi aggiunti nelle correzioni" />}
            <tr className="border-t-2 bg-muted/50 font-semibold">
              <td className="p-2">Totale imponibile</td>
              <td className="p-2 text-right tabular-nums">{formatEuro(T)}</td>
              <td className="p-2 text-right tabular-nums">100%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {(!r.fasi || !r.speseVarie || !calcolo.barre) && (
        <p className="text-xs text-amber-700">Calcolo fatto prima di questo riepilogo: premi Ricalcola per vedere manodopera per fase, spese varie una per una e numero di barre.</p>
      )}
    </div>
  )
}
