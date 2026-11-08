'use client'

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, MapPin, Plus, UserRound } from 'lucide-react'
import PulsanteIndietro from '@/components/layout/PulsanteIndietro'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { db } from '@/lib/db'
import { creaRilievoLocale } from '@/lib/rilievo-fp-locale'
import { dataRilievoTesto, riepilogoPezzi } from '@/lib/fppro/cantiere-elenco'
import ClienteRilievo from './ClienteRilievo'
import type { ClienteSnapshotRilievo } from '@/types/rilievo-veloce'

export const nomeCliente = (c: ClienteSnapshotRilievo) =>
  c.tipo === 'azienda' ? c.ragione_sociale ?? '' : [c.cognome, c.nome].filter(Boolean).join(' ')

export default function ElencoRilievi({ onApri }: { onApri: (id: string) => void }) {
  const rilievi = useLiveQuery(() => db.rilieviFp.orderBy('aggiornatoAt').reverse().toArray(), [], [])
  const [nuovo, setNuovo] = useState(false)
  const [sceltaCliente, setSceltaCliente] = useState(false)
  const [cantiere, setCantiere] = useState('')
  const oggi = () => new Date().toLocaleDateString('sv-SE')
  const [dataRilievo, setDataRilievo] = useState(oggi)
  const pezzi = useLiveQuery(async () => riepilogoPezzi(await db.vociFp.toArray()), [], new Map<string, { serramenti: number; pezzi: number }>())
  const crea = async (cliente: ClienteSnapshotRilievo) => {
    const id = await creaRilievoLocale({ ...cliente, cantiere: cantiere.trim() || cliente.cantiere }, '', dataRilievo || oggi())
    setNuovo(false)
    setCantiere('')
    setDataRilievo(oggi())
    setSceltaCliente(false)
    onApri(id)
  }

  return (
    <div className="space-y-3">
      <PulsanteIndietro fallback="/rilievo" />
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Rilievi in cantiere</h1>
        <Button onClick={() => setNuovo(!nuovo)} className="h-11"><Plus className="mr-1 size-4" />Nuovo</Button>
      </div>
      {nuovo && (
        <div className="space-y-2 rounded-md border p-3">
          <div className="grid grid-cols-[minmax(0,1fr)_10rem] gap-2">
            <div>
              <Label htmlFor="cantiere">Cantiere / indirizzo</Label>
              <Input id="cantiere" value={cantiere} placeholder="se diverso dall'indirizzo del cliente" onChange={e => setCantiere(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="data-rilievo">Data del rilievo</Label>
              <Input id="data-rilievo" type="date" value={dataRilievo} onChange={e => setDataRilievo(e.target.value)} />
            </div>
          </div>
          <Button className="h-11 w-full" onClick={() => setSceltaCliente(true)}><UserRound className="mr-1 size-4" />Scegli il cliente e inizia</Button>
          {sceltaCliente && (
            <ClienteRilievo aperto iniziale={null} titolo="Cliente del rilievo" conferma="Inizia il rilievo"
              onChiudi={() => setSceltaCliente(false)} onConferma={c => crea(c)} />
          )}
        </div>
      )}
      <ul className="space-y-2">
        {rilievi.map(r => (
          <li key={r.id}>
            <button type="button" onClick={() => onApri(r.id)} className="w-full space-y-1 rounded-md border bg-card p-3 text-left hover:bg-muted/40">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold">{nomeCliente(r.cliente) || 'Senza nome'}</span>
                <span className="shrink-0 text-xs font-medium">
                  {(() => {
                    const p = pezzi.get(r.id)
                    return p ? `${p.serramenti} serrament${p.serramenti === 1 ? 'o' : 'i'} · ${p.pezzi} pz` : 'nessun serramento'
                  })()}
                </span>
              </span>
              <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><CalendarDays className="size-3.5" />{dataRilievoTesto(r)}</span>
                {(r.cliente.cantiere || r.cliente.indirizzo) && (
                  <span className="flex min-w-0 items-center gap-1"><MapPin className="size-3.5 shrink-0" /><span className="truncate">{r.cliente.cantiere || r.cliente.indirizzo}</span></span>
                )}
                {r.daInviare ? <span className="text-red-700">da inviare</span> : null}
              </span>
            </button>
          </li>
        ))}
        {rilievi.length === 0 && <li className="text-sm text-muted-foreground">Nessun rilievo</li>}
      </ul>
    </div>
  )
}
