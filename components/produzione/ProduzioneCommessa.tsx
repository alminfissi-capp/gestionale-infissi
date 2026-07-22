'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Pencil, Trash2, AlertTriangle, Eye, Mail } from 'lucide-react'
import { pdf } from '@react-pdf/renderer'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import DialogOrdine from './DialogOrdine'
import DocumentiProduzione from './DocumentiProduzione'
import OrdinePDF from './OrdinePDF'
import type { IntestazionePDF } from './OrdinePDF'
import { formatEuro } from '@/lib/pricing'
import { deleteOrdine, setStatoOrdine } from '@/actions/produzione'
import { salvaPdfOrdine } from '@/actions/produzione-pdf'
import { getDocumentoSignedUrl } from '@/actions/produzione-documenti'
import { STATI_ORDINE } from '@/types/produzione'
import type { OrdineCompleto, StatoOrdine } from '@/types/produzione'
import type { StatoCommessa, DocumentoCommessa } from '@/types/commessa'

interface Props {
  commessa: { id: string; numero_commessa: string; cliente_nome: string; stato: StatoCommessa }
  ordini: OrdineCompleto[]
  fornitori: { id: string; nome: string; email: string | null }[]
  numeroProposto: string
  documenti: DocumentoCommessa[]
  intestazione: IntestazionePDF
}

export default function ProduzioneCommessa({ commessa, ordini, fornitori, numeroProposto, documenti, intestazione }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [inModifica, setInModifica] = useState<OrdineCompleto | null>(null)
  const emailFornitore = new Map(fornitori.map((f) => [f.id, f.email]))

  const inviaEmail = async (o: OrdineCompleto) => {
    if (!confirm('Inviare l\'ordine via email al fornitore?')) return
    try {
      const res = await fetch('/api/produzione/invia-ordine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordineId: o.id }),
      })
      const dati = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok) toast.error(dati.error ?? 'Errore invio')
      else {
        toast.success('Ordine inviato al fornitore')
        router.refresh()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore invio')
    }
  }

  const generaPdf = async (o: OrdineCompleto) => {
    // Apre subito la scheda (about:blank, fuori dallo scope del service worker)
    // nel gesto utente, per non farla bloccare dal popup blocker.
    const win = window.open('about:blank', '_blank')
    try {
      const nomeFile = `Ordine ${o.numero_ordine || o.id.slice(0, 8)}.pdf`
      const blob = await pdf(
        <OrdinePDF
          ordine={o}
          intestazione={intestazione}
          fornitoreNome={o.fornitore_nome ?? 'Fornitore non indicato'}
          numeroCommessa={commessa.numero_commessa}
          clienteNome={commessa.cliente_nome}
        />
      ).toBlob()

      const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
      const { path, error } = await salvaPdfOrdine(o.id, commessa.id, base64, nomeFile)
      if (error || !path) {
        win?.close()
        toast.error(error ?? 'Errore nella generazione del PDF')
        return
      }

      const url = await getDocumentoSignedUrl(path)
      if (url && win) win.location.href = url
      else {
        win?.close()
        if (url) window.open(url, '_blank')
      }
      router.refresh()
    } catch (e) {
      win?.close()
      toast.error(e instanceof Error ? e.message : 'Errore nella generazione del PDF')
    }
  }

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
                        onClick={() => generaPdf(o)} aria-label="Visualizza PDF">
                        <Eye className="h-4 w-4" />
                      </Button>
                      {o.fornitore_id && emailFornitore.get(o.fornitore_id) && o.pdf_path ? (
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                          onClick={() => inviaEmail(o)} aria-label="Invia email">
                          <Mail className="h-4 w-4" />
                        </Button>
                      ) : null}
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
