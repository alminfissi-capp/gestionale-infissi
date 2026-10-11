'use client'

import { CloudOff, RefreshCw, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import type { StatoCatalogo } from '@/hooks/useCatalogoLocale'

const data = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' })

interface Props {
  catalogo: { stato: StatoCatalogo; aggiorna: () => Promise<void> }
  invio: { daInviare: number; invia: () => Promise<void>; errore: string | null }
}

export default function StatoSync({ catalogo, invio }: Props) {
  const { isOnline } = useOnlineStatus()
  const s = catalogo.stato
  return (
    <div className="space-y-1 rounded-md border bg-muted/40 p-2 text-xs">
      <div className="flex items-center gap-2">
        {!isOnline && <span className="flex items-center gap-1 text-amber-700"><CloudOff className="size-4" />Senza rete</span>}
        <span className={invio.daInviare > 0 ? 'font-medium text-red-700' : 'text-muted-foreground'}>
          {invio.daInviare > 0 ? `${invio.daInviare} modifiche da inviare` : 'Tutto inviato'}
        </span>
        {invio.daInviare > 0 && isOnline && (
          <Button size="sm" variant="ghost" className="ml-auto h-8" onClick={() => invio.invia()}><UploadCloud className="mr-1 size-4" />Invia</Button>
        )}
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>
          {s.fase === 'dati' && `Scarico il catalogo FP PRO… ${s.fatte} righe`}
          {s.fase === 'immagini' && `Scarico le immagini… ${s.fatte}`}
          {s.fase === 'errore' && <span className="text-red-700">Catalogo non aggiornato: {s.messaggio}</span>}
          {s.fase === 'fermo' && (s.ultimo ? `Catalogo aggiornato il ${data.format(new Date(s.ultimo))}` : 'Catalogo non ancora scaricato (meglio con Wi-Fi)')}
        </span>
        {isOnline && s.fase !== 'dati' && s.fase !== 'immagini' && (
          <Button size="sm" variant="ghost" className="ml-auto h-8" onClick={() => catalogo.aggiorna()}><RefreshCw className="mr-1 size-4" />Aggiorna</Button>
        )}
      </div>
      {invio.errore && <p className="text-red-700">Ultimo invio non riuscito: {invio.errore}</p>}
    </div>
  )
}
