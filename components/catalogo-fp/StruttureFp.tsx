'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cercaStrutture, getFiltriStrutture } from '@/actions/catalogo-fp'
import DettaglioStrutturaFp from './DettaglioStrutturaFp'
import type { FiltriStrutture, StrutturaFpRiga } from '@/types/fppro'

const TUTTE = '__tutte__'

export default function StruttureFp() {
  const [filtri, setFiltri] = useState<FiltriStrutture>({ serie: [], cartelle: [] })
  const [serie, setSerie] = useState<string>(TUTTE)
  const [cartella, setCartella] = useState<string>(TUTTE)
  const [testo, setTesto] = useState('')
  const [strutture, setStrutture] = useState<StrutturaFpRiga[]>([])
  const [cercando, setCercando] = useState(true)
  const [aperta, setAperta] = useState<string | null>(null)

  useEffect(() => {
    getFiltriStrutture().then(setFiltri).catch(() => toast.error('Filtri delle strutture non disponibili'))
  }, [])

  useEffect(() => {
    let annullata = false
    const id = setTimeout(async () => {
      try {
        const r = await cercaStrutture({ serie: serie === TUTTE ? null : serie, cartella: cartella === TUTTE ? null : cartella, testo })
        if (annullata) return
        if ('errore' in r) toast.error(r.errore)
        else setStrutture(r.strutture)
      } catch {
        if (!annullata) toast.error('Ricerca non riuscita: controlla la connessione')
      } finally {
        if (!annullata) setCercando(false)
      }
    }, 300)
    return () => { annullata = true; clearTimeout(id) }
  }, [serie, cartella, testo])

  const cambia = (f: () => void) => { setCercando(true); f() }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={serie} onValueChange={v => cambia(() => setSerie(v))}>
          <SelectTrigger className="sm:w-56"><SelectValue placeholder="Serie" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TUTTE}>Tutte le serie</SelectItem>
            {filtri.serie.map(s => <SelectItem key={s.serie} value={s.serie}>{s.serie} ({s.strutture})</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={cartella} onValueChange={v => cambia(() => setCartella(v))}>
          <SelectTrigger className="sm:w-56"><SelectValue placeholder="Cartella" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TUTTE}>Tutte le cartelle</SelectItem>
            {filtri.cartelle.map(c => <SelectItem key={c.cartella} value={c.cartella}>{c.cartella} ({c.strutture})</SelectItem>)}
          </SelectContent>
        </Select>
        <Input className="sm:max-w-xs" placeholder="Cerca nome o codice" value={testo} onChange={e => cambia(() => setTesto(e.target.value))} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {strutture.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => setAperta(s.id)}
            className="rounded-md border bg-card text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-primary overflow-hidden"
          >
            <div className="aspect-square bg-white grid place-items-center">
              {s.immagineUrl
                ? <img src={s.immagineUrl} alt="" className="w-full h-full object-contain" loading="lazy" />
                : <span className="text-xs text-muted-foreground">{s.errore ? 'File non leggibile' : 'Nessuna immagine'}</span>}
            </div>
            <div className="p-2">
              <p className="text-sm font-medium leading-tight line-clamp-2">{s.nome}</p>
              <p className="text-xs text-muted-foreground truncate">{s.serie.join(' + ') || '—'} · {s.cartella}</p>
            </div>
          </button>
        ))}
      </div>
      {strutture.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">{cercando ? 'Ricerca…' : 'Nessuna struttura'}</p>
      )}
      <p className="text-xs text-muted-foreground">Al massimo 60 strutture: usa serie, cartella o ricerca per restringere.</p>

      <DettaglioStrutturaFp id={aperta} onChiudi={() => setAperta(null)} />
    </div>
  )
}
