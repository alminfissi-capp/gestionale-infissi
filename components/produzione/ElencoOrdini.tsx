'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, AlertTriangle, Eye, Mail, Warehouse } from 'lucide-react'
import { pdf } from '@react-pdf/renderer'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import DialogOrdine from './DialogOrdine'
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
import { conFallbackInvio, righeFooterPdf, TRACKING_VUOTO } from '@/lib/produzione-tracking'
import { STATI_ORDINE } from '@/types/produzione'
import type { OrdineConContesto, OrdineCompleto, StatoOrdine, CommessaOpzione, TrackingOrdine } from '@/types/produzione'

interface Props {
  ordini: OrdineConContesto[]
  fornitori: { id: string; nome: string; email: string | null }[]
  commesse: CommessaOpzione[]
  numeroProposto: string
  intestazione: IntestazionePDF
  tracking: Record<string, TrackingOrdine>
}

export default function ElencoOrdini({
  ordini, fornitori, commesse, numeroProposto, intestazione, tracking,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [inModifica, setInModifica] = useState<OrdineCompleto | null>(null)
  const [viewer, setViewer] = useState<{ url: string; nome: string } | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  const emailFornitore = new Map(fornitori.map((f) => [f.id, f.email]))

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

  const inviaEmail = async (o: OrdineConContesto) => {
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

  /**
   * Renderizza il PDF dell'ordine e vi unisce gli allegati. `trackingPerPdf`
   * è `undefined` per la copia da archiviare (mai footer: è quella che
   * raggiungerà il fornitore) e valorizzato per la copia mostrata a video.
   * `avvisaAllegatiSaltati` evita il doppio toast quando si renderizza due volte.
   */
  const renderizzaPdf = async (
    o: OrdineConContesto,
    trackingPerPdf: TrackingOrdine | undefined,
    allegati: AllegatoDaUnire[],
    avvisaAllegatiSaltati: boolean
  ): Promise<Uint8Array<ArrayBuffer>> => {
    const numeroCommessa = o.commessa_id ? (o.numero_commessa || 'Commessa') : 'Magazzino'
    const clienteNome = o.commessa_id ? (o.cliente_nome || '') : ''
    const baseBlob = await pdf(
      <OrdinePDF
        ordine={o}
        intestazione={intestazione}
        fornitoreNome={o.fornitore_nome ?? 'Fornitore non indicato'}
        numeroCommessa={numeroCommessa}
        clienteNome={clienteNome}
        tracking={trackingPerPdf}
      />
    ).toBlob()

    const baseBuffer = await baseBlob.arrayBuffer()
    let finaleBytes: Uint8Array = new Uint8Array(baseBuffer)
    if (allegati.length > 0) {
      const { bytes, saltati } = await unisciAllegatiAlPdf(baseBuffer, allegati)
      finaleBytes = bytes
      if (saltati.length > 0 && avvisaAllegatiSaltati) {
        toast.warning(`Allegati non inclusi (formato non supportato): ${saltati.join(', ')}`)
      }
    }
    return new Uint8Array(finaleBytes)
  }

  const generaPdf = async (o: OrdineConContesto) => {
    const attesa = toast.loading('Generazione PDF in corso...')
    try {
      const nomeFile = `${formattaNumeroOrdine(o.numero_ordine) || `ORD ${o.id.slice(0, 8)}`}.pdf`
      const trackingOrdine = conFallbackInvio(tracking[o.id] ?? TRACKING_VUOTO, o.inviato_at)
      const allegati = await scaricaAllegati(o.id)

      // Copia da archiviare: sempre senza footer, è quella che finirà al fornitore.
      const archivioBytes = await renderizzaPdf(o, undefined, allegati, true)

      // Copia da mostrare: con footer solo se c'è già uno storico di invio da raccontare.
      const righeFooter = righeFooterPdf(trackingOrdine)
      const outBytes = righeFooter.length > 0
        ? await renderizzaPdf(o, trackingOrdine, allegati, false)
        : archivioBytes

      const blob = new Blob([outBytes], { type: 'application/pdf' })

      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
      const objectUrl = URL.createObjectURL(blob)
      blobUrlRef.current = objectUrl
      setViewer({ url: objectUrl, nome: nomeFile })

      const base64 = Buffer.from(archivioBytes).toString('base64')
      const { error } = await salvaPdfOrdine(o.id, o.commessa_id, base64, nomeFile)
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Ordini fornitore</h2>
        <Button size="sm" className="gap-2" onClick={() => { setInModifica(null); setOpen(true) }}>
          <Plus className="h-4 w-4" /> Nuovo ordine
        </Button>
      </div>

      {ordini.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 border border-dashed rounded-lg p-6 text-center">
          Nessun ordine.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr className="text-left text-gray-500 dark:text-gray-400">
                <th className="p-2 font-medium">Numero</th>
                <th className="p-2 font-medium">Fornitore</th>
                <th className="p-2 font-medium">Commessa</th>
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
                    {o.commessa_id ? (
                      <span className="text-gray-900 dark:text-gray-100">
                        {o.numero_commessa || 'Commessa'}
                        {o.cliente_nome ? <span className="text-gray-500 dark:text-gray-400"> · {o.cliente_nome}</span> : null}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400">
                        <Warehouse className="h-3.5 w-3.5" /> Magazzino
                      </span>
                    )}
                  </td>
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

      <DialogOrdine
        open={open}
        onOpenChange={setOpen}
        commessaId={null}
        ordine={inModifica}
        fornitori={fornitori}
        numeroProposto={numeroProposto}
        commesse={commesse}
      />

      <DialogVisualizzatore
        url={viewer?.url ?? null}
        nome={viewer?.nome ?? ''}
        onClose={() => setViewer(null)}
      />
    </div>
  )
}
