'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import DialogOrdine from './DialogOrdine'
import DocumentiProduzione from './DocumentiProduzione'
import { formatEuro } from '@/lib/pricing'
import { deleteOrdine, setStatoOrdine } from '@/actions/produzione'
import { STATI_ORDINE } from '@/types/produzione'
import type { OrdineCompleto, StatoOrdine } from '@/types/produzione'
import type { StatoCommessa, DocumentoCommessa } from '@/types/commessa'

interface Props {
  commessa: { id: string; numero_commessa: string; cliente_nome: string; stato: StatoCommessa }
  ordini: OrdineCompleto[]
  fornitori: { id: string; nome: string; email: string | null }[]
  numeroProposto: string
  documenti: DocumentoCommessa[]
}

export default function ProduzioneCommessa({ commessa, ordini, fornitori, numeroProposto, documenti }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [inModifica, setInModifica] = useState<OrdineCompleto | null>(null)

  const cambiaStato = async (id: string, stato: StatoOrdine) => {
    try {
      await setStatoOrdine(id, stato)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    }
  }

  const elimina = async (id: string) => {
    if (!confirm('Eliminare questo ordine?')) return
    try {
      await deleteOrdine(id)
      toast.success('Ordine eliminato')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/produzione">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Produzione
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {commessa.numero_commessa || 'Commessa'}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{commessa.cliente_nome}</p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Ordini fornitore</h2>
          <Button size="sm" className="gap-2" onClick={() => { setInModifica(null); setOpen(true) }}>
            <Plus className="h-4 w-4" /> Nuovo ordine
          </Button>
        </div>

        {ordini.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 border border-dashed rounded-lg p-6 text-center">
            Nessun ordine per questa commessa.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr className="text-left text-gray-500 dark:text-gray-400">
                  <th className="p-2 font-medium">Numero</th>
                  <th className="p-2 font-medium">Fornitore</th>
                  <th className="p-2 font-medium">Consegna</th>
                  <th className="p-2 font-medium">Stato</th>
                  <th className="p-2 font-medium text-right">Totale</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {ordini.map((o) => (
                  <tr key={o.id} className="border-t border-gray-200 dark:border-gray-800">
                    <td className="p-2">{o.numero_ordine || '—'}</td>
                    <td className="p-2">{o.fornitore_nome ?? '—'}</td>
                    <td className="p-2">
                      <span className={o.in_ritardo ? 'text-red-600 font-medium inline-flex items-center gap-1' : ''}>
                        {o.in_ritardo && <AlertTriangle className="h-3.5 w-3.5" />}
                        {o.data_consegna_prevista ?? '—'}
                      </span>
                    </td>
                    <td className="p-2">
                      <Select value={o.stato} onValueChange={(v) => cambiaStato(o.id, v as StatoOrdine)}>
                        <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATI_ORDINE.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2 text-right">{formatEuro(o.totale)}</td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                        onClick={() => { setInModifica(o); setOpen(true) }} aria-label="Modifica">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600"
                        onClick={() => elimina(o.id)} aria-label="Elimina">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DocumentiProduzione commessaId={commessa.id} documenti={documenti} />

      <DialogOrdine
        open={open}
        onOpenChange={setOpen}
        commessaId={commessa.id}
        ordine={inModifica}
        fornitori={fornitori}
        numeroProposto={numeroProposto}
      />
    </div>
  )
}
