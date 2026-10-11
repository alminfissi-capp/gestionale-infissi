'use client'

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { db } from '@/lib/db'
import { creaRilievoLocale } from '@/lib/rilievo-fp-locale'
import type { Cliente } from '@/types/cliente'
import type { ClienteSnapshotRilievo } from '@/types/rilievo-veloce'

export const nomeCliente = (c: ClienteSnapshotRilievo) =>
  c.tipo === 'azienda' ? c.ragione_sociale ?? '' : [c.cognome, c.nome].filter(Boolean).join(' ')

const daCliente = (c: Cliente): ClienteSnapshotRilievo => ({
  tipo: c.tipo, ragione_sociale: c.ragione_sociale, nome: c.nome, cognome: c.cognome, telefono: c.telefono,
  email: c.email, indirizzo: [c.via, c.civico, c.citta].filter(Boolean).join(' ') || c.indirizzo, cantiere: c.cantiere,
})

export default function ElencoRilievi({ onApri }: { onApri: (id: string) => void }) {
  const rilievi = useLiveQuery(() => db.rilieviFp.orderBy('aggiornatoAt').reverse().toArray(), [], [])
  const clienti = useLiveQuery(() => db.clienti.toArray(), [], [])
  const [nuovo, setNuovo] = useState(false)
  const [cerca, setCerca] = useState('')
  const [cantiere, setCantiere] = useState('')

  const crea = async (cliente: ClienteSnapshotRilievo) => {
    const id = await creaRilievoLocale({ ...cliente, cantiere: cantiere || cliente.cantiere }, '')
    setNuovo(false)
    onApri(id)
  }
  const q = cerca.trim().toLowerCase()
  const trovati = q.length >= 2
    ? clienti.filter(c => `${c.ragione_sociale ?? ''} ${c.cognome ?? ''} ${c.nome ?? ''}`.toLowerCase().includes(q)).slice(0, 20)
    : []

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Rilievi in cantiere</h1>
        <Button onClick={() => setNuovo(!nuovo)} className="h-11"><Plus className="mr-1 size-4" />Nuovo</Button>
      </div>
      {nuovo && (
        <div className="space-y-2 rounded-md border p-3">
          <Label htmlFor="cerca-cliente">Cliente</Label>
          <Input id="cerca-cliente" value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca in anagrafica o scrivi un nome nuovo" />
          <Label htmlFor="cantiere">Cantiere / indirizzo</Label>
          <Input id="cantiere" value={cantiere} onChange={e => setCantiere(e.target.value)} />
          <ul className="divide-y">
            {trovati.map(c => (
              <li key={c.id}><button type="button" className="w-full px-2 py-3 text-left text-sm hover:bg-muted" onClick={() => crea(daCliente(c))}>{nomeCliente(daCliente(c))}</button></li>
            ))}
          </ul>
          {cerca.trim() && (
            <Button variant="outline" className="h-11 w-full" onClick={() => crea({ tipo: 'privato', ragione_sociale: null, nome: null, cognome: cerca.trim(), telefono: null, email: null, indirizzo: null, cantiere: null })}>
              Nuovo cliente: &quot;{cerca.trim()}&quot;
            </Button>
          )}
        </div>
      )}
      <ul className="space-y-2">
        {rilievi.map(r => (
          <li key={r.id}>
            <button type="button" onClick={() => onApri(r.id)} className="w-full rounded-md border bg-card p-3 text-left">
              <span className="block text-sm font-medium">{nomeCliente(r.cliente) || 'Senza nome'}</span>
              <span className="block text-xs text-muted-foreground">
                {r.cliente.cantiere ?? ''} {r.daInviare ? '· da inviare' : ''}
              </span>
            </button>
          </li>
        ))}
        {rilievi.length === 0 && <li className="text-sm text-muted-foreground">Nessun rilievo</li>}
      </ul>
    </div>
  )
}
