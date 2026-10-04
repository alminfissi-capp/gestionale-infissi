'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePermissions } from '@/contexts/PermissionsContext'
import { formatEuro } from '@/lib/pricing'
import { formatData } from '@/lib/fic/formato'
import { filtraFatture, totaliFatture, type FiltroStato } from '@/lib/fic/filtri'
import { statoPagamento, oggiRoma, ETICHETTA_STATO_PAGAMENTO } from '@/lib/fic/stato-pagamento'
import BarraSincronizzazione from '@/components/fatture-fornitori/BarraSincronizzazione'
import DialogFatturaFornitore from '@/components/fatture-fornitori/DialogFatturaFornitore'
import BannerPagamentiFic from '@/components/fatture-fornitori/BannerPagamentiFic'
import type { CollegamentoFic, FatturaFornitore, PagamentoFattura, ProblemiFic, StatoPagamento } from '@/types/fatture-fornitori'

const VARIANTE_STATO: Record<StatoPagamento, 'secondary' | 'outline' | 'destructive' | 'default'> = {
  pagata: 'secondary',
  parziale: 'default',
  da_pagare: 'outline',
  scaduta: 'destructive',
}

export default function ElencoFattureFornitori({
  fatture,
  anni,
  anno,
  collegamento,
  pagamenti,
  problemi,
}: {
  fatture: FatturaFornitore[]
  anni: number[]
  anno: number
  collegamento: CollegamentoFic | null
  pagamenti: Record<number, PagamentoFattura[]>
  problemi: ProblemiFic
}) {
  const router = useRouter()
  const { canEdit } = usePermissions()
  const [ricerca, setRicerca] = useState('')
  const [stato, setStato] = useState<FiltroStato>('tutte')
  const [aperta, setAperta] = useState<FatturaFornitore | null>(null)
  const oggi = oggiRoma()

  const filtrate = useMemo(() => filtraFatture(fatture, ricerca, stato, oggi), [fatture, ricerca, stato, oggi])
  const totali = totaliFatture(filtrate)

  return (
    <div className="space-y-4">
      <BarraSincronizzazione collegamento={collegamento} puoSincronizzare={canEdit('fatture_fornitori')} />
      <BannerPagamentiFic problemi={problemi} puoRiprovare={canEdit('commesse')} />

      <div className="flex flex-wrap gap-2">
        <Select value={String(anno)} onValueChange={(v) => router.push(`/fatture-fornitori?scheda=fornitori&anno=${v}`)}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {anni.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          className="w-full sm:w-64"
          placeholder="Cerca fornitore o numero"
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
        />
        <Select value={stato} onValueChange={(v) => setStato(v as FiltroStato)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutte">Tutti gli stati</SelectItem>
            {(Object.keys(ETICHETTA_STATO_PAGAMENTO) as StatoPagamento[]).map((s) => (
              <SelectItem key={s} value={s}>{ETICHETTA_STATO_PAGAMENTO[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtrate.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {fatture.length === 0 ? `Nessuna fattura per il ${anno}.` : 'Nessuna fattura corrisponde ai filtri.'}
        </p>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden overflow-x-auto rounded-md border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Numero</TableHead>
                  <TableHead>Fornitore</TableHead>
                  <TableHead className="text-right">Imponibile</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="text-right">Totale</TableHead>
                  <TableHead>Prossima scadenza</TableHead>
                  <TableHead>Stato</TableHead>
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
                      <TableCell>{f.fornitore_nome}</TableCell>
                      <TableCell className="text-right">€ {formatEuro(f.importo_netto)}</TableCell>
                      <TableCell className="text-right">€ {formatEuro(f.importo_iva)}</TableCell>
                      <TableCell className="text-right font-medium">€ {formatEuro(f.importo_lordo)}</TableCell>
                      <TableCell>{f.prossima_scadenza ? formatData(f.prossima_scadenza) : '—'}</TableCell>
                      <TableCell>
                        <Badge variant={VARIANTE_STATO[s]}>{ETICHETTA_STATO_PAGAMENTO[s]}</Badge>
                        {(pagamenti[f.fic_id] ?? []).some((p) => !p.scadenza_pagata) && (
                          <span title="Pagamento programmato con una scadenza">
                            <CalendarClock className="ml-1 inline h-4 w-4 text-sky-600" />
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>{filtrate.length} documenti</TableCell>
                  <TableCell className="text-right">€ {formatEuro(totali.netto)}</TableCell>
                  <TableCell className="text-right">€ {formatEuro(totali.iva)}</TableCell>
                  <TableCell className="text-right">€ {formatEuro(totali.lordo)}</TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          {/* Mobile */}
          <div className="space-y-2 md:hidden">
            {filtrate.map((f) => {
              const s = statoPagamento(f.rate, oggi)
              return (
                <button
                  key={f.id}
                  type="button"
                  className="w-full rounded-md border p-3 text-left"
                  onClick={() => setAperta(f)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{f.fornitore_nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {f.tipo === 'nota_credito' ? 'NC ' : ''}{f.numero ?? '—'} · {formatData(f.data)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">€ {formatEuro(f.importo_lordo)}</div>
                      <Badge variant={VARIANTE_STATO[s]}>{ETICHETTA_STATO_PAGAMENTO[s]}</Badge>
                      {(pagamenti[f.fic_id] ?? []).some((p) => !p.scadenza_pagata) && (
                        <span title="Pagamento programmato con una scadenza">
                          <CalendarClock className="ml-1 inline h-4 w-4 text-sky-600" />
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              {filtrate.length} documenti · Totale <strong>€ {formatEuro(totali.lordo)}</strong>
            </div>
          </div>
        </>
      )}

      <DialogFatturaFornitore
        fattura={aperta}
        pagamenti={aperta ? pagamenti[aperta.fic_id] ?? [] : []}
        onClose={() => setAperta(null)}
      />
    </div>
  )
}
