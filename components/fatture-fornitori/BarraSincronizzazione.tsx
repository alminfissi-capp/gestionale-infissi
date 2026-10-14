'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { anticipaSincronizzaDal, impostaSyncAutomatica, sincronizzaFattureFornitori } from '@/actions/fatture-in-cloud'
import { anticipaSincronizzaDalEmesse, sincronizzaFattureEmesse } from '@/actions/fatture-emesse'
import { formatData, formatDataOra, descriviConteggi } from '@/lib/fic/formato'
import type { CollegamentoFic } from '@/types/fatture-fornitori'

/** Quanto serve alla barra: vale per la sincronizzazione dei fornitori e per quella delle emesse. */
export type StatoSincronizzazione = Pick<
  CollegamentoFic,
  'stato' | 'sincronizza_dal' | 'sync_automatica' | 'ultima_sync_at' | 'ultimo_esito' | 'ultimo_messaggio' | 'ultimi_conteggi'
>

export default function BarraSincronizzazione({
  collegamento,
  puoSincronizzare,
  tipo = 'fornitori',
}: {
  collegamento: StatoSincronizzazione | null
  puoSincronizzare: boolean
  tipo?: 'fornitori' | 'clienti'
}) {
  const azioni = tipo === 'clienti'
    ? { sincronizza: sincronizzaFattureEmesse, anticipa: anticipaSincronizzaDalEmesse }
    : { sincronizza: sincronizzaFattureFornitori, anticipa: anticipaSincronizzaDal }
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [nuovaData, setNuovaData] = useState<string | null>(null)
  const [automatica, setAutomatica] = useState(collegamento?.sync_automatica ?? false)
  const [salvaAuto, startAuto] = useTransition()

  function cambiaAutomatica(attiva: boolean) {
    setAutomatica(attiva)
    startAuto(async () => {
      try {
        const r = await impostaSyncAutomatica(tipo === 'clienti' ? 'emesse' : 'fornitori', attiva)
        if (!r.ok) { setAutomatica(!attiva); toast.error(r.errore); return }
        toast.success(attiva ? 'Sincronizzazione automatica attivata: ogni ora' : 'Sincronizzazione automatica disattivata')
        router.refresh()
      } catch {
        setAutomatica(!attiva)
        toast.error('Connessione interrotta: riprova')
      }
    })
  }

  function anticipa() {
    if (!nuovaData) return
    startTransition(async () => {
      try {
        const r = await azioni.anticipa(nuovaData)
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
        const r = await azioni.sincronizza()
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
      <label htmlFor={`sync-auto-${tipo}`} className="flex items-start gap-3 rounded-md border p-2.5">
        <Switch
          id={`sync-auto-${tipo}`}
          checked={automatica}
          onCheckedChange={cambiaAutomatica}
          disabled={!puoSincronizzare || salvaAuto}
          className="mt-0.5"
        />
        <span>
          <span className="block text-sm font-medium">Sincronizzazione automatica</span>
          <span className="block text-xs text-muted-foreground">
            {automatica ? 'Attiva: le fatture si aggiornano da sole ogni ora' : 'Spenta: si aggiornano solo col tasto Sincronizza'}
          </span>
        </span>
      </label>
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
