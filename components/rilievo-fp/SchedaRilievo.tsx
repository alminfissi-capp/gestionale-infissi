'use client'

import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Calculator, ChevronLeft, Copy, Plus, Printer, Trash2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import AllegatiVoce from '@/components/rilievo/AllegatiVoce'
import { db } from '@/lib/db'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { eliminaRilievoLocale, eliminaVoceLocale, salvaRilievoLocale } from '@/lib/rilievo-fp-locale'
import type { RilievoFp } from '@/types/rilievo-fp'
import SchedaVoceRiepilogo from './SchedaVoceRiepilogo'
import { nomeCliente } from './ElencoRilievi'

/**
 * Note del rilievo: testo locale, salvato 600 ms dopo l'ultima lettera (scrivere
 * direttamente nell'archivio a ogni tasto faceva saltare lettere e cursore).
 */
function NoteRilievo({ rilievo }: { rilievo: RilievoFp }) {
  const [testo, setTesto] = useState(rilievo.note)
  useEffect(() => {
    if (testo === rilievo.note) return
    const id = setTimeout(() => { void salvaRilievoLocale({ ...rilievo, note: testo }) }, 600)
    return () => clearTimeout(id)
  }, [testo, rilievo])
  return <Textarea aria-label="Note del rilievo" placeholder="Note del rilievo" value={testo} onChange={e => setTesto(e.target.value)} />
}

/** Cantiere e data del rilievo: si salvano uscendo dal campo (come le note, senza scrivere a ogni tasto). */
function DatiRilievo({ rilievo }: { rilievo: RilievoFp }) {
  const [cantiere, setCantiere] = useState(rilievo.cliente.cantiere ?? '')
  const data = rilievo.dataRilievo || rilievo.creatoAt.slice(0, 10)
  const salvaCantiere = () => {
    const nuovo = cantiere.trim() || null
    if (nuovo !== (rilievo.cliente.cantiere ?? null)) void salvaRilievoLocale({ ...rilievo, cliente: { ...rilievo.cliente, cantiere: nuovo } })
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_10rem] gap-2">
      <label className="text-xs text-muted-foreground">Cantiere / indirizzo
        <Input className="h-8" value={cantiere} onChange={e => setCantiere(e.target.value)} onBlur={salvaCantiere} placeholder="se diverso dall'indirizzo del cliente" />
      </label>
      <label className="text-xs text-muted-foreground">Data del rilievo
        <Input className="h-8" type="date" value={data} onChange={e => { if (e.target.value) void salvaRilievoLocale({ ...rilievo, dataRilievo: e.target.value }) }} />
      </label>
    </div>
  )
}

interface Props {
  id: string
  onIndietro: () => void
  onVoce: (voceId: string | null) => void
  /** Nuova voce con le scelte di questa (si salva solo con Salva) */
  onCopia: (voceId: string) => void
  onRiepilogo: () => void
}

export default function SchedaRilievo({ id, onIndietro, onVoce, onCopia, onRiepilogo }: Props) {
  const { isOnline } = useOnlineStatus()
  const rilievo = useLiveQuery(() => db.rilieviFp.get(id), [id])
  const voci = useLiveQuery(() => db.vociFp.where('rilievoId').equals(id).sortBy('ordine'), [id])
  const strutture = useLiveQuery(async () => {
    const righe = await db.fpStrutture.bulkGet((voci ?? []).map(v => v.fp.strutturaId))
    return new Map(righe.filter(s => !!s).map(s => [s!.id, s!]))
  }, [voci])
  const catalogoVuoto = useLiveQuery(async () => (await db.fpStrutture.count()) === 0, [], false)

  if (!rilievo) return <p className="text-sm text-muted-foreground">Rilievo non trovato.</p>

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onIndietro}><ChevronLeft className="mr-1 size-4" />Rilievi</Button>
        {(voci ?? []).length > 0 && <Button variant="outline" size="sm" className="gap-1.5" onClick={onRiepilogo}><Printer className="size-4" />Stampa / PDF</Button>}
      </div>
      <div>
        <h1 className="text-lg font-semibold">{nomeCliente(rilievo.cliente) || 'Senza nome'}</h1>
        {rilievo.cliente.indirizzo && <p className="text-sm text-muted-foreground">{rilievo.cliente.indirizzo}</p>}
      </div>
      <DatiRilievo key={rilievo.id} rilievo={rilievo} />
      <NoteRilievo key={rilievo.id} rilievo={rilievo} />

      <ul className="space-y-2">
        {(voci ?? []).map((v, i) => {
          const s = strutture?.get(v.fp.strutturaId)
          return (
            <li key={v.id} className="space-y-1">
              <div className="flex items-start gap-1">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onVoce(v.id)} aria-label={`Apri ${v.posizione || 'voce'}`}>
                  <SchedaVoceRiepilogo voce={v} struttura={s ?? null} prezzo={null} numero={i + 1} />
                </button>
                <button type="button" className="p-2" aria-label="Copia voce" title="Copia" onClick={() => onCopia(v.id)}>
                  <Copy className="size-4 text-muted-foreground" />
                </button>
                <button type="button" className="p-2" aria-label="Elimina voce" onClick={() => { if (confirm('Eliminare questa voce?')) void eliminaVoceLocale(v.id) }}>
                  <Trash2 className="size-4 text-muted-foreground" />
                </button>
              </div>
              {!s && <p className="text-xs text-amber-700">{catalogoVuoto ? 'Catalogo FP PRO non ancora scaricato' : 'Struttura non più in FP PRO'}</p>}
              {s && !s.presente && <p className="text-xs text-amber-700">Struttura non più in FP PRO</p>}
              {v.daInviare === 1 && <p className="text-xs text-red-700">da inviare</p>}
              {isOnline && v.daInviare === 0 && <div className="mt-2"><AllegatiVoce voceId={v.id} /></div>}
            </li>
          )
        })}
      </ul>
      <Button className="h-12 w-full" onClick={() => onVoce(null)}><Plus className="mr-1 size-4" />Aggiungi voce</Button>
      {isOnline && (voci ?? []).length > 0 && (
        (voci ?? []).some(v => v.daInviare === 1) || rilievo.daInviare === 1
          ? <p className="text-center text-xs text-amber-700">Calcolo e preventivo: prima vanno inviate le modifiche (attendi qualche secondo).</p>
          // Navigazione piena: la pagina del calcolo non e' nell'app del cantiere.
          : <a href={`/rilievo/calcolo/${id}`} className={buttonVariants({ variant: 'outline', className: 'h-12 w-full' })}>
              <Calculator className="mr-1 size-4" />Calcolo e preventivo
            </a>
      )}
      <Button variant="ghost" className="w-full text-red-700" onClick={async () => { if (confirm('Eliminare tutto il rilievo?')) { await eliminaRilievoLocale(id); onIndietro() } }}>
        Elimina rilievo
      </Button>
    </div>
  )
}
