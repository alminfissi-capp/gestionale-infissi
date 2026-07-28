'use client'

import { useState, useRef, useEffect } from 'react'
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
import DialogVisualizzatore from './DialogVisualizzatore'
import OrdinePDF from './OrdinePDF'
import type { IntestazionePDF } from './OrdinePDF'
import StatoInvioOrdine from '@/components/produzione/StatoInvioOrdine'
import { formatEuro } from '@/lib/pricing'
import { formattaNumeroOrdine } from '@/lib/produzione'
import { deleteOrdine, setStatoOrdine } from '@/actions/produzione'
import { salvaPdfOrdine } from '@/actions/produzione-pdf'
import { getAllegatiOrdine } from '@/actions/produzione-allegati'
import { getDocumentoSignedUrl } from '@/actions/produzione-documenti'
import { unisciAllegatiAlPdf, type AllegatoDaUnire } from '@/lib/produzione-allegati-pdf'
import { STATI_ORDINE } from '@/types/produzione'
import type { OrdineCompleto, StatoOrdine, TrackingOrdine } from '@/types/produzione'
import type { StatoCommessa, DocumentoCommessa } from '@/types/commessa'

interface Props {
  commessa: { id: string; numero_commessa: string; cliente_nome: string; stato: StatoCommessa }
  ordini: OrdineCompleto[]
  fornitori: { id: string; nome: string; email: string | null }[]
  numeroProposto: string
  documenti: DocumentoCommessa[]
  intestazione: IntestazionePDF
  tracking: Record<string, TrackingOrdine>
}

export default function ProduzioneCommessa({
  commessa, ordini, fornitori, numeroProposto, documenti, intestazione, tracking,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [inModifica, setInModifica] = useState<OrdineCompleto | null>(null)
  const [viewer, setViewer] = useState<{ url: string; nome: string } | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  const emailFornitore = new Map(fornitori.map((f) => [f.id, f.email]))

  // Revoca l'ultimo object URL quando il componente viene smontato.
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

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

  // Scarica gli allegati dell'ordine come byte, per unirli al PDF.
  const scaricaAllegati = async (ordineId: string): Promise<AllegatoDaUnire[]> => {
    const allegati = await getAllegatiOrdine(ordineId)
    const risultati = await Promise.all(
      allegati.map(async (a): Promise<AllegatoDaUnire | null> => {
        const url = await getDocumentoSignedUrl(a.storage_path)
        if (!url) return null
        const resp = await fetch(url)
        if (!resp.ok) return null
        const bytes = await resp.arrayBuffer()
        return { nome: a.nome_file, bytes, contentType: a.content_type ?? '' }
      })
    )
    return risultati.filter((r): r is AllegatoDaUnire => r !== null)
  }

  const generaPdf = async (o: OrdineCompleto) => {
    const attesa = toast.loading('Generazione PDF in corso...')
    try {
      const nomeFile = `${formattaNumeroOrdine(o.numero_ordine) || `ORD ${o.id.slice(0, 8)}`}.pdf`
      const baseBlob = await pdf(
        <OrdinePDF
          ordine={o}
          intestazione={intestazione}
          fornitoreNome={o.fornitore_nome ?? 'Fornitore non indicato'}
          numeroCommessa={commessa.numero_commessa}
          clienteNome={commessa.cliente_nome}
        />
      ).toBlob()

      // Accoda gli allegati (foto/PDF) in fondo al documento.
      const baseBuffer = await baseBlob.arrayBuffer()
      let finaleBytes: Uint8Array = new Uint8Array(baseBuffer)
      const allegati = await scaricaAllegati(o.id)
      if (allegati.length > 0) {
        const { bytes, saltati } = await unisciAllegatiAlPdf(baseBuffer, allegati)
        finaleBytes = bytes
        if (saltati.length > 0) {
          toast.warning(`Allegati non inclusi (formato non supportato): ${saltati.join(', ')}`)
        }
      }

      // Copia ArrayBuffer-backed per Blob/Buffer (pdf-lib restituisce ArrayBufferLike).
      const outBytes = new Uint8Array(finaleBytes)
      const blob = new Blob([outBytes], { type: 'application/pdf' })

      // Mostra il PDF completo nel visualizzatore in-app.
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
      const objectUrl = URL.createObjectURL(blob)
      blobUrlRef.current = objectUrl
      setViewer({ url: objectUrl, nome: nomeFile })

      // Archivia e lega il PDF all'ordine (è quello che riceve il fornitore).
      const base64 = Buffer.from(outBytes).toString('base64')
      const { error } = await salvaPdfOrdine(o.id, commessa.id, base64, nomeFile)
      toast.dismiss(attesa)
      if (error) toast.error(`PDF mostrato ma non archiviato: ${error}`)
      else router.refresh()
    } catch (e) {
      toast.dismiss(attesa)
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
                  <th className="p-2 font-medium text-center">Invio</th>
                  <th className="p-2 font-medium text-right">Totale</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {ordini.map((o) => (
                  <tr key={o.id} className="border-t border-gray-200 dark:border-gray-800">
                    <td className="p-2">{formattaNumeroOrdine(o.numero_ordine) || '—'}</td>
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
                    <td className="p-2 text-center">
                      <StatoInvioOrdine tracking={tracking[o.id]} inviatoAt={o.inviato_at} />
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

      <DialogVisualizzatore
        url={viewer?.url ?? null}
        nome={viewer?.nome ?? ''}
        onClose={() => setViewer(null)}
      />
    </div>
  )
}
