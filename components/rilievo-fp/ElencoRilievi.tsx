'use client'

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, Loader2, MapPin, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createCliente } from '@/actions/clienti'
import PulsanteIndietro from '@/components/layout/PulsanteIndietro'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { db } from '@/lib/db'
import { creaRilievoLocale } from '@/lib/rilievo-fp-locale'
import { filtraClienti } from '@/lib/ricerca-clienti'
import { dataRilievoTesto, riepilogoPezzi } from '@/lib/fppro/cantiere-elenco'
import { separaNome } from '@/lib/rilievo-cliente'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import type { Cliente } from '@/types/cliente'
import type { ClienteSnapshotRilievo } from '@/types/rilievo-veloce'

export const nomeCliente = (c: ClienteSnapshotRilievo) =>
  c.tipo === 'azienda' ? c.ragione_sociale ?? '' : [c.cognome, c.nome].filter(Boolean).join(' ')

const indirizzoDi = (c: Cliente) => [c.via, c.civico, c.citta].filter(Boolean).join(' ') || c.indirizzo

const daCliente = (c: Cliente): ClienteSnapshotRilievo => ({
  tipo: c.tipo, ragione_sociale: c.ragione_sociale, nome: c.nome, cognome: c.cognome, telefono: c.telefono,
  email: c.email, indirizzo: indirizzoDi(c), cantiere: c.cantiere, clienteId: c.id,
})

export default function ElencoRilievi({ onApri }: { onApri: (id: string) => void }) {
  const rilievi = useLiveQuery(() => db.rilieviFp.orderBy('aggiornatoAt').reverse().toArray(), [], [])
  const clienti = useLiveQuery(() => db.clienti.toArray(), [], [])
  const [nuovo, setNuovo] = useState(false)
  const [cerca, setCerca] = useState('')
  const [cantiere, setCantiere] = useState('')
  const oggi = () => new Date().toLocaleDateString('sv-SE')
  const [dataRilievo, setDataRilievo] = useState(oggi)
  const pezzi = useLiveQuery(async () => riepilogoPezzi(await db.vociFp.toArray()), [], new Map<string, { serramenti: number; pezzi: number }>())
  // Cliente non trovato in anagrafica: modulo per registrarlo
  const [scheda, setScheda] = useState<{ nome: string; cognome: string; telefono: string } | null>(null)
  const [registrando, setRegistrando] = useState(false)
  const { isOnline } = useOnlineStatus()

  const crea = async (cliente: ClienteSnapshotRilievo) => {
    const id = await creaRilievoLocale({ ...cliente, cantiere: cantiere.trim() || cliente.cantiere }, '', dataRilievo || oggi())
    setNuovo(false)
    setCantiere('')
    setDataRilievo(oggi())
    setScheda(null)
    setCerca('')
    onApri(id)
  }

  /** Con la rete il cliente nuovo entra subito in anagrafica; senza, lo registra il trasferimento in Preventivi. */
  const registraECrea = async () => {
    if (!scheda) return
    const nome = scheda.nome.trim() || null
    const cognome = scheda.cognome.trim() || null
    const telefono = scheda.telefono.trim() || null
    if (!nome && !cognome) { toast.error('Scrivi almeno nome o cognome'); return }
    const snap: ClienteSnapshotRilievo = { tipo: 'privato', ragione_sociale: null, nome, cognome, telefono, email: null, indirizzo: null, cantiere: null }
    setRegistrando(true)
    try {
      if (isOnline) {
        try {
          const { id } = await createCliente({ tipo: 'privato', nome, cognome, telefono, cantiere: cantiere.trim() || null })
          snap.clienteId = id
          await db.clienti.put({
            id, organization_id: '', tipo: 'privato', ragione_sociale: null, nome, cognome, telefono, email: null, indirizzo: null,
            via: null, civico: null, cap: null, citta: null, provincia: null, nazione: null, codice_sdi: null,
            cantiere: cantiere.trim() || null, cf_piva: null, note: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          })
          toast.success('Cliente registrato in anagrafica')
        } catch {
          toast.warning('Cliente non registrato ora: lo sarà al trasferimento in Preventivi')
        }
      }
      await crea(snap)
    } finally {
      setRegistrando(false)
    }
  }

  // Stessa ricerca dell'anagrafica: parole in qualunque ordine, anche il telefono.
  const trovati = cerca.trim().length >= 2 ? filtraClienti(clienti, cerca).slice(0, 20) : []

  return (
    <div className="space-y-3">
      <PulsanteIndietro fallback="/rilievo" />
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Rilievi in cantiere</h1>
        <Button onClick={() => setNuovo(!nuovo)} className="h-11"><Plus className="mr-1 size-4" />Nuovo</Button>
      </div>
      {nuovo && (
        <div className="space-y-2 rounded-md border p-3">
          <Label htmlFor="cerca-cliente">Cliente</Label>
          <Input id="cerca-cliente" value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca in anagrafica o scrivi un nome nuovo" />
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
          <ul className="divide-y">
            {trovati.map(c => (
              <li key={c.id}>
                <button type="button" className="w-full px-2 py-3 text-left hover:bg-muted" onClick={() => crea(daCliente(c))}>
                  <span className="block text-sm font-medium">{nomeCliente(daCliente(c))}</span>
                  <span className="block text-xs text-muted-foreground">{[c.telefono, indirizzoDi(c)].filter(Boolean).join(' · ') || 'senza telefono e indirizzo'}</span>
                </button>
              </li>
            ))}
          </ul>
          {cerca.trim().length >= 2 && trovati.length === 0 && !scheda && (
            <p className="text-xs text-muted-foreground">Nessun cliente in anagrafica con questo nome.</p>
          )}
          {cerca.trim() && !scheda && (
            <Button variant="outline" className="h-11 w-full" onClick={() => setScheda({ ...separaNome(cerca), telefono: '' })}>
              <Plus className="mr-1 size-4" />Nuovo cliente: &quot;{cerca.trim()}&quot;
            </Button>
          )}
          {scheda && (
            <div className="space-y-2 rounded-md bg-muted/40 p-3">
              <p className="text-sm font-medium">Nuovo cliente</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs">Nome<Input value={scheda.nome} onChange={e => setScheda({ ...scheda, nome: e.target.value })} /></label>
                <label className="text-xs">Cognome<Input value={scheda.cognome} onChange={e => setScheda({ ...scheda, cognome: e.target.value })} /></label>
              </div>
              <label className="block text-xs">Telefono<Input inputMode="tel" value={scheda.telefono} onChange={e => setScheda({ ...scheda, telefono: e.target.value })} /></label>
              <p className="text-xs text-muted-foreground">
                {isOnline ? 'Viene registrato subito in anagrafica.' : 'Senza rete: verrà registrato in anagrafica al trasferimento in Preventivi.'}
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" className="h-11" onClick={() => setScheda(null)}>Annulla</Button>
                <Button className="h-11 flex-1" disabled={registrando} onClick={() => void registraECrea()}>
                  {registrando && <Loader2 className="mr-2 size-4 animate-spin" />}Registra e inizia il rilievo
                </Button>
              </div>
            </div>
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
