'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getDatiCollegamento, salvaCollegamentiScadenza, riprovaScadenzaFic, scollegaSenzaFic } from '@/actions/fic-pagamenti'
import { ripartisci, controllaRipartizione, fornitoreCorrisponde, parseImporto } from '@/lib/fic/pagamenti'
import { formatData } from '@/lib/fic/formato'
import { formatEuro } from '@/lib/pricing'
import { mostraEsitoFic } from '@/components/commesse/esito-fic'
import type { DatiCollegamento, DocumentoCollegabile } from '@/types/fatture-fornitori'
import type { Scadenza } from '@/types/commessa'

const STATO_LABEL = {
  non_scritto: 'Non ancora su FiC', scritto: 'Scritto su FiC', da_allineare: 'Da allineare',
  da_verificare: 'Da verificare', in_corso: 'Operazione in corso',
} as const

export default function DialogCollegaFatture({ scadenza, onClose }: { scadenza: Scadenza; onClose: () => void }) {
  const router = useRouter()
  const [dati, setDati] = useState<DatiCollegamento | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [ricerca, setRicerca] = useState(scadenza.fornitore)
  const [metodoId, setMetodoId] = useState<number | null>(null)
  const [quote, setQuote] = useState<Record<number, number>>({})
  const [testoQuote, setTestoQuote] = useState<Record<number, string>>({})
  const [pending, startTransition] = useTransition()

  // Caricamento alla prima apertura: un'unica lettura, poi tutto nel browser.
  useEffect(() => {
    let annullato = false
    getDatiCollegamento(scadenza.id)
      .then((d) => {
        if (annullato) return
        if ('errore' in d) { setErrore(d.errore); return }
        setDati(d)
        const assegno = d.metodi.find((m) => m.nome.toLowerCase() === 'assegno')
        setMetodoId(d.scadenza.fic_metodo_id ?? (d.scadenza.categoria === 'assegno' ? assegno?.id ?? null : null))
        const presenti = new Set(d.documenti.map((x) => x.fic_id))
        setQuote(Object.fromEntries(
          d.collegamenti.filter((c) => presenti.has(c.fic_documento_id)).map((c) => [c.fic_documento_id, c.importo]),
        ))
      })
      .catch(() => { if (!annullato) setErrore('Connessione interrotta: riprova') })
    return () => { annullato = true }
  }, [scadenza.id])

  const perId = useMemo(() => new Map((dati?.documenti ?? []).map((d) => [d.fic_id, d])), [dati])
  const selezionati = Object.keys(quote).map(Number)
  const visibili = useMemo(
    () => (dati?.documenti ?? [])
      .filter((d) => quote[d.fic_id] !== undefined || (d.residuo > 0 && fornitoreCorrisponde(ricerca, d.fornitore_nome)))
      .sort((a, b) => (a.prima_scadenza ?? a.data).localeCompare(b.prima_scadenza ?? b.data)),
    [dati, quote, ricerca],
  )

  const righeControllo = selezionati.map((id) => {
    const d = perId.get(id)
    return { fic_id: id, tipo: d?.tipo ?? 'fattura', numero: d?.numero ?? null, residuo: d?.residuo ?? 0, quota: quote[id] }
  })
  const controllo = controllaRipartizione(scadenza.importo, righeControllo)

  function cambiaSelezione(d: DocumentoCollegabile, spuntato: boolean) {
    const nuovi = spuntato ? [...selezionati, d.fic_id] : selezionati.filter((x) => x !== d.fic_id)
    const ripartiti = ripartisci(scadenza.importo, nuovi.map((id) => perId.get(id)!).filter(Boolean))
    setQuote(ripartiti)
    setTestoQuote({})
  }

  function cambiaQuota(id: number, testo: string) {
    setTestoQuote((t) => ({ ...t, [id]: testo }))
    const n = parseImporto(testo)
    if (n !== null) setQuote((q) => ({ ...q, [id]: n }))
  }

  function salva() {
    // Una differenza puo' essere giusta (acconto, sconto), ma va confermata a occhi aperti.
    if (controllo.livello === 'avviso' && !confirm(`${controllo.messaggi.join('\n')}\n\nSalvare comunque?`)) return
    startTransition(async () => {
      try {
        const r = await salvaCollegamentiScadenza({
          scadenzaId: scadenza.id,
          metodoId,
          quote: selezionati.map((id) => ({ fic_documento_id: id, tipo_documento: perId.get(id)!.tipo, importo: quote[id] })),
        })
        if (!r.ok) { toast.error(r.errore); return }
        toast.success('Collegamenti salvati')
        mostraEsitoFic(r.esito)
        router.refresh()
        onClose()
      } catch {
        toast.error('Connessione interrotta: riprova')
      }
    })
  }

  function scollegaSoloQui(ficId: number) {
    if (!confirm("Il collegamento viene tolto senza modificare Fatture in Cloud. Usalo solo se su FiC hai gia' sistemato a mano. Continuare?")) return
    startTransition(async () => {
      try {
        const r = await scollegaSenzaFic(scadenza.id, ficId)
        if (!r.ok) { toast.error(r.errore); return }
        toast.success('Collegamento tolto')
        router.refresh()
        onClose()
      } catch {
        toast.error('Connessione interrotta: riprova')
      }
    })
  }

  function riprova() {
    startTransition(async () => {
      try {
        const r = await riprovaScadenzaFic(scadenza.id)
        if (!r.ok) toast.error(r.errore)
        else mostraEsitoFic(r.esito)
        router.refresh()
        onClose()
      } catch {
        toast.error('Connessione interrotta: riprova')
      }
    })
  }

  const orfani = (dati?.collegamenti ?? []).filter((c) => !perId.has(c.fic_documento_id))
  const coloreBarra = controllo.livello === 'ok' ? 'bg-emerald-50 border-emerald-300' : controllo.livello === 'avviso' ? 'bg-amber-50 border-amber-300' : 'bg-rose-50 border-rose-300'
  const conProblemi = dati?.collegamenti.some((c) => c.stato_fic === 'da_allineare' || c.stato_fic === 'da_verificare')

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Fatture pagate da questa scadenza</DialogTitle>
        </DialogHeader>

        <div className="grid gap-1 text-sm sm:grid-cols-2">
          <div><span className="text-muted-foreground">Fornitore:</span> {scadenza.fornitore || '—'}</div>
          <div><span className="text-muted-foreground">Importo:</span> <strong>€ {formatEuro(scadenza.importo)}</strong></div>
          <div><span className="text-muted-foreground">Data:</span> {scadenza.data_scadenza ? formatData(scadenza.data_scadenza) : '—'}</div>
          <div>{scadenza.pagato ? <Badge variant="secondary">Pagata</Badge> : <Badge variant="outline">Non ancora pagata</Badge>}</div>
        </div>

        {errore && <p className="text-sm text-destructive">{errore}</p>}
        {!dati && !errore && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}

        {dati && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Metodo di pagamento su FiC</Label>
                <Select value={metodoId === null ? '' : String(metodoId)} onValueChange={(v) => setMetodoId(Number(v))}>
                  <SelectTrigger><SelectValue placeholder="Scegli il metodo" /></SelectTrigger>
                  <SelectContent>
                    {dati.metodi.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="fic-fornitore">Fornitore su FiC</Label>
                <Input id="fic-fornitore" value={ricerca} onChange={(e) => setRicerca(e.target.value)} placeholder="Cerca fornitore" />
              </div>
            </div>

            <div className="max-h-[45vh] overflow-y-auto rounded-md border">
              {visibili.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Nessuna fattura da pagare per questo fornitore.</p>
              ) : visibili.map((d) => {
                const spuntato = quote[d.fic_id] !== undefined
                const collegamento = dati.collegamenti.find((c) => c.fic_documento_id === d.fic_id)
                return (
                  <div key={d.fic_id} className="flex flex-wrap items-center gap-3 border-b p-2 text-sm last:border-b-0">
                    <Checkbox checked={spuntato} onCheckedChange={(v) => cambiaSelezione(d, v === true)} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {d.tipo === 'nota_credito' && <Badge variant="outline" className="mr-1">NC</Badge>}
                        {d.numero ?? '(senza numero)'} · {formatData(d.data)}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {d.fornitore_nome} · totale € {formatEuro(d.importo_lordo)} · residuo € {formatEuro(d.tipo === 'nota_credito' ? -d.residuo : d.residuo)}
                        {d.prima_scadenza ? ` · scade ${formatData(d.prima_scadenza)}` : ''}
                        {collegamento ? ` · ${STATO_LABEL[collegamento.stato_fic]}` : ''}
                      </div>
                      {collegamento?.stato_fic === 'da_verificare' && (
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-rose-700">
                          <span>{collegamento.messaggio_fic}</span>
                          <Button size="sm" variant="outline" onClick={() => scollegaSoloQui(d.fic_id)} disabled={pending}>
                            Sistemato a mano: scollega senza toccare FiC
                          </Button>
                        </div>
                      )}
                    </div>
                    {spuntato && (
                      <Input
                        className="w-28 text-right"
                        inputMode="decimal"
                        value={testoQuote[d.fic_id] ?? String(quote[d.fic_id]).replace('.', ',')}
                        onChange={(e) => cambiaQuota(d.fic_id, e.target.value)}
                        aria-label="Importo assegnato"
                      />
                    )}
                  </div>
                )
              })}
            </div>

            {orfani.length > 0 && (
              <div className="space-y-1 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm dark:bg-rose-950/30">
                <strong>Documenti collegati non più presenti su FiC</strong>
                {orfani.map((c) => (
                  <div key={c.fic_documento_id} className="flex flex-wrap items-center gap-2">
                    <span>#{c.fic_documento_id} · € {formatEuro(c.importo)} · {STATO_LABEL[c.stato_fic]}</span>
                    <Button size="sm" variant="outline" onClick={() => scollegaSoloQui(c.fic_documento_id)} disabled={pending}>
                      Scollega senza toccare FiC
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className={`rounded-md border p-3 text-sm ${coloreBarra}`}>
              <div className="flex flex-wrap gap-x-4">
                <span>Scadenza € {formatEuro(scadenza.importo)}</span>
                <span>Fatture € {formatEuro(controllo.totaleFatture)}</span>
                <span>Note di credito −€ {formatEuro(controllo.totaleNote)}</span>
                <strong>Differenza € {formatEuro(controllo.differenza)}</strong>
              </div>
              {controllo.messaggi.map((m) => <div key={m}>{m}</div>)}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {conProblemi && <Button variant="outline" onClick={riprova} disabled={pending}>Riprova su FiC</Button>}
              <Button variant="ghost" onClick={onClose} disabled={pending}>Annulla</Button>
              <Button
                onClick={salva}
                disabled={pending || controllo.livello === 'blocco'}
                className={controllo.livello === 'avviso' ? 'bg-amber-600 hover:bg-amber-700' : ''}
              >
                {pending ? 'Salvataggio…' : controllo.livello === 'avviso' ? 'Salva comunque' : 'Salva'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
