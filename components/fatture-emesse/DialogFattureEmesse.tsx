'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatEuro } from '@/lib/pricing'
import { formatData } from '@/lib/fic/formato'
import { fornitoreCorrisponde, parseImporto } from '@/lib/fic/pagamenti'
import { quotaLibera } from '@/lib/fic/incassi'
import { mostraEsitoFic } from '@/components/commesse/esito-fic'
import {
  confermaStorico, getDatiFattureCommessa, getPropostaStorico, salvaFattureCommessa, type PropostaStorico,
} from '@/actions/fic-incassi'
import type { DatiFattureCommessa, FatturaCollegabile } from '@/types/fatture-emesse'

const cent = (v: number) => Math.round(v * 100) / 100
const METODO: Record<string, string> = { bonifico: 'Bonifico', contanti: 'Contanti', riba: 'Ri.Ba.', altro: 'Altro' }

/** Proposta di quota: la parte della fattura non ancora assegnata ad altre commesse, senza segno. */
const proposta = (f: FatturaCollegabile) => Math.abs(quotaLibera(f.importo_lordo, f.altre.map((a) => a.quota)))

export default function DialogFattureEmesse({
  open, onOpenChange, commessaId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  commessaId: string
}) {
  const router = useRouter()
  const [dati, setDati] = useState<DatiFattureCommessa | null>(null)
  const [caricamento, setCaricamento] = useState(false)
  const [cliente, setCliente] = useState('')
  const [periodo, setPeriodo] = useState<{ dal: string; al: string } | null>(null)
  /** fic_id → quota scritta a mano (testo, positiva anche per le note di credito). */
  const [scelte, setScelte] = useState<Record<number, string>>({})
  const [salvataggio, setSalvataggio] = useState(false)
  const [storico, setStorico] = useState<PropostaStorico | null>(null)

  const carica = useCallback(async (p?: { dal: string; al: string }) => {
    setCaricamento(true)
    try {
      const r = await getDatiFattureCommessa(commessaId, p)
      if (!r.ok) { toast.error(r.errore); return }
      setDati(r.dati)
      setPeriodo(r.dati.periodo)
      return r.dati
    } catch {
      toast.error('Connessione interrotta: riprova')
    } finally {
      setCaricamento(false)
    }
  }, [commessaId])

  useEffect(() => {
    if (!open) return
    let annullato = false
    void (async () => {
      const d = await carica()
      if (annullato || !d) return
      setCliente(d.commessa.cliente)
      setScelte(Object.fromEntries(d.collegamenti.map((c) => [c.fic_documento_id, formatEuro(Math.abs(c.quota))])))
      setStorico(null)
    })()
    return () => { annullato = true }
  }, [open, carica])

  const visibili = useMemo(() => {
    if (!dati) return []
    return dati.fatture.filter((f) => scelte[f.fic_id] !== undefined || fornitoreCorrisponde(cliente, f.cliente_nome))
  }, [dati, cliente, scelte])

  const quoteValide = Object.entries(scelte).map(([id, testo]) => {
    const f = dati?.fatture.find((x) => x.fic_id === Number(id))
    const v = parseImporto(testo)
    return { f, v: v === null ? null : Math.abs(v) }
  })
  const collegato = cent(quoteValide.reduce((s, q) => s + (q.f && q.v ? (q.f.tipo === 'nota_credito' ? -q.v : q.v) : 0), 0))
  const errate = quoteValide.filter((q) => !q.f || !q.v)
  const oltre = quoteValide.filter((q) => q.f && q.v && q.v > proposta(q.f) + 0.01)

  function attiva(f: FatturaCollegabile, si: boolean) {
    setScelte((s) => {
      const nuove = { ...s }
      if (si) nuove[f.fic_id] = formatEuro(proposta(f))
      else delete nuove[f.fic_id]
      return nuove
    })
  }

  async function salva() {
    if (!dati) return
    if (errate.length) { toast.error('Controlla le quote: ce n\'è una vuota o non valida'); return }
    if (oltre.length && !window.confirm('Una quota supera la parte della fattura ancora libera. Salvare lo stesso?')) return
    setSalvataggio(true)
    try {
      const r = await salvaFattureCommessa(
        commessaId,
        quoteValide.map((q) => ({ fic_documento_id: q.f!.fic_id, quota: q.v! })),
      )
      if (!r.ok) { toast.error(r.errore); return }
      toast.success('Fatture collegate alla commessa')
      router.refresh()
      if (r.incassi_scollegati > 0) await apriStorico()
      else onOpenChange(false)
    } catch {
      toast.error('Connessione interrotta: riprova')
    } finally {
      setSalvataggio(false)
    }
  }

  async function apriStorico() {
    const r = await getPropostaStorico(commessaId)
    if (!r.ok) { toast.error(r.errore); return }
    if (r.proposta.length === 0) {
      toast.info('Nessun incasso da abbinare: le fatture collegate risultano già incassate su FiC')
      onOpenChange(false)
      return
    }
    setStorico(r.proposta)
  }

  async function confermaLoStorico() {
    if (!storico) return
    setSalvataggio(true)
    try {
      const r = await confermaStorico(commessaId, storico.map((p) => ({ acconto_id: p.acconto_id, quote: p.quote })))
      if (!r.ok) { toast.error(r.errore); return }
      mostraEsitoFic(r.esito)
      router.refresh()
      onOpenChange(false)
    } catch {
      toast.error('Connessione interrotta: ricarica la pagina per vedere l\'esito')
    } finally {
      setSalvataggio(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94vh] w-[96vw] flex-col sm:max-w-[96vw] xl:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Fatture emesse {dati ? `— ${dati.commessa.nome}` : ''}</DialogTitle>
          <DialogDescription>
            {storico
              ? 'Incassi già registrati: ecco come verrebbero segnati su Fatture in Cloud, con le loro date.'
              : 'Scegli le fatture di Fatture in Cloud che appartengono a questa commessa e per quanto.'}
          </DialogDescription>
        </DialogHeader>

        {!dati ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{caricamento ? 'Caricamento…' : ''}</p>
        ) : storico ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-1">Incasso</th><th>Metodo</th><th className="text-right">Importo</th><th className="pl-4">Fatture pagate</th></tr>
              </thead>
              <tbody>
                {storico.map((p) => (
                  <tr key={p.acconto_id} className="border-t align-top">
                    <td className="py-2">{formatData(p.data)}</td>
                    <td>{METODO[p.metodo] ?? p.metodo}</td>
                    <td className="text-right">€ {formatEuro(p.importo)}</td>
                    <td className="pl-4">
                      {p.quote.map((q) => (
                        <div key={q.fic_documento_id}>n. {q.numero ?? '—'} del {formatData(q.data_fattura)}: € {formatEuro(q.importo)}</div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvataggio}>Non ora</Button>
              <Button onClick={confermaLoStorico} disabled={salvataggio}>
                {salvataggio ? 'Scrittura su FiC…' : 'Conferma e scrivi su FiC'}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {dati.collegamenti.length > 0 && dati.incassi_scollegati > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm dark:bg-amber-950/30">
                {dati.incassi_scollegati === 1 ? '1 incasso non è collegato' : `${dati.incassi_scollegati} incassi non sono collegati`} alle fatture.
                <Button size="sm" variant="outline" onClick={apriStorico}>Abbina incassi</Button>
              </div>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="fe-cliente">Cliente</Label>
                <Input id="fe-cliente" className="w-64" value={cliente} onChange={(e) => setCliente(e.target.value)} />
              </div>
              {periodo && (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="fe-dal">Dal</Label>
                    <Input id="fe-dal" type="date" className="w-40" value={periodo.dal} onChange={(e) => setPeriodo({ ...periodo, dal: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="fe-al">Al</Label>
                    <Input id="fe-al" type="date" className="w-40" value={periodo.al} onChange={(e) => setPeriodo({ ...periodo, al: e.target.value })} />
                  </div>
                  <Button variant="outline" onClick={() => carica(periodo)} disabled={caricamento}>Aggiorna periodo</Button>
                </>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
              {visibili.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Nessuna fattura di questo cliente nel periodo. Prova a cambiare il nome o le date, o sincronizza la scheda Clienti in Fatture.
                </p>
              ) : (
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col className="w-10" /><col className="w-[16%]" /><col /><col className="w-[13%]" /><col className="w-[13%]" /><col className="w-[18%]" /><col className="w-[14%]" />
                  </colgroup>
                  <thead className="sticky top-0 bg-background text-left text-muted-foreground">
                    <tr className="border-b">
                      <th /><th className="py-2">Fattura</th><th>Cliente</th>
                      <th className="text-right">Totale</th><th className="text-right">Da incassare</th>
                      <th className="pl-3">Su altre commesse</th><th className="pr-2 text-right">Quota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibili.map((f) => {
                      const scelta = scelte[f.fic_id] !== undefined
                      return (
                        <tr key={f.fic_id} className={`border-b ${scelta ? 'bg-sky-50 dark:bg-sky-950/40' : ''}`}>
                          <td className="py-2 pl-2">
                            <Checkbox checked={scelta} onCheckedChange={(v) => attiva(f, v === true)} aria-label={`Collega la fattura ${f.numero ?? ''}`} />
                          </td>
                          <td>
                            <div className="font-medium">
                              {f.numero ?? '—'} {f.tipo === 'nota_credito' && <Badge variant="outline">NC</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground">{formatData(f.data)}</div>
                          </td>
                          <td className="truncate" title={f.cliente_nome}>{f.cliente_nome}</td>
                          <td className="text-right">
                            € {formatEuro(f.importo_lordo)}
                            {f.ritenuta > 0 && <div className="text-xs text-muted-foreground">rit. € {formatEuro(f.ritenuta)}</div>}
                          </td>
                          <td className="text-right">€ {formatEuro(f.da_incassare)}</td>
                          <td className="pl-3 text-xs">
                            {f.altre.length === 0 ? '—' : f.altre.map((a) => <div key={a.commessa_id}>€ {formatEuro(a.quota)} su {a.commessa_nome}</div>)}
                          </td>
                          <td className="pr-2 text-right">
                            {scelta && (
                              <Input
                                className="ml-auto h-8 w-28 text-right"
                                inputMode="decimal"
                                value={scelte[f.fic_id]}
                                onChange={(e) => setScelte((s) => ({ ...s, [f.fic_id]: e.target.value }))}
                                aria-label="Quota per questa commessa"
                              />
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/50 p-3 text-sm">
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                <span>Totale commessa <strong>€ {formatEuro(dati.commessa.totale)}</strong></span>
                <span>Fatture collegate <strong>€ {formatEuro(collegato)}</strong></span>
                <span>Mancano <strong>€ {formatEuro(cent(dati.commessa.totale - collegato))}</strong></span>
                {oltre.length > 0 && <span className="text-amber-700 dark:text-amber-400">Una quota supera la parte libera della fattura</span>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvataggio}>Annulla</Button>
                <Button onClick={salva} disabled={salvataggio}>{salvataggio ? 'Salvataggio…' : 'Salva'}</Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
