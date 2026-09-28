'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  verificaTokenFic, salvaCollegamentoFic, aggiornaSincronizzaDal, scollegaFic,
} from '@/actions/fatture-in-cloud'
import { formatDataOra, descriviConteggi } from '@/lib/fic/formato'
import type { AziendaFic, CollegamentoFic } from '@/types/fatture-fornitori'

const PERMESSI_FIC = [
  ['Spese (documenti ricevuti)', 'Lettura e scrittura'],
  ['Fornitori', 'Lettura'],
  ['Impostazioni', 'Lettura'],
] as const

const dalDefault = () => `${new Date().getFullYear() - 1}-01-01`

export default function SezioneFattureInCloud({
  collegamento,
  puoModificare,
}: {
  collegamento: CollegamentoFic | null
  puoModificare: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [inModifica, setInModifica] = useState(collegamento === null)
  const [token, setToken] = useState('')
  const [aziende, setAziende] = useState<AziendaFic[] | null>(null)
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [dal, setDal] = useState(collegamento?.sincronizza_dal ?? dalDefault())
  const [confermaCambio, setConfermaCambio] = useState<string | null>(null)
  const [confermaScollega, setConfermaScollega] = useState(false)

  // "Sincronizza dal" decide lo storico del primo scaricamento: dopo non si tocca.
  const dalModificabile = !collegamento || collegamento.ultima_sync_at === null

  function azzera() {
    setToken('')
    setAziende(null)
    setCompanyId(null)
  }

  /**
   * Le Server Action restituiscono gli errori come valori, ma la chiamata stessa
   * puo' fallire (rete caduta, deploy in corso): senza catch React 19 porterebbe
   * l'errore al boundary e l'utente vedrebbe la pagina d'errore invece di un avviso.
   */
  function esegui(azione: () => Promise<void>) {
    startTransition(async () => {
      try {
        await azione()
      } catch {
        toast.error('Connessione interrotta: riprova fra poco')
      }
    })
  }

  function verifica() {
    esegui(async () => {
      const r = await verificaTokenFic(token)
      if (!r.ok) {
        setAziende(null)
        toast.error(r.errore)
        return
      }
      setAziende(r.aziende)
      setCompanyId(r.aziende.length === 1 ? r.aziende[0].id : null)
    })
  }

  function salva(conferma: boolean) {
    if (companyId === null) return
    esegui(async () => {
      const r = await salvaCollegamentoFic({ token, companyId, sincronizzaDal: dal, confermaCambioAzienda: conferma })
      if (!r.ok) {
        if (r.richiedeConferma) setConfermaCambio(r.errore)
        else toast.error(r.errore)
        return
      }
      setConfermaCambio(null)
      toast.success('Fatture in Cloud collegato')
      azzera()
      setInModifica(false)
      router.refresh()
    })
  }

  function salvaDal() {
    esegui(async () => {
      const r = await aggiornaSincronizzaDal(dal)
      if (!r.ok) {
        toast.error(r.errore)
        return
      }
      toast.success('Data salvata')
      router.refresh()
    })
  }

  function scollega() {
    esegui(async () => {
      const r = await scollegaFic()
      setConfermaScollega(false)
      if (!r.ok) {
        toast.error(r.errore)
        return
      }
      toast.success('Fatture in Cloud scollegato')
      setInModifica(true)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {collegamento && (
        <div className="space-y-2 rounded-md border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Collegato a {collegamento.fic_company_nome}</span>
            {collegamento.stato === 'attivo'
              ? <Badge variant="secondary">Attivo</Badge>
              : <Badge variant="destructive">Da ricollegare</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            ID azienda {collegamento.fic_company_id} · token ••••••••{collegamento.token_finale}
          </p>
          <p className="text-sm text-muted-foreground">
            Ultima sincronizzazione:{' '}
            {collegamento.ultima_sync_at
              ? `${formatDataOra(collegamento.ultima_sync_at)}${collegamento.ultimi_conteggi && collegamento.ultimo_esito === 'ok' ? ` · ${descriviConteggi(collegamento.ultimi_conteggi)}` : ''}`
              : 'mai'}
          </p>
          {collegamento.stato === 'da_ricollegare' && (
            <p className="text-sm text-destructive">
              Fatture in Cloud ha rifiutato il token (revocato o permessi cambiati). Genera un nuovo token e sostituiscilo.
            </p>
          )}
          {puoModificare && !inModifica && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setInModifica(true)}>Sostituisci token</Button>
              <Button variant="outline" size="sm" onClick={() => setConfermaScollega(true)}>Scollega</Button>
            </div>
          )}
        </div>
      )}

      {puoModificare && inModifica && (
        <div className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Entra in Fatture in Cloud e apri <strong>Impostazioni → Applicazioni collegate</strong>.</li>
            <li>
              Crea un nuovo <strong>token manuale</strong> e spunta questi permessi:
              <ul className="mt-1 list-disc pl-5">
                {PERMESSI_FIC.map(([voce, livello]) => (
                  <li key={voce}>{voce}: <strong>{livello}</strong></li>
                ))}
              </ul>
            </li>
            <li>Copia il token, incollalo qui sotto e premi <strong>Verifica</strong>.</li>
          </ol>

          <div className="space-y-2">
            <Label htmlFor="fic-token">Token</Label>
            <div className="flex gap-2">
              <Input
                id="fic-token"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => { setToken(e.target.value); setAziende(null); setCompanyId(null) }}
                placeholder="Incolla qui il token"
              />
              <Button onClick={verifica} disabled={pending || !token.trim()}>Verifica</Button>
            </div>
          </div>

          {aziende && aziende.length > 1 && (
            <div className="space-y-2">
              <Label>Azienda</Label>
              <Select value={companyId === null ? '' : String(companyId)} onValueChange={(v) => setCompanyId(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Scegli l'azienda" /></SelectTrigger>
                <SelectContent>
                  {aziende.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {aziende && aziende.length === 1 && (
            <p className="text-sm">Token valido per <strong>{aziende[0].nome}</strong>.</p>
          )}

          {dalModificabile && (
            <div className="space-y-2">
              <Label htmlFor="fic-dal">Sincronizza dal</Label>
              <Input id="fic-dal" type="date" className="w-44" value={dal} onChange={(e) => setDal(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Le fatture con data precedente non vengono scaricate. Non si può cambiare dopo la prima sincronizzazione.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={() => salva(false)} disabled={pending || companyId === null || !dal}>Salva collegamento</Button>
            {collegamento && (
              <Button variant="ghost" onClick={() => { azzera(); setInModifica(false) }} disabled={pending}>Annulla</Button>
            )}
          </div>
        </div>
      )}

      {puoModificare && collegamento && !inModifica && dalModificabile && (
        <div className="space-y-2">
          <Label htmlFor="fic-dal-coll">Sincronizza dal</Label>
          {/* Si salva col pulsante, non a ogni tasto: da tastiera l'anno passa per 0002, 0020... */}
          <div className="flex gap-2">
            <Input
              id="fic-dal-coll"
              type="date"
              className="w-44"
              value={dal}
              onChange={(e) => setDal(e.target.value)}
            />
            <Button
              variant="outline"
              onClick={salvaDal}
              disabled={pending || !dal || dal === collegamento.sincronizza_dal}
            >
              Salva data
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Modificabile fino alla prima sincronizzazione completata.
          </p>
        </div>
      )}

      {!puoModificare && !collegamento && (
        <p className="text-sm text-muted-foreground">Fatture in Cloud non è collegato.</p>
      )}

      <AlertDialog open={confermaCambio !== null} onOpenChange={(o) => { if (!o) setConfermaCambio(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambiare azienda?</AlertDialogTitle>
            <AlertDialogDescription>{confermaCambio}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => salva(true)}>Cambia azienda</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confermaScollega} onOpenChange={setConfermaScollega}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Scollegare Fatture in Cloud?</AlertDialogTitle>
            <AlertDialogDescription>
              Il token viene cancellato. Le fatture già scaricate restano consultabili, ma non si potranno più
              sincronizzare finché non ricolleghi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={scollega}>Scollega</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
