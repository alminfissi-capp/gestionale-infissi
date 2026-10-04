'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileText } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePermissions } from '@/contexts/PermissionsContext'
import { formatEuro } from '@/lib/pricing'
import { formatData } from '@/lib/fic/formato'
import { statoPagamento, oggiRoma } from '@/lib/fic/stato-pagamento'
import { mostraEsitoFic } from '@/components/commesse/esito-fic'
import BarraSincronizzazione, { type StatoSincronizzazione } from '@/components/fatture-fornitori/BarraSincronizzazione'
import { getUrlPdfFatturaEmessa, type FatturaEmessaElenco } from '@/actions/fatture-emesse'
import { riprovaIncassi, type ProblemiIncassi } from '@/actions/fic-incassi'
import type { StatoPagamento } from '@/types/fatture-fornitori'

const ETICHETTA: Record<StatoPagamento, string> = {
  pagata: 'Incassata',
  parziale: 'Parziale',
  da_pagare: 'Da incassare',
  scaduta: 'Scaduta',
}
const VARIANTE: Record<StatoPagamento, 'secondary' | 'outline' | 'destructive' | 'default'> = {
  pagata: 'secondary',
  parziale: 'default',
  da_pagare: 'outline',
  scaduta: 'destructive',
}

type Filtro = StatoPagamento | 'tutte'
const cent = (v: number) => Math.round(v * 100) / 100

