'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import AllegatiVoce from '@/components/rilievo/AllegatiVoce'
import { db } from '@/lib/db'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { eliminaRilievoLocale, eliminaVoceLocale, salvaRilievoLocale } from '@/lib/rilievo-fp-locale'
import DisegnoVoceSvg from './DisegnoVoceSvg'
import { nomeCliente } from './ElencoRilievi'

interface Props {
  id: string
  onIndietro: () => void
  onVoce: (voceId: string | null) => void
}

export default function SchedaRilievo({ id, onIndietro, onVoce }: Props) {
  const { isOnline } = useOnlineStatus()
  const rilievo = useLiveQuery(() => db.rilieviFp.get(id), [id])
  const voci = useLiveQuery(() => db.vociFp.where('rilievoId').equals(id).sortBy('ordine'), [id], [])
  const strutture = useLiveQuery(async () => {
    const righe = await db.fpStrutture.bulkGet(voci.map(v => v.fp.strutturaId))
    return new Map(righe.filter(s => !!s).map(s => [s!.id, s!]))
  }, [voci])

  if (!rilievo) return <p className="text-sm text-muted-foreground">Rilievo non trovato.</p>

  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" onClick={onIndietro}><ChevronLeft className="mr-1 size-4" />Rilievi</Button>
      <div>
        <h1 className="text-lg font-semibold">{nomeCliente(rilievo.cliente) || 'Senza nome'}</h1>
        {rilievo.cliente.cantiere && <p className="text-sm text-muted-foreground">{rilievo.cliente.cantiere}</p>}
      </div>
      <Textarea aria-label="Note del rilievo" placeholder="Note del rilievo" value={rilievo.note} onChange={e => salvaRilievoLocale({ ...rilievo, note: e.target.value })} />

      <ul className="space-y-2">
        {voci.map(v => {
          const s = strutture?.get(v.fp.strutturaId)
          return (
            <li key={v.id} className="rounded-md border bg-card p-2">
              <div className="flex gap-3">
                <button type="button" className="flex flex-1 gap-3 text-left" onClick={() => onVoce(v.id)}>
                  {s ? <DisegnoVoceSvg struttura={s} voce={v.fp} className="size-20 shrink-0" /> : <div className="size-20 shrink-0 bg-muted" />}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{v.posizione || 'Voce'} · {v.quantita} pz</span>
                    <span className="block text-xs text-muted-foreground">{v.fp.serie} · {v.fp.nome}</span>
                    <span className="block text-xs">{v.fp.larghezza ?? '?'} × {v.fp.altezza ?? '?'} mm</span>
                    {!s && <span className="block text-xs text-amber-700">Struttura non più in FP PRO</span>}
                    {v.daInviare === 1 && <span className="block text-xs text-red-700">da inviare</span>}
                  </span>
                </button>
                <button type="button" className="p-2" aria-label="Elimina voce" onClick={() => { if (confirm('Eliminare questa voce?')) void eliminaVoceLocale(v.id) }}>
                  <Trash2 className="size-4 text-muted-foreground" />
                </button>
              </div>
              {isOnline && v.daInviare === 0 && <div className="mt-2"><AllegatiVoce voceId={v.id} /></div>}
            </li>
          )
        })}
      </ul>
      <Button className="h-12 w-full" onClick={() => onVoce(null)}><Plus className="mr-1 size-4" />Aggiungi voce</Button>
      <Button variant="ghost" className="w-full text-red-700" onClick={async () => { if (confirm('Eliminare tutto il rilievo?')) { await eliminaRilievoLocale(id); onIndietro() } }}>
        Elimina rilievo
      </Button>
    </div>
  )
}
