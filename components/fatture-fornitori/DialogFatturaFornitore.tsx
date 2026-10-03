'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getUrlPdfFatturaFornitore } from '@/actions/fatture-in-cloud'
import { formatEuro } from '@/lib/pricing'
import { formatData } from '@/lib/fic/formato'
import type { FatturaFornitore, PagamentoFattura } from '@/types/fatture-fornitori'

export default function DialogFatturaFornitore({
  fattura,
  pagamenti,
  onClose,
}: {
  fattura: FatturaFornitore | null
  pagamenti: PagamentoFattura[]
  onClose: () => void
}) {
  const [apertura, setApertura] = useState(false)

  async function apriPdf() {
    if (!fattura) return
    // La finestra si apre subito, dentro il gesto del clic: aperta dopo l'await
    // i browser mobili la bloccherebbero come popup.
    const finestra = window.open('', '_blank')
    setApertura(true)
    try {
      const r = await getUrlPdfFatturaFornitore(fattura.id)
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
      <DialogContent className="max-w-2xl">
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
                <div className="text-muted-foreground">Fornitore</div>
                <div className="font-medium">{fattura.fornitore_nome}</div>
                {fattura.fornitore_piva && <div>P.IVA {fattura.fornitore_piva}</div>}
              </div>
              <div>
                <div className="text-muted-foreground">Categoria</div>
                <div>{fattura.categoria ?? '—'}</div>
              </div>
              {fattura.descrizione && (
                <div className="sm:col-span-2">
                  <div className="text-muted-foreground">Descrizione</div>
                  <div className="whitespace-pre-wrap">{fattura.descrizione}</div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/50 p-3 sm:col-span-2">
                <div><div className="text-muted-foreground">Imponibile</div>€ {formatEuro(fattura.importo_netto)}</div>
                <div><div className="text-muted-foreground">IVA</div>€ {formatEuro(fattura.importo_iva)}</div>
                <div><div className="text-muted-foreground">Totale</div><strong>€ {formatEuro(fattura.importo_lordo)}</strong></div>
                {(fattura.ritenuta !== 0 || fattura.altra_ritenuta !== 0) && (
                  <div className="col-span-3 text-muted-foreground">
                    Ritenute: € {formatEuro(fattura.ritenuta + fattura.altra_ritenuta)}
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium">Rate</h3>
              {fattura.rate.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessuna rata su Fatture in Cloud.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Scadenza</TableHead>
                        <TableHead className="text-right">Importo</TableHead>
                        <TableHead>Stato</TableHead>
                        <TableHead>Pagata il</TableHead>
                        <TableHead>Conto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fattura.rate.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>{r.scadenza ? formatData(r.scadenza) : '—'}</TableCell>
                          <TableCell className="text-right">€ {formatEuro(r.importo)}</TableCell>
                          <TableCell>
                            {r.stato === 'pagata'
                              ? <Badge variant="secondary">Pagata</Badge>
                              : <Badge variant="outline">Da pagare</Badge>}
                          </TableCell>
                          <TableCell>{r.pagata_il ? formatData(r.pagata_il) : '—'}</TableCell>
                          <TableCell>{r.conto_nome ?? '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {pagamenti.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium">Pagata con</h3>
                <ul className="space-y-1 text-sm">
                  {pagamenti.map((p) => (
                    <li key={p.scadenza_id} className="flex flex-wrap items-center gap-2">
                      <Link href={`/commesse/${p.gruppo_id}`} className="underline">
                        {p.descrizione || p.fornitore || 'Scadenza'}
                      </Link>
                      <span>{p.data_scadenza ? formatData(p.data_scadenza) : 'senza data'}</span>
                      <span>€ {formatEuro(p.importo)}</span>
                      {!p.scadenza_pagata
                        ? <Badge variant="outline">Programmato</Badge>
                        : p.stato_fic === 'scritto'
                          ? <Badge variant="secondary">Su FiC</Badge>
                          : (
                            <Badge variant="destructive" title={p.messaggio_fic ?? ''}>
                              {p.stato_fic === 'da_verificare' ? 'Da verificare' : 'Da allineare'}
                            </Badge>
                          )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {fattura.ha_allegato && (
              <div className="flex justify-end">
                <Button variant="outline" onClick={apriPdf} disabled={apertura}>
                  <FileText /> {apertura ? 'Apertura…' : 'Apri PDF'}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
