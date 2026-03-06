'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Pencil, Printer, Trash2, ChevronLeft, Loader2, TrendingUp, Truck, ShoppingCart, BarChart2 } from 'lucide-react'
import { deletePreventivo } from '@/actions/preventivi'
import { formatEuro } from '@/lib/pricing'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { PreventivoCompleto, StatoPreventivo } from '@/types/preventivo'

const STATO_CONFIG: Record<
  StatoPreventivo,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; color: string }
> = {
  bozza:     { label: 'Bozza',     variant: 'secondary',    color: 'text-gray-600' },
  inviato:   { label: 'Inviato',   variant: 'default',      color: 'text-blue-700' },
  accettato: { label: 'Accettato', variant: 'default',      color: 'text-green-700' },
  rifiutato: { label: 'Rifiutato', variant: 'destructive',  color: 'text-red-700' },
  scaduto:   { label: 'Scaduto',   variant: 'outline',      color: 'text-gray-500' },
}

interface Props {
  preventivo: PreventivoCompleto
}

export default function DettaglioPreventivo({ preventivo: p }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const cfg = STATO_CONFIG[p.stato]
  const s = p.cliente_snapshot
  const nomeCliente = [s.cognome, s.nome].filter(Boolean).join(' ') || s.telefono || s.email || '—'

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await deletePreventivo(p.id)
        toast.success('Preventivo eliminato')
        router.push('/preventivi')
      } catch {
        toast.error('Errore durante l\'eliminazione')
      }
    })
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Button variant="ghost" size="sm" asChild className="-ml-2">
              <Link href="/preventivi">
                <ChevronLeft className="h-4 w-4" />
                Preventivi
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              {p.numero ? `Preventivo ${p.numero}` : 'Preventivo senza numero'}
            </h1>
            <Badge variant={cfg.variant}>{cfg.label}</Badge>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {new Date(p.created_at).toLocaleDateString('it-IT', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}
            {p.updated_at !== p.created_at && (
              <span className="ml-2 text-gray-400">
                · aggiornato {new Date(p.updated_at).toLocaleDateString('it-IT')}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/preventivi/${p.id}/stampa`}>
              <Printer className="h-4 w-4 mr-1" />
              Stampa
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className="text-amber-700 border-amber-300 hover:bg-amber-50">
            <Link href={`/preventivi/${p.id}/stampa-calcoli`}>
              <BarChart2 className="h-4 w-4 mr-1" />
              Stampa calcoli
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/preventivi/${p.id}/modifica`}>
              <Pencil className="h-4 w-4 mr-1" />
              Modifica
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500 hover:text-red-700 hover:bg-red-50"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Cliente */}
      <div className="bg-white rounded-lg border p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Cliente</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
          <div>
            <span className="text-gray-500">Nome: </span>
            <span className="font-medium">{nomeCliente}</span>
          </div>
          {s.telefono && (
            <div>
              <span className="text-gray-500">Telefono: </span>
              <span>{s.telefono}</span>
            </div>
          )}
          {s.email && (
            <div>
              <span className="text-gray-500">Email: </span>
              <span>{s.email}</span>
            </div>
          )}
          {s.indirizzo && (
            <div className="col-span-2">
              <span className="text-gray-500">Indirizzo: </span>
              <span>{s.indirizzo}</span>
            </div>
          )}
          {s.cantiere && (
            <div>
              <span className="text-gray-500">Cantiere: </span>
              <span>{s.cantiere}</span>
            </div>
          )}
          {s.cf_piva && (
            <div>
              <span className="text-gray-500">CF/P.IVA: </span>
              <span className="font-mono">{s.cf_piva}</span>
            </div>
          )}
        </div>
      </div>

      {/* Articoli */}
      <div className="bg-white rounded-lg border overflow-x-auto">
        <div className="p-4 border-b">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Articoli ({p.articoli.length})
          </p>
        </div>
        {p.articoli.length === 0 ? (
          <p className="text-sm text-gray-400 italic text-center py-8">Nessun articolo</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Prodotto</TableHead>
                <TableHead className="whitespace-nowrap">Dim. (mm)</TableHead>
                <TableHead>Finitura</TableHead>
                <TableHead className="text-center">Qtà</TableHead>
                <TableHead className="text-right whitespace-nowrap">€ Unit.</TableHead>
                <TableHead className="text-right whitespace-nowrap">Sconto</TableHead>
                <TableHead className="text-right whitespace-nowrap">€ Totale</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.articoli.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="flex items-start gap-2">
                      {a.immagine_url && (
                        <Image
                          src={a.immagine_url}
                          alt={a.tipologia}
                          width={48}
                          height={36}
                          className={`rounded border shrink-0 mt-0.5 ${a.tipo === 'libera' ? 'object-contain bg-gray-50' : 'object-cover'}`}
                          unoptimized={a.tipo === 'libera'}
                        />
                      )}
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-medium text-sm">{a.tipologia}</p>
                          {a.tipo === 'libera' && (
                            <Badge variant="outline" className="text-[10px] text-gray-500 border-gray-300">
                              voce libera
                            </Badge>
                          )}
                        </div>
                        {a.categoria_nome && (
                          <p className="text-xs text-gray-400">{a.categoria_nome}</p>
                        )}
                        {a.misura_arrotondata && (
                          <Badge variant="outline" className="text-[10px] mt-0.5 text-amber-600 border-amber-300">
                            arrotondata
                          </Badge>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap text-gray-500">
                    {a.tipo === 'libera' ? '—' : (
                      <>
                        {a.larghezza_mm}×{a.altezza_mm}
                        {a.misura_arrotondata && (
                          <span className="text-gray-400 text-xs ml-1">
                            ({a.larghezza_listino_mm}×{a.altezza_listino_mm})
                          </span>
                        )}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {a.tipo === 'libera' ? '—' : (
                      <>
                        {a.finitura_nome ?? '—'}
                        {a.finitura_nome && (
                          <span className="text-xs text-gray-400 ml-1">+{a.finitura_aumento}%</span>
                        )}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-sm">{a.quantita}</TableCell>
                  <TableCell className="text-right text-sm whitespace-nowrap">
                    € {formatEuro(a.prezzo_unitario)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-gray-500">
                    {a.sconto_articolo > 0 ? `${a.sconto_articolo}%` : '—'}
                  </TableCell>
                  <TableCell className="text-right font-medium text-sm whitespace-nowrap">
                    € {formatEuro(a.prezzo_totale_riga)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Totali + Note */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Note */}
        {p.note && (
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Note</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{p.note}</p>
          </div>
        )}

        {/* Riepilogo economico */}
        <div className="bg-white rounded-lg border p-4 md:ml-auto md:min-w-[300px]">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Riepilogo</p>
          <div className="space-y-1.5 text-sm">
            {p.sconto_globale > 0 && (
              <>
                <div className="flex justify-between text-gray-600">
                  <span>Subtotale ({p.totale_pezzi} pz)</span>
                  <span>€ {formatEuro(p.subtotale)}</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>Sconto globale {p.sconto_globale}%</span>
                  <span>− € {formatEuro(p.importo_sconto)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-gray-600">
              <span>Totale articoli{p.sconto_globale === 0 ? ` (${p.totale_pezzi} pz)` : ''}</span>
              <span>€ {formatEuro(p.totale_articoli)}</span>
            </div>
            {p.riepilogo_iva.map((r) => (
              <div key={r.aliquota} className="flex justify-between text-gray-600">
                <span>IVA {r.aliquota}% (su € {formatEuro(r.imponibile)})</span>
                <span>€ {formatEuro(r.iva)}</span>
              </div>
            ))}
            {p.iva_totale > 0 && p.riepilogo_iva.length > 1 && (
              <div className="flex justify-between text-gray-600">
                <span>Totale IVA</span>
                <span>€ {formatEuro(p.iva_totale)}</span>
              </div>
            )}
            {p.modalita_trasporto === 'separato' ? (
              <div className="flex justify-between text-gray-600">
                <span>Spese trasporto</span>
                <span>€ {formatEuro(p.spese_trasporto)}</span>
              </div>
            ) : p.spese_trasporto > 0 && (
              <div className="flex justify-between text-gray-400 text-xs italic">
                <span>Trasporto incluso nel totale</span>
                <span>€ {formatEuro(p.spese_trasporto)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t pt-2 mt-2">
              <span>Totale finale</span>
              <span>€ {formatEuro(p.totale_finale)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Report Interno — solo uso gestionale, non compare in stampa */}
      {p.totale_costi_acquisto > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-4">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Report interno — solo uso gestionale
          </p>

          {/* Tabella costi acquisto per articolo */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-amber-700 border-b border-amber-200">
                  <th className="text-left pb-1.5 font-semibold">Articolo</th>
                  <th className="text-center pb-1.5 font-semibold w-12">Qtà</th>
                  <th className="text-right pb-1.5 font-semibold whitespace-nowrap">C. Acq. Unit.</th>
                  <th className="text-right pb-1.5 font-semibold whitespace-nowrap">Posa Unit.</th>
                  <th className="text-right pb-1.5 font-semibold whitespace-nowrap">Costo Tot.</th>
                  <th className="text-right pb-1.5 font-semibold whitespace-nowrap">Ricavo</th>
                </tr>
              </thead>
              <tbody>
                {p.articoli.map((a) => {
                  const costoTotRiga = (a.costo_acquisto_unitario + a.costo_posa) * a.quantita
                  const margineRiga = a.prezzo_totale_riga - costoTotRiga
                  return (
                    <tr key={a.id} className="border-b border-amber-100">
                      <td className="py-1.5 pr-2">
                        <p className="font-medium text-gray-800">{a.tipologia}</p>
                        {a.categoria_nome && (
                          <p className="text-xs text-gray-400">{a.categoria_nome}</p>
                        )}
                      </td>
                      <td className="py-1.5 text-center text-gray-600">{a.quantita}</td>
                      <td className="py-1.5 text-right text-gray-600 tabular-nums">
                        {a.costo_acquisto_unitario > 0 ? `€ ${formatEuro(a.costo_acquisto_unitario)}` : '—'}
                      </td>
                      <td className="py-1.5 text-right text-gray-600 tabular-nums">
                        {a.costo_posa > 0 ? `€ ${formatEuro(a.costo_posa)}` : '—'}
                      </td>
                      <td className="py-1.5 text-right text-gray-700 font-medium tabular-nums">
                        {costoTotRiga > 0 ? `€ ${formatEuro(costoTotRiga)}` : '—'}
                      </td>
                      <td className={`py-1.5 text-right font-medium tabular-nums ${margineRiga >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        € {formatEuro(margineRiga)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Riepilogo economico interno */}
          {(() => {
            const totalePosa = p.articoli.reduce((sum, a) => sum + a.costo_posa * a.quantita, 0)
            const utile = p.totale_articoli - p.totale_costi_acquisto - totalePosa - p.spese_trasporto
            return (
              <div className="border-t border-amber-200 pt-3 space-y-1.5 text-sm ml-auto max-w-xs">
                <div className="flex justify-between text-gray-600">
                  <span className="flex items-center gap-1"><ShoppingCart className="h-3.5 w-3.5" />Totale acquisto fornitore</span>
                  <span className="tabular-nums">€ {formatEuro(p.totale_costi_acquisto)}</span>
                </div>
                {totalePosa > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span className="flex items-center gap-1 pl-1">↳ Costi posa</span>
                    <span className="tabular-nums">€ {formatEuro(totalePosa)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span className="flex items-center gap-1"><Truck className="h-3.5 w-3.5" />Spese trasporto</span>
                  <span className="tabular-nums">€ {formatEuro(p.spese_trasporto)}</span>
                </div>
                <div className="flex justify-between text-gray-500 text-xs">
                  <span>Ricavo netto (IVA esclusa)</span>
                  <span className="tabular-nums">€ {formatEuro(p.totale_articoli)}</span>
                </div>
                <div className={`flex justify-between font-bold text-base border-t border-amber-300 pt-2 mt-1 ${utile >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  <span>Utile lordo</span>
                  <span className="tabular-nums">€ {formatEuro(utile)}</span>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina preventivo</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è irreversibile. Il preventivo e tutti i suoi articoli verranno eliminati definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Elimina'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
