'use client'

import { useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { db } from '@/lib/db'
import { dataRilievoTesto } from '@/lib/fppro/cantiere-elenco'
import { eVoceDisegnata, eVoceFp } from '@/lib/rilievo-unico'
import { nomeCliente } from './ElencoRilievi'
import SchedaDettagli from './SchedaDettagli'

const PER_PAGINA = 4

/**
 * Dettagli costruttivi del rilievo (uso interno, per l'officina e per ricopiare in FP PRO):
 * 4 serramenti per foglio A4. Dati dal dispositivo, quindi anche senza rete; si stampa o si
 * salva in PDF con la stampa del browser.
 */
export default function DettagliCostruttivi({ id, onIndietro }: { id: string; onIndietro: () => void }) {
  const rilievo = useLiveQuery(() => db.rilieviFp.get(id), [id])
  const tutte = useLiveQuery(() => db.vociFp.where('rilievoId').equals(id).sortBy('ordine'), [id])
  const voci = useMemo(() => (tutte ? tutte.filter(v => eVoceFp(v) || eVoceDisegnata(v)) : null), [tutte])
  const strutture = useLiveQuery(async () => {
    const righe = await db.fpStrutture.bulkGet((voci ?? []).filter(eVoceFp).map(v => v.fp.strutturaId))
    return new Map(righe.filter(s => !!s).map(s => [s!.id, s!]))
  }, [voci])
  const nomiSerie = useLiveQuery(async () => {
    const ids = [...new Set((voci ?? []).filter(eVoceDisegnata).flatMap(v => v.grafico.serie))]
    const righe = await db.fpSerie.where('fp_id').anyOf(ids).toArray()
    return new Map(righe.map(s => [s.fp_id, s.nome]))
  }, [voci], new Map<number, string>())
  const titoloFile = rilievo ? `${nomeCliente(rilievo.cliente) || 'Rilievo'}_DETTAGLI COSTRUTTIVI` : null

  // Il PDF salvato dalla stampa prende il nome dal titolo della pagina
  useEffect(() => {
    if (!titoloFile) return
    const prima = document.title
    document.title = titoloFile
    return () => { document.title = prima }
  }, [titoloFile])

  if (!rilievo || !voci) return <p className="text-sm text-muted-foreground">Caricamento…</p>

  const pagine: (typeof voci)[] = []
  for (let i = 0; i < voci.length; i += PER_PAGINA) pagine.push(voci.slice(i, i + PER_PAGINA))
  if (pagine.length === 0) pagine.push([])
  const c = rilievo.cliente
  const pezzi = voci.reduce((t, v) => t + (v.quantita || 1), 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onIndietro}><ArrowLeft className="size-4" />Indietro</Button>
        <p className="text-sm text-muted-foreground">Le note si possono scrivere anche qui.</p>
        <Button size="sm" className="ml-auto gap-1.5" onClick={() => window.print()}><Printer className="size-4" />Stampa / PDF</Button>
      </div>

      {pagine.map((gruppo, p) => (
        <section key={p} className="mx-auto flex max-w-[190mm] flex-col gap-1.5 bg-white print:max-w-none print:break-after-page print:last:break-after-auto">
          <header className="flex items-end justify-between gap-3 border-b-2 border-gray-900 pb-1 text-[10px] leading-tight text-gray-900">
            <div className="min-w-0">
              <p className="text-[13px] font-bold">Dettagli costruttivi · {nomeCliente(c) || 'Senza nome'}</p>
              <p className="truncate">Rilievo del {dataRilievoTesto(rilievo)}{c.cantiere || c.indirizzo ? ` · ${c.cantiere || c.indirizzo}` : ''}</p>
            </div>
            <div className="shrink-0 text-right">
              <p>A.L.M. Infissi · uso interno</p>
              <p>{voci.length} serramenti · {pezzi} pezzi</p>
            </div>
          </header>
          {gruppo.map((v, i) => (
            <SchedaDettagli key={v.id} voce={v} numero={p * PER_PAGINA + i + 1} nomiSerie={nomiSerie}
              struttura={eVoceFp(v) ? strutture?.get(v.fp.strutturaId) ?? null : null} />
          ))}
          <footer className="flex justify-between text-[9px] text-gray-600">
            <span>Da ricopiare in FP PRO voce per voce</span>
            <span>Pagina {p + 1} di {pagine.length}</span>
          </footer>
        </section>
      ))}
    </div>
  )
}
