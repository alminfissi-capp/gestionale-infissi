'use client'

import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, Folder, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { db } from '@/lib/db'
import { impostaPreferenzaFp } from '@/actions/rilievo-fp'
import ImmagineStruttura from './ImmagineStruttura'
import type { StrutturaLocale } from '@/types/rilievo-fp'

interface Props {
  serie: string
  onScegli: (s: StrutturaLocale) => void
}

const cartellaDi = (percorso: string) => percorso.slice(0, percorso.lastIndexOf('/') + 1)

export default function SceltaTipologia({ serie, onScegli }: Props) {
  const strutture = useLiveQuery(() => db.fpStrutture.where('serie').equals(serie).filter(s => s.presente).toArray(), [serie], [])
  const preferite = useLiveQuery(async () => new Set((await db.fpPreferenze.where('tipo').equals('struttura').toArray()).map(p => p.rif)), [], new Set<string>())
  const recenti = useLiveQuery(async () => {
    const voci = await db.vociFp.orderBy('aggiornatoAt').reverse().limit(200).toArray()
    return [...new Set(voci.filter(v => v.fp.serie === serie).map(v => v.fp.strutturaId))].slice(0, 6)
  }, [serie], [] as string[])
  const [cartella, setCartella] = useState('')
  const [testo, setTesto] = useState('')

  const q = testo.trim().toLowerCase()
  const { sottocartelle, qui } = useMemo(() => {
    const sotto = new Map<string, number>()
    const file: StrutturaLocale[] = []
    for (const s of strutture) {
      if (!s.percorso.startsWith(cartella)) continue
      const resto = s.percorso.slice(cartella.length)
      const i = resto.indexOf('/')
      if (i === -1) file.push(s)
      else sotto.set(resto.slice(0, i), (sotto.get(resto.slice(0, i)) ?? 0) + 1)
    }
    return { sottocartelle: [...sotto.entries()].sort((a, b) => a[0].localeCompare(b[0])), qui: file.sort((a, b) => a.nome.localeCompare(b.nome)) }
  }, [strutture, cartella])

  const inEvidenza = strutture.filter(s => preferite.has(s.id) || recenti.includes(s.id))
  const trovate = q.length >= 2 ? strutture.filter(s => `${s.nome} ${s.codice ?? ''} ${s.percorso}`.toLowerCase().includes(q)).slice(0, 60) : []

  const stella = async (s: StrutturaLocale) => {
    const attiva = !preferite.has(s.id)
    if (!navigator.onLine) { toast.error('Per segnare una preferita serve la rete'); return }
    const r = await impostaPreferenzaFp('struttura', s.id, attiva)
    if ('errore' in r) { toast.error(r.errore); return }
    if (attiva) await db.fpPreferenze.put({ id: `struttura:${s.id}`, tipo: 'struttura', rif: s.id, ordine: 0 })
    else await db.fpPreferenze.delete(`struttura:${s.id}`)
  }

  const scheda = (s: StrutturaLocale) => (
    <li key={s.id} className="flex items-center gap-2 rounded-md border bg-card">
      <button type="button" onClick={() => onScegli(s)} className="flex flex-1 items-center gap-3 p-2 text-left">
        <ImmagineStruttura path={s.immagine} className="size-16 shrink-0 rounded" />
        <span className="min-w-0">
          <span className="block text-sm font-medium leading-tight">{s.nome}</span>
          <span className="block truncate text-xs text-muted-foreground">{cartellaDi(s.percorso)}</span>
        </span>
      </button>
      <button type="button" onClick={() => stella(s)} className="p-3" aria-label={preferite.has(s.id) ? 'Togli dalle preferite' : 'Aggiungi alle preferite'}>
        <Star className={`size-5 ${preferite.has(s.id) ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground'}`} />
      </button>
    </li>
  )

  if (strutture.length === 0) return <p className="text-sm text-muted-foreground">Nessuna struttura di {serie} nel telefono: aggiorna il catalogo quando c&apos;è rete.</p>

  return (
    <div className="space-y-3">
      <Input value={testo} onChange={e => setTesto(e.target.value)} placeholder="Cerca per nome (es. 2 ante, vasistas)" aria-label="Cerca struttura" />
      {q.length >= 2 ? (
        <ul className="space-y-2">{trovate.map(scheda)}{trovate.length === 0 && <li className="text-sm text-muted-foreground">Nessuna struttura</li>}</ul>
      ) : (
        <>
          {inEvidenza.length > 0 && cartella === '' && (
            <section>
              <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">Preferite e recenti</h3>
              <ul className="space-y-2">{inEvidenza.map(scheda)}</ul>
            </section>
          )}
          <section>
            <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
              {cartella && (
                <button type="button" className="flex items-center p-1" onClick={() => setCartella(cartella.slice(0, cartella.slice(0, -1).lastIndexOf('/') + 1))} aria-label="Cartella superiore">
                  <ChevronLeft className="size-4" />
                </button>
              )}
              <span className="truncate">{cartella || 'Tutte le cartelle'}</span>
            </div>
            <ul className="space-y-1">
              {sottocartelle.map(([nome, n]) => (
                <li key={nome}>
                  <button type="button" onClick={() => setCartella(`${cartella}${nome}/`)} className="flex w-full items-center gap-2 rounded-md px-3 py-3 text-left hover:bg-muted">
                    <Folder className="size-4 text-muted-foreground" /><span className="flex-1 text-sm">{nome}</span><span className="text-xs text-muted-foreground">{n}</span>
                  </button>
                </li>
              ))}
            </ul>
            {qui.length > 0 && <ul className="mt-2 space-y-2">{qui.map(scheda)}</ul>}
          </section>
        </>
      )}
    </div>
  )
}
