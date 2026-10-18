'use client'

import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { db } from '@/lib/db'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { formatEuro } from '@/lib/pricing'
import { datiRiepilogo, formatMq, statoPrezzo } from '@/lib/fppro/riepilogo'
import { dataRilievoTesto } from '@/lib/fppro/cantiere-elenco'
import { getRiepilogoServer, type DatiRiepilogoServer } from '@/actions/calcolo-fp'
import SchedaVoceRiepilogo from './SchedaVoceRiepilogo'
import { nomeCliente } from './ElencoRilievi'

const PER_PAGINA = 5

/**
 * Riepilogo del rilievo impaginato per A4 (5 serramenti a foglio), da stampare o salvare
 * in PDF con la stampa del browser. Dati dal dispositivo, quindi anche senza rete; prezzi
 * e logo solo con la rete, i prezzi solo se l'interruttore e' acceso.
 */
export default function RiepilogoRilievo({ id, onIndietro }: { id: string; onIndietro: () => void }) {
  const { isOnline } = useOnlineStatus()
  const rilievo = useLiveQuery(() => db.rilieviFp.get(id), [id])
  const voci = useLiveQuery(() => db.vociFp.where('rilievoId').equals(id).sortBy('ordine'), [id])
  const strutture = useLiveQuery(async () => {
    const righe = await db.fpStrutture.bulkGet((voci ?? []).map(v => v.fp.strutturaId))
    return new Map(righe.filter(s => !!s).map(s => [s!.id, s!]))
  }, [voci])
  const [server, setServer] = useState<DatiRiepilogoServer | null>(null)
  const [mostraPrezzi, setMostraPrezzi] = useState(false)

  useEffect(() => {
    if (!isOnline) return
    let attivo = true
    void getRiepilogoServer(id).then(r => { if (attivo && !('errore' in r)) setServer(r) }).catch(() => {})
    return () => { attivo = false }
  }, [id, isOnline])

  if (!rilievo || !voci) return <p className="text-sm text-muted-foreground">Caricamento…</p>

  const prezzi = server?.prezzi ?? null
  const prezzoDi = (v: (typeof voci)[number]) =>
    mostraPrezzi && prezzi ? statoPrezzo(prezzi.voci[v.id], v.aggiornatoAt, prezzi.calcolatoAt) : null
  const pagine: (typeof voci)[] = []
  for (let i = 0; i < voci.length; i += PER_PAGINA) pagine.push(voci.slice(i, i + PER_PAGINA))
  if (pagine.length === 0) pagine.push([])

  const mqTotali = voci.reduce((t, v) => t + (datiRiepilogo(v, strutture?.get(v.fp.strutturaId) ?? null).mq ?? 0), 0)
  const pezzi = voci.reduce((t, v) => t + (v.quantita || 1), 0)
  const stati = voci.map(v => prezzoDi(v))
  const totale = stati.reduce((t, s, i) => t + (s?.tipo === 'prezzo' ? s.unitario * (voci[i].quantita || 1) : 0), 0)
  const incompleto = stati.some(s => s && s.tipo !== 'prezzo')
  const c = rilievo.cliente
  const oggi = dataRilievoTesto(rilievo)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onIndietro}><ArrowLeft className="size-4" />Indietro</Button>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={mostraPrezzi} onCheckedChange={setMostraPrezzi} disabled={!prezzi} />
          Mostra prezzi
          <span className="text-xs text-muted-foreground">
            {!isOnline ? '(prezzi disponibili con la rete)' : !server ? '(carico…)' : !prezzi ? '(rilievo non ancora calcolato)' : ''}
          </span>
        </label>
        <Button size="sm" className="ml-auto gap-1.5" onClick={() => window.print()}><Printer className="size-4" />Stampa / PDF</Button>
      </div>

      {pagine.map((gruppo, p) => (
        <section key={p} className="mx-auto max-w-[190mm] space-y-1.5 bg-white print:max-w-none print:break-after-page print:last:break-after-auto">
          <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border border-gray-400 p-1.5 text-[11px] text-gray-900">
            {server?.intestazione.logoUrl
              ? <img src={server.intestazione.logoUrl} alt="" className="h-10 w-auto" />
              : <span className="text-sm font-bold">{server?.intestazione.denominazione ?? 'A.L.M. Infissi'}</span>}
            <div className="min-w-0 space-y-0.5">
              <p><span className="text-gray-500">Cliente </span><b>{nomeCliente(c) || '—'}</b></p>
              <p className="truncate"><span className="text-gray-500">Indirizzo </span>{[c.indirizzo, c.cantiere].filter(Boolean).join(' · ') || '—'}</p>
              <p className="truncate"><span className="text-gray-500">Cell. </span>{c.telefono || '—'} <span className="ml-3 text-gray-500">Email </span>{c.email || '—'}</p>
              {rilievo.note && <p className="line-clamp-2"><span className="text-gray-500">Note </span>{rilievo.note}</p>}
            </div>
            <div className="text-right">
              <p>Rilievo del {oggi}</p>
              <p>Pagina {p + 1} / {pagine.length}</p>
            </div>
          </header>
          {gruppo.map((v, i) => (
            <SchedaVoceRiepilogo key={v.id} voce={v} struttura={strutture?.get(v.fp.strutturaId) ?? null}
              prezzo={prezzoDi(v)} numero={p * PER_PAGINA + i + 1} />
          ))}
          {p === pagine.length - 1 && (
            <footer className="flex flex-wrap justify-end gap-4 border border-gray-400 p-1.5 text-[11px] text-gray-900">
              <span>Serramenti <b>{voci.length}</b> · pezzi <b>{pezzi}</b></span>
              <span>Mq totali <b>{formatMq(mqTotali)}</b></span>
              {mostraPrezzi && prezzi && (
                <span>Totale imponibile <b>€ {formatEuro(totale)}</b>{incompleto && <span className="text-amber-700"> (alcune voci da ricalcolare)</span>}</span>
              )}
            </footer>
          )}
        </section>
      ))}
    </div>
  )
}