export default function ElencoFattureEmesse({
  fatture,
  anni,
  anno,
  sync,
  problemi,
}: {
  fatture: FatturaEmessaElenco[]
  anni: number[]
  anno: number
  sync: StatoSincronizzazione | null
  problemi: ProblemiIncassi
}) {
  const router = useRouter()
  const { canEdit } = usePermissions()
  const [ricerca, setRicerca] = useState('')
  const [stato, setStato] = useState<Filtro>('tutte')
  const [aperta, setAperta] = useState<FatturaEmessaElenco | null>(null)
  const oggi = oggiRoma()

  const filtrate = useMemo(() => {
    const q = ricerca.trim().toLowerCase()
    return fatture.filter((f) => {
      if (q && !f.cliente_nome.toLowerCase().includes(q) && !(f.numero ?? '').toLowerCase().includes(q)
        && !f.commesse.some((c) => c.numero_commessa.toLowerCase().includes(q))) return false
      if (stato !== 'tutte' && statoPagamento(f.rate, oggi) !== stato) return false
      return true
    })
  }, [fatture, ricerca, stato, oggi])
  const totale = cent(filtrate.reduce((s, f) => s + f.importo_lordo, 0))
  const netto = cent(filtrate.reduce((s, f) => s + f.importo_netto, 0))
  const iva = cent(filtrate.reduce((s, f) => s + f.importo_iva, 0))

  return (
    <div className="space-y-4">
      <BarraSincronizzazione collegamento={sync} puoSincronizzare={canEdit('fatture_fornitori')} tipo="clienti" />
      <BannerIncassi problemi={problemi} puoRiprovare={canEdit('commesse')} />

      <div className="flex flex-wrap gap-2">
        <Select value={String(anno)} onValueChange={(v) => router.push(`/fatture-fornitori?scheda=clienti&anno=${v}`)}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {anni.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          className="w-full sm:w-64"
          placeholder="Cerca cliente, numero o commessa"
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
        />
        <Select value={stato} onValueChange={(v) => setStato(v as Filtro)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutte">Tutti gli stati</SelectItem>
            {(Object.keys(ETICHETTA) as StatoPagamento[]).map((s) => (
              <SelectItem key={s} value={s}>{ETICHETTA[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtrate.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {fatture.length === 0 ? `Nessuna fattura emessa per il ${anno}: premi Sincronizza.` : 'Nessuna fattura corrisponde ai filtri.'}
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-md border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Numero</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Imponibile</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="text-right">Totale</TableHead>
                  <TableHead>Prossima scadenza</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Commesse</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrate.map((f) => {
                  const s = statoPagamento(f.rate, oggi)
                  return (
                    <TableRow key={f.id} className="cursor-pointer" onClick={() => setAperta(f)}>
                      <TableCell>{formatData(f.data)}</TableCell>
                      <TableCell>
                        {f.numero ?? '—'}
                        {f.tipo === 'nota_credito' && <Badge variant="outline" className="ml-2">NC</Badge>}
                      </TableCell>
                      <TableCell>{f.cliente_nome}</TableCell>
                      <TableCell className="text-right">€ {formatEuro(f.importo_netto)}</TableCell>
                      <TableCell className="text-right">€ {formatEuro(f.importo_iva)}</TableCell>
                      <TableCell className="text-right font-medium">€ {formatEuro(f.importo_lordo)}</TableCell>
                      <TableCell>{f.prossima_scadenza ? formatData(f.prossima_scadenza) : '—'}</TableCell>
                      <TableCell><Badge variant={VARIANTE[s]}>{ETICHETTA[s]}</Badge></TableCell>
                      <TableCell className="text-xs">
                        {f.commesse.length === 0
                          ? <span className="text-muted-foreground">—</span>
                          : f.commesse.map((c) => `${c.numero_commessa} (€ ${formatEuro(c.quota)})`).join(', ')}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>{filtrate.length} documenti</TableCell>
                  <TableCell className="text-right">€ {formatEuro(netto)}</TableCell>
                  <TableCell className="text-right">€ {formatEuro(iva)}</TableCell>
                  <TableCell className="text-right">€ {formatEuro(totale)}</TableCell>
                  <TableCell colSpan={3} />
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          <div className="space-y-2 md:hidden">
            {filtrate.map((f) => {
              const s = statoPagamento(f.rate, oggi)
              return (
                <button key={f.id} type="button" className="w-full rounded-md border p-3 text-left" onClick={() => setAperta(f)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{f.cliente_nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {f.tipo === 'nota_credito' ? 'NC ' : ''}{f.numero ?? '—'} · {formatData(f.data)}
                        {f.commesse.length > 0 && ` · ${f.commesse.map((c) => c.numero_commessa).join(', ')}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">€ {formatEuro(f.importo_lordo)}</div>
                      <Badge variant={VARIANTE[s]}>{ETICHETTA[s]}</Badge>
                    </div>
                  </div>
                </button>
              )
            })}
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              {filtrate.length} documenti · Totale <strong>€ {formatEuro(totale)}</strong>
            </div>
          </div>
        </>
      )}

      <DettaglioFatturaEmessa fattura={aperta} onClose={() => setAperta(null)} />
    </div>
  )
}

function BannerIncassi({ problemi, puoRiprovare }: { problemi: ProblemiIncassi; puoRiprovare: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  if (problemi.elenco.length === 0) return null
  const daRiprovare = problemi.elenco.some((p) => p.stato_fic !== 'da_verificare')

  function riprova() {
    startTransition(async () => {
      try {
        const r = await riprovaIncassi()
        if (!r.ok) toast.error(r.errore)
        else mostraEsitoFic(r.esito)
      } catch {
        toast.error('Connessione interrotta: riprova')
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-2 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm dark:bg-rose-950/30">
      <div className="flex flex-wrap items-center gap-3">
        <strong>{problemi.elenco.length} incassi non allineati su FiC</strong>
        {puoRiprovare && daRiprovare && (
          <Button size="sm" variant="outline" onClick={riprova} disabled={pending}>
            {pending ? 'Riprovo…' : 'Riprova tutti'}
          </Button>
        )}
      </div>
      <ul className="space-y-1">
        {problemi.elenco.map((p, i) => (
          <li key={`${p.acconto_id}-${i}`}>
            Commessa <strong>{p.numero_commessa}</strong>, incasso del {p.data ? formatData(p.data) : '—'} (€ {formatEuro(p.importo)})
            {' — '}{p.stato_fic === 'da_verificare' ? 'da verificare: ' : 'da allineare: '}{p.messaggio_fic ?? ''}
          </li>
        ))}
      </ul>
    </div>
  )
}

function DettaglioFatturaEmessa({ fattura, onClose }: { fattura: FatturaEmessaElenco | null; onClose: () => void }) {
  const [apertura, setApertura] = useState(false)

  async function apriPdf() {
    if (!fattura) return
    // Aperta dentro il gesto del clic: dopo l'await i browser mobili la bloccherebbero.
    const finestra = window.open('', '_blank')
    setApertura(true)
    try {
      const r = await getUrlPdfFatturaEmessa(fattura.fic_id)
      if (r.url) {
        if (finestra) finestra.location.href = r.url
        else window.location.href = r.url
      } else {
        finestra?.close()
        toast.error(r.errore ?? 'PDF non disponibile')
      }
    } catch {
      finestra?.close()
      toast.error('Connessione interrotta: riprova fra poco')
    } finally {
      setApertura(false)
    }
  }

  return (
    <Dialog open={fattura !== null} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-2xl xl:max-w-3xl">
        {fattura && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {fattura.tipo === 'nota_credito' ? 'Nota di credito' : 'Fattura'} {fattura.numero ?? '(senza numero)'}
                <span className="font-normal text-muted-foreground">del {formatData(fattura.data)}</span>
                {fattura.elettronica && <Badge variant="secondary">Elettronica</Badge>}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <div className="text-muted-foreground">Cliente</div>
                <div className="font-medium">{fattura.cliente_nome}</div>
                {fattura.cliente_piva && <div>P.IVA / CF {fattura.cliente_piva}</div>}
              </div>
              <div>
                <div className="text-muted-foreground">Commesse collegate</div>
                {fattura.commesse.length === 0
                  ? <div>—</div>
                  : fattura.commesse.map((c) => <div key={c.commessa_id}>{c.numero_commessa}: € {formatEuro(c.quota)}</div>)}
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/50 p-3 sm:col-span-2 sm:grid-cols-4">
                <div><div className="text-muted-foreground">Imponibile</div>€ {formatEuro(fattura.importo_netto)}</div>
                <div><div className="text-muted-foreground">IVA</div>€ {formatEuro(fattura.importo_iva)}</div>
                <div><div className="text-muted-foreground">Ritenuta</div>€ {formatEuro(fattura.ritenuta)}</div>
                <div><div className="text-muted-foreground">Da incassare</div><strong>€ {formatEuro(fattura.importo_lordo)}</strong></div>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scadenza</TableHead>
                  <TableHead className="text-right">Importo</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Conto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fattura.rate.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.scadenza ? formatData(r.scadenza) : '—'}</TableCell>
                    <TableCell className="text-right">€ {formatEuro(r.importo)}</TableCell>
                    <TableCell>{r.stato === 'pagata' ? `Incassata${r.pagata_il ? ` il ${formatData(r.pagata_il)}` : ''}` : 'Da incassare'}</TableCell>
                    <TableCell>{r.conto_nome ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Button variant="outline" onClick={apriPdf} disabled={apertura}>
              <FileText /> {apertura ? 'Apertura…' : 'Apri PDF'}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
