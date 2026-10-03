'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { anticipaSincronizzaDal, sincronizzaFattureFornitori } from '@/actions/fatture-in-cloud'
import { formatData, formatDataOra, descriviConteggi } from '@/lib/fic/formato'
import type { CollegamentoFic } from '@/types/fatture-fornitori'

export default function BarraSincronizzazione({
  collegamento,
  puoSincronizzare,
}: {
  collegamento: CollegamentoFic | null
  puoSincronizzare: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [nuovaData, setNuovaData] = useState<string | null>(null)

  function anticipa() {
    if (!nuovaData) return
    startTransition(async () => {
      try {
        const r = await anticipaSincronizzaDal(nuovaData)
        if (!r.ok) { toast.error(r.errore); return }
        toast.success('Data anticipata: ora premi Sincronizza')
        setNuovaData(null)
        router.refresh()
      } catch {
        toast.error('Connessione interrotta: riprova')
      }
    })
  }

  function sincronizzaOra() {
    startTransition(async () => {
      // La chiamata dura fino a qualche minuto: se cade la connessione (telefono in
      // standby, timeout) React 19 porterebbe l'errore al boundary. Meglio un avviso.
      try {
        const r = await sincronizzaFattureFornitori()
        if (r.esito === 'ok') toast.success(`Sincronizzazione completata: ${descriviConteggi(r.conteggi)}`)
        else if (r.esito === 'parziale') toast.warning(r.messaggio)
        else toast.error(r.messaggio)
      } catch {
        toast.error('Connessione interrotta durante la sincronizzazione: ricarica la pagina per vedere l\'esito')
      }
      router.refresh()
    })
  }

  if (!collegamento || collegamento.stato !== 'attivo') {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
        {collegamento
          ? 'Il collegamento a Fatture in Cloud va rinnovato: il token è stato rifiutato.'
          : 'Fatture in Cloud non è collegato.'}{' '}
        <Link href="/impostazioni" className="font-medium underline">Vai in Impostazioni → Fatture in Cloud</Link>
      </div>
    )
  }

  // Un giro parziale o fallito si vede sempre, anche se l'ultima completa e' andata bene.
  const esitoDaMostrare =
    collegamento.ultimo_esito && collegamento.ultimo_esito !== 'ok' && collegamento.ultimo_messaggio
      ? collegamento.ultimo_messaggio
      : null

  return (
    <div className="flex flex-wrap items-center gap-3">
      {puoSincronizzare && (
        <Button onClick={sincronizzaOra} disabled={pending}>
          <RefreshCw className={pending ? 'animate-spin' : ''} />
          {pending ? 'Sincronizzazione…' : 'Sincronizza'}
        </Button>
      )}
      <div className="text-sm text-muted-foreground">
        Ultima sincronizzazione:{' '}
        {collegamento.ultima_sync_at ? (
          <>
            <span className="font-medium text-foreground">{formatDataOra(collegamento.ultima_sync_at)}</span>
            {collegamento.ultimo_esito === 'ok' && collegamento.ultimi_conteggi && ` · ${descriviConteggi(collegamento.ultimi_conteggi)}`}
          </>
        ) : 'mai'}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        Fatture dal <span className="font-medium text-foreground">{formatData(collegamento.sincronizza_dal)}</span>
        {puoSincronizzare && nuovaData === null && (
          <Button size="sm" variant="outline" onClick={() => setNuovaData(collegamento.sincronizza_dal)} disabled={pending}>
            Scarica anche gli anni precedenti
          </Button>
        )}
        {puoSincronizzare && nuovaData !== null && (
          <>
            <Input
              type="date" className="h-8 w-40" value={nuovaData}
              max={collegamento.sincronizza_dal}
              onChange={(e) => setNuovaData(e.target.value)}
              aria-label="Scarica fatture dal"
            />
            <Button size="sm" onClick={anticipa} disabled={pending || !nuovaData || nuovaData >= collegamento.sincronizza_dal}>
              Conferma
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNuovaData(null)} disabled={pending}>Annulla</Button>
          </>
        )}
      </div>
      {esitoDaMostrare && (
        <div className={`w-full text-sm ${collegamento.ultimo_esito === 'errore' ? 'text-destructive' : 'text-amber-700 dark:text-amber-400'}`}>
          {esitoDaMostrare}
        </div>
      )}
    </div>
  )
}
