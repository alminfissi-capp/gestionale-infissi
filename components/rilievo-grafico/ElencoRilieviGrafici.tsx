'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLiveQuery } from 'dexie-react-hooks'
import { CloudOff, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import PulsanteIndietro from '@/components/layout/PulsanteIndietro'
import { db } from '@/lib/db'
import type { RilievoGraficoLocale } from '@/types/rilievo-grafico'
import { calcolaDisegno } from '@/lib/rilievo-grafico/geometria'
import { formaIniziale } from '@/lib/rilievo-grafico/forma'
import { radiceIniziale } from '@/lib/rilievo-grafico/modifiche'
import { mancanti } from '@/lib/rilievo-grafico/ruoli'
import { modelloPerId } from '@/lib/rilievo-grafico/modelli'
import DisegnoSvg from './DisegnoSvg'
import { aggiornaDalServer, eliminaRilievo, salvaRilievo } from './archivio'

const data = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })

function Scheda({ r, onElimina }: { r: RilievoGraficoLocale; onElimina: () => void }) {
  const calc = useMemo(() => calcolaDisegno(r.disegno), [r.disegno])
  const conta = mancanti(calc, r.disegno.profili, r.disegno.riempimenti)
  const forma = r.disegno.forma.tipo === 'modello' ? modelloPerId(r.disegno.forma.modello)?.nome ?? 'Modello' : 'Forma a punti'
  return (
    <div className="flex gap-3 rounded-lg border bg-card p-3">
      <Link href={`/rilievo/grafico/${r.id}`} className="flex min-w-0 flex-1 gap-3">
        <DisegnoSvg calc={calc} modo="miniatura" className="size-20 shrink-0" />
        <div className="min-w-0 space-y-0.5">
          <p className="truncate font-semibold">{r.nome || 'Senza riferimento'}{r.quantita > 1 ? ` × ${r.quantita}` : ''}</p>
          <p className="truncate text-sm text-muted-foreground">{r.cliente || 'Cliente non indicato'}</p>
          <p className="text-xs text-muted-foreground">{forma} · {Math.round(calc.larghezza)} × {Math.round(calc.altezza)} mm · {data(r.aggiornatoAt)}</p>
          <p className="text-xs">
            {conta.pezzi + conta.riempimenti === 0
              ? <span className="text-green-700">Profili e vetri completi</span>
              : <span className="text-red-600">{conta.pezzi} pezzi e {conta.riempimenti} riempimenti da assegnare</span>}
            {r.daInviare === 1 && <span className="ml-2 inline-flex items-center gap-1 text-amber-700"><CloudOff className="size-3" />da inviare</span>}
          </p>
        </div>
      </Link>
      <Button variant="ghost" size="icon" aria-label="Elimina" onClick={onElimina}><Trash2 className="size-4" /></Button>
    </div>
  )
}

export default function ElencoRilieviGrafici() {
  const router = useRouter()
  const rilievi = useLiveQuery(() => db.rilieviGrafici.orderBy('aggiornatoAt').reverse().toArray(), [])
  const [sync, setSync] = useState<'in_corso' | 'ok' | string>('in_corso')
  const [cerca, setCerca] = useState('')
  const [daEliminare, setDaEliminare] = useState<RilievoGraficoLocale | null>(null)

  useEffect(() => {
    let vivo = true
    void aggiornaDalServer().then(r => { if (vivo) setSync(r.ok ? 'ok' : r.errore ?? 'Non aggiornato') })
    return () => { vivo = false }
  }, [])

  const nuovo = async () => {
    const ora = new Date().toISOString()
    const id = crypto.randomUUID()
    await salvaRilievo({
      id, nome: '', cliente: '', note: '', quantita: 1, creatoAt: ora, aggiornatoAt: ora,
      disegno: { forma: formaIniziale(), radice: radiceIniziale(), serie: [], profili: {}, riempimenti: {} },
    })
    router.push(`/rilievo/grafico/${id}`)
  }

  const q = cerca.trim().toLowerCase()
  const visibili = (rilievi ?? []).filter(r => !q || `${r.nome} ${r.cliente} ${r.note}`.toLowerCase().includes(q))

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <PulsanteIndietro fallback="/rilievo" />
        <h1 className="text-xl font-bold">Rilievo grafico</h1>
        <Button className="ml-auto gap-1.5" onClick={() => void nuovo()}><Plus className="size-4" />Nuovo serramento</Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Serramenti fuori standard: in cantiere disegni forma, montanti, traversi, ante e riempimenti; in ufficio assegni a ogni pezzo la barra di FP PRO, a ogni zona il vetro o il pannello.
      </p>
      <div className="flex items-center gap-2">
        <Input placeholder="Cerca per riferimento, cliente o note" value={cerca} onChange={e => setCerca(e.target.value)} />
        {sync === 'in_corso' && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
      </div>
      {sync !== 'in_corso' && sync !== 'ok' && <p className="text-xs text-amber-700">Non aggiornato dal server ({sync}): vedi i rilievi salvati su questo dispositivo.</p>}

      {rilievi === undefined ? <p className="text-sm text-muted-foreground">Caricamento…</p>
        : visibili.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{q ? 'Nessun rilievo trovato' : 'Ancora nessun rilievo grafico'}</p>
          : <div className="space-y-2">{visibili.map(r => <Scheda key={r.id} r={r} onElimina={() => setDaEliminare(r)} />)}</div>}

      <AlertDialog open={!!daEliminare} onOpenChange={o => { if (!o) setDaEliminare(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il rilievo?</AlertDialogTitle>
            <AlertDialogDescription>
              «{daEliminare?.nome || 'Senza riferimento'}» viene eliminato da questo dispositivo e dal server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (daEliminare) void eliminaRilievo(daEliminare.id); setDaEliminare(null) }}>Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
